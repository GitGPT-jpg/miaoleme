const test = require('node:test');
const assert = require('node:assert');
const { alphaBBox, alphaStats, heightScale, seqCanvas, seqPlacements } = require('../lib/frameNorm');

function makeBitmap(w, h, rect) {
  const b = Buffer.alloc(w * h * 4, 0);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      b[(y * w + x) * 4 + 3] = 255;
    }
  }
  return b;
}

test('alpha 包围盒：空图返回 null，矩形返回精确边界', () => {
  assert.equal(alphaBBox(Buffer.alloc(10 * 10 * 4, 0), 10, 10), null);
  const bmp = makeBitmap(20, 20, { x: 3, y: 4, w: 5, h: 6 });
  assert.deepEqual(alphaBBox(bmp, 20, 20), { x: 3, y: 4, w: 5, h: 6 });
});

test('缩放比例：目标高度、上下限钳制', () => {
  assert.equal(heightScale(170, 340), 2);
  assert.equal(heightScale(0, 340), 1);
  assert.equal(heightScale(1, 340), 3, '上限 3');
  assert.equal(heightScale(2000, 340), 0.5, '下限 0.5');
});

test('alpha 统计：质心落在像素重心而非包围盒中心', () => {
  assert.equal(alphaStats(Buffer.alloc(10 * 10 * 4, 0), 10, 10), null);
  // 左侧 10px 宽的「躯干」+ 右侧 1px 宽的「伸出的腿」：包围盒中心在 10.5，质心应偏左
  const w = 40;
  const b = Buffer.alloc(w * 20 * 4, 0);
  for (let y = 5; y < 15; y++) {
    for (let x = 0; x < 10; x++) b[(y * w + x) * 4 + 3] = 255;
    b[(y * w + 20) * 4 + 3] = 255;
  }
  const st = alphaStats(b, w, 20);
  assert.deepEqual({ x: st.x, y: st.y, w: st.w, h: st.h }, { x: 0, y: 5, w: 21, h: 10 });
  const boxCenter = st.x + st.w / 2;      // 10.5：被伸出的腿拉偏
  assert.ok(Math.abs(st.cx - 5.91) < 0.05, `质心 ${st.cx} 应由躯干像素主导`);
  assert.ok(st.cx < boxCenter - 4, '质心明显比包围盒中心更靠躯干');
});

test('序列公用画布：贴合整组范围，最高帧对齐目标高度', () => {
  assert.equal(seqCanvas([], 190), null);
  const stats = [
    { x: 100, y: 100, w: 200, h: 220, cx: 200 },
    { x: 60, y: 160, w: 360, h: 150, cx: 240 }
  ];
  const c = seqCanvas(stats, 190, 6);
  // 缩放 = 190/220；画布高度 = 190 + 两侧 pad
  assert.equal(c.h, Math.ceil(220 * (190 / 220)) + 12);
  const spanW = Math.max(200 - 100, 240 - 60) + Math.max(300 - 200, 420 - 240);   // 最大左展 + 最大右展
  assert.equal(c.w, Math.ceil(spanW * (190 / 220)) + 12);
  const plan = seqPlacements(stats, c.w, c.h, 190, 6);
  assert.ok(Math.abs(plan.scale - 190 / 220) < 1e-9, '画布由同一缩放推出，不再二次压缩');
  // 极宽序列：画布宽度被 maxW 夹住，缩放随之变小
  const wide = seqCanvas([{ x: 0, y: 0, w: 2000, h: 100, cx: 1000 }], 190, 6, 520);
  assert.ok(wide.w <= 520);
});

test('序列整组摆放：共享缩放 + 脚底同基线 + 质心同竖线', () => {
  // 第 1 帧收拢（高）、第 2 帧伸展（扁而长），模仿 PASSING / FLIGHT
  const stats = [
    { x: 100, y: 100, w: 200, h: 220, cx: 200 },
    { x: 60, y: 160, w: 360, h: 150, cx: 240 }
  ];
  const plan = seqPlacements(stats, 440, 220, 190, 6);
  assert.ok(plan);
  assert.equal(plan.items.length, 2);
  // 整组一个缩放系数：两帧的高宽比例关系保持原样
  const r0 = plan.items[0].h / stats[0].h;
  const r1 = plan.items[1].h / stats[1].h;
  assert.ok(Math.abs(r0 - r1) < 0.02, `两帧缩放应一致：${r0} vs ${r1}`);
  assert.ok(plan.scale <= 190 / 220 + 1e-9, '不得超过目标高度对应的缩放');
  for (const it of plan.items) {
    assert.equal(it.dy + it.h, plan.canvas.h - plan.pad, '脚底对齐同一基线');
    assert.ok(it.dx >= 0 && it.dx + it.w <= plan.canvas.w, '帧必须落在画布内');
    assert.ok(it.dy >= 0 && it.dy + it.h <= plan.canvas.h);
  }
  for (let i = 0; i < stats.length; i++) {
    const cx = plan.items[i].dx + (stats[i].cx - stats[i].x) * plan.scale;
    assert.ok(Math.abs(cx - plan.anchorX) <= 1, `质心应对齐同一竖线：${cx} vs ${plan.anchorX}`);
  }
});

test('序列公用画布：只缩不放，源帧比目标小时按原尺寸重排', () => {
  const stats = [
    { x: 0, y: 0, w: 300, h: 190, cx: 150 },
    { x: 0, y: 0, w: 260, h: 150, cx: 130 }
  ];
  const c = seqCanvas(stats, 230, 6);   // targetH 230 > 最高帧 190
  assert.equal(c.h, 190 + 12, '不得放大到 230');
  const plan = seqPlacements(stats, c.w, c.h, 230, 6);
  assert.ok(plan.scale <= 1 + 1e-9, `缩放不得 > 1（实际 ${plan.scale}）`);
  assert.equal(plan.items[0].h, 190, '最高帧保持原始高度');
});

test('序列整组摆放：超宽序列按画布缩放，空输入返回 null', () => {
  assert.equal(seqPlacements([], 440, 220, 190), null);
  assert.equal(seqPlacements(null, 440, 220, 190), null);
  assert.equal(seqPlacements([{ x: 0, y: 0, w: 0, h: 0, cx: 0 }], 440, 220, 190), null);
  const wide = seqPlacements([{ x: 0, y: 0, w: 900, h: 100, cx: 450 }], 440, 220, 190, 6);
  assert.ok(wide.items[0].w <= 440 - 12, '过宽的帧按画布宽度收缩');
  assert.ok(wide.scale < 190 / 100, '宽度成为约束时不再按目标高度放大');
});
