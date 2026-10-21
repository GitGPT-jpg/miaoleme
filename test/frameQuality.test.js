const test = require('node:test');
const assert = require('node:assert');
const { analyzeFrame } = require('../lib/frameQuality');

function solid(w, h, rect) {
  const b = Buffer.alloc(w * h * 4, 0);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) b[(y * w + x) * 4 + 3] = 255;
  }
  return b;
}

test('正常帧通过，返回包围盒', () => {
  const bmp = solid(100, 100, { x: 20, y: 20, w: 50, h: 60 });
  const r = analyzeFrame(bmp, 100, 100);
  assert.equal(r.ok, true);
  assert.deepEqual(r.bbox, { x: 20, y: 20, w: 50, h: 60 });
});

test('空帧/过稀疏帧拒绝', () => {
  assert.equal(analyzeFrame(Buffer.alloc(100 * 100 * 4), 100, 100).reason, 'empty');
  const tiny = solid(100, 100, { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(analyzeFrame(tiny, 100, 100).reason, 'too_small');
  // 大包围盒但只有边框（内容极少）→ sparse
  const sparse = Buffer.alloc(100 * 100 * 4, 0);
  for (let i = 10; i < 90; i++) {
    sparse[(10 * 100 + i) * 4 + 3] = 255;
    sparse[(89 * 100 + i) * 4 + 3] = 255;
    sparse[(i * 100 + 10) * 4 + 3] = 255;
    sparse[(i * 100 + 89) * 4 + 3] = 255;
  }
  const r = analyzeFrame(sparse, 100, 100);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'sparse');
});

test('碎裂帧拒绝（多个独立大块）', () => {
  let bmp = solid(200, 200, { x: 10, y: 10, w: 40, h: 40 });
  bmp = Buffer.concat([bmp]); // copy
  // 再加两个大块
  const add = (rect) => {
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) bmp[(y * 200 + x) * 4 + 3] = 255;
  };
  add({ x: 120, y: 10, w: 40, h: 40 });
  add({ x: 10, y: 120, w: 40, h: 40 });
  const r = analyzeFrame(bmp, 200, 200);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'fragmented');
});

test('与参考帧比例失衡拒绝', () => {
  const ref = { w: 100, h: 100 };
  const tall = solid(400, 400, { x: 10, y: 10, w: 100, h: 380 }); // h 3.8x
  assert.equal(analyzeFrame(tall, 400, 400, { ref }).reason, 'height_out_of_range');
  const wide = solid(400, 400, { x: 5, y: 100, w: 380, h: 100 });
  assert.equal(analyzeFrame(wide, 400, 400, { ref }).reason, 'width_out_of_range');
});
