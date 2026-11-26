const test = require('node:test');
const assert = require('node:assert');
const { ACTION_META, RUN_FILES, buildBundledSequences, frameIndices } = require('../lib/sequences');
const { RUN_FRAMES, RUN_FRAME_MS } = require('../lib/run');

test('内置猫奔跑序列：8 帧齐备才成循环，缺帧退回 null', () => {
  assert.equal(RUN_FILES.length, RUN_FRAMES);
  assert.equal(RUN_FILES[0], 'cat-3d-run-1.png');
  const full = buildBundledSequences((f) => 'data:' + f);
  assert.equal(full.run.frames.length, RUN_FRAMES);
  assert.equal(full.run.frameMs, RUN_FRAME_MS);
  assert.deepEqual(full.run.frames, RUN_FILES.map((f) => 'data:' + f), '文件名顺序即播放顺序');
  assert.equal(buildBundledSequences(() => null).run, null, '素材全缺时为 null');
  assert.equal(buildBundledSequences((f) => /run-[123]\.png$/.test(f) ? 'data:' + f : null).run, null, '少于 4 帧凑不出步态');
  assert.equal(buildBundledSequences((f) => /run-[1234]\.png$/.test(f) ? 'data:' + f : null).run.frames.length, 4);
});

test('动作元数据合法：时长/帧时长/过渡时长', () => {
  for (const [name, m] of Object.entries(ACTION_META)) {
    assert.ok(m.ms > 0, `${name} 总时长`);
    assert.ok(m.frameMs > 0, `${name} 帧时长`);
    assert.ok(m.fadeMs >= 0 && m.fadeMs <= m.frameMs, `${name} 过渡不应长于帧`);
    assert.ok(m.ms >= m.frameMs, `${name} 总时长应覆盖至少一帧`);
  }
});

test('内置序列：每帧都取到 dataURL，缺帧自动跳过', () => {
  const url = (f) => 'data:' + f;
  const seq = buildBundledSequences(url);
  assert.equal(seq.walk.frames.length, 4, '走路四帧');
  assert.equal(seq.actions.roll.frames.length, 5, '打滚五帧');
  assert.equal(seq.actions.groom.frames.length, 4);
  assert.equal(seq.actions.eat.frames.length, 4);
  assert.equal(seq.actions.drink.frames.length, 4);
  assert.equal(seq.actions.sleep.frames.length, 2);
  assert.equal(seq.actions.stretch.frames.length, 4, "伸懒腰从前爪探出开始");
  const partial = buildBundledSequences((f) => (f === 'act-roll-3.png' ? null : 'x:' + f));
  assert.equal(partial.actions.roll.frames.length, 4, '缺失帧被跳过');
});

test('frameIndices：循环播放且数量与总时长匹配', () => {
  assert.deepEqual(frameIndices(0, 700, 3), []);
  assert.deepEqual(frameIndices(2100, 700, 3), [0, 1, 2]);
  assert.deepEqual(frameIndices(3000, 700, 3), [0, 1, 2, 0, 1]);
  assert.deepEqual(frameIndices(1000, 0, 4), [0]);
});

test('舔毛转耳帧：与原帧一一对应，缺任一变体整组不给', () => {
  const full = buildBundledSequences((f) => 'data:' + f);
  const g = full.actions.groom;
  assert.equal(g.earFrames.length, g.frames.length);
  g.frames.forEach((u, i) => assert.equal(g.earFrames[i], u.replace(/\.png$/, '-ear.png')));
  const noEar = buildBundledSequences((f) => (f === 'act-groom-3-ear.png' ? null : 'data:' + f));
  assert.equal(noEar.actions.groom.earFrames, undefined, '缺一张就不给，免得帧序错位');
});

test('内置转耳素材都在仓库里，并与原帧同尺寸', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { GROOM_FILES, earName } = require('../lib/sequences');
  const size = (p) => { const b = fs.readFileSync(p); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  for (const f of [...GROOM_FILES, 'cat-3d-idle.png']) {
    const a = path.join(__dirname, '..', 'assets', f);
    const e = path.join(__dirname, '..', 'assets', earName(f));
    assert.ok(fs.existsSync(e), earName(f));
    assert.deepEqual(size(e), size(a), `${f} 尺寸一致`);
  }
});

test('行为真帧：整条序列齐备才给，缺一帧整条跳过；姿态按文件逐个给', () => {
  const { BEHAVIOR_FILES, POSE_FILES } = require('../lib/sequences');
  const all = buildBundledSequences((f) => 'data:' + f);
  assert.deepStrictEqual(Object.keys(all.behaviors).sort(), Object.keys(BEHAVIOR_FILES).sort());
  assert.deepStrictEqual(Object.keys(all.poses).sort(), Object.keys(POSE_FILES).sort());
  Object.values(all.behaviors).forEach((b) => {
    assert.ok(b.frames.length >= 2 && b.frameMs > 0 && b.fadeMs >= 0 && b.fadeMs <= b.frameMs);
  });
  const noKnead2 = buildBundledSequences((f) => (f === 'act-knead-2.png' ? null : 'data:' + f));
  assert.strictEqual(noKnead2.behaviors.knead, undefined);
  assert.ok(noKnead2.behaviors.loaf);
  const noSniff = buildBundledSequences((f) => (f === POSE_FILES.sniff ? null : 'data:' + f));
  assert.strictEqual(noSniff.poses.sniff, undefined);
  assert.ok(noSniff.poses.crouch);
});

test('入睡与醒来走过渡链：settle 从坐下到趴好，rise 先睁眼再撑起；起步收步有单独姿态', () => {
  const all = buildBundledSequences((f) => 'data:' + f);
  assert.deepStrictEqual(all.behaviors.settle.frames, ['data:act-sit-down.png', 'data:act-settle-1.png', 'data:act-settle-2.png', 'data:act-settle-3.png']);
  assert.strictEqual(all.behaviors.rise.frames[0], 'data:act-wake-1.png');
  assert.strictEqual(all.behaviors.yawn.frames.length, 5, '哈欠张嘴再合上');
  ['groomStart', 'stepOut', 'stepIn'].forEach((k) => assert.ok(all.poses[k], k));
  const noSettle2 = buildBundledSequences((f) => (f === 'act-settle-2.png' ? null : 'data:' + f));
  assert.strictEqual(noSettle2.behaviors.settle, undefined, '缺帧就直接睡，不播半截');
});

test('行为与姿态素材都在仓库里，尺寸与母版画布一致、脚底对齐', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { BEHAVIOR_FILES, POSE_FILES } = require('../lib/sequences');
  const files = new Set(Object.values(POSE_FILES));
  Object.values(BEHAVIOR_FILES).forEach((b) => b.files.forEach((f) => files.add(f)));
  files.forEach((f) => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'assets', f)), f);
    if (f.startsWith('act-stretch-')) return;               // 旧伸懒腰帧另有画布，由动作播放器按 contain 适配
    const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', f));
    assert.strictEqual(buf.readUInt32BE(16), 360, f + ' 宽');
    assert.ok(buf.readUInt32BE(20) >= 270 && buf.readUInt32BE(20) <= 290, f + ' 高');
  });
});
