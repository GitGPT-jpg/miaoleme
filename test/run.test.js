// 奔跑节拍与选帧：硬切索引、dt 位移、真帧优先（有 runSeq 时不走兜底）
const test = require('node:test');
const assert = require('node:assert');
const RunMath = require('../lib/run');

test('帧间隔由速度与步幅反推，并夹在 70–90ms', () => {
  assert.equal(RunMath.cycleFrameMs(90, 58, 8), 81);
  assert.equal(RunMath.RUN_FRAME_MS, RunMath.cycleFrameMs());
  assert.ok(RunMath.RUN_FRAME_MS >= 70 && RunMath.RUN_FRAME_MS <= 90);
  assert.equal(RunMath.cycleFrameMs(900, 58, 8), 70, '速度极快时取下限');
  assert.equal(RunMath.cycleFrameMs(9, 58, 8), 90, '速度极慢时取上限');
});

test('硬切索引：按时间整帧推进并循环', () => {
  assert.equal(RunMath.runFrameIndex(0, 80, 8), 0);
  assert.equal(RunMath.runFrameIndex(79, 80, 8), 0);
  assert.equal(RunMath.runFrameIndex(80, 80, 8), 1);
  assert.equal(RunMath.runFrameIndex(640, 80, 8), 0, '8 帧一个循环');
  assert.equal(RunMath.runFrameIndex(700, 80, 8), 0);
  assert.equal(RunMath.runFrameIndex(-5, 80, 8), 0, '负数时间按 0 处理');
  assert.equal(RunMath.runFrameIndex(100, 0, 8), 0, '非法帧长不崩');
  assert.equal(RunMath.runFrameIndex(100, 80, 0), 0, '零帧不崩');
});

test('位移按 dt 推进：90 px/s，dt 上限 50ms', () => {
  assert.ok(Math.abs(RunMath.runStep(1 / 60) - 1.5) < 0.01);
  assert.equal(RunMath.runStep(10), 4.5, '切后台回来不瞬移（dt 夹到 50ms）');
  assert.equal(RunMath.runStep(-1), 0);
  assert.equal(RunMath.runStep(NaN), 0);
  assert.equal(RunMath.runStep(0.05, 180), 9, '速度可覆盖');
});

test('一个步态循环的位移与步幅一致（步频与位移匹配）', () => {
  const cycleMs = RunMath.RUN_FRAME_MS * RunMath.RUN_FRAMES;
  const moved = RunMath.RUN_SPEED * (cycleMs / 1000);
  assert.ok(Math.abs(moved - RunMath.RUN_STRIDE_PX) <= 2, `循环位移 ${moved} 应接近步幅 ${RunMath.RUN_STRIDE_PX}`);
});

test('选帧：有真帧序列就不走走路帧兜底', () => {
  const real = RunMath.pickRunFrames({ frames: ['a', 'b', 'c', 'd'], frameMs: 75 }, ['w1', 'w2']);
  assert.deepEqual(real, { frames: ['a', 'b', 'c', 'd'], frameMs: 75, real: true });

  const noMs = RunMath.pickRunFrames({ frames: ['a', 'b'] }, ['w1', 'w2']);
  assert.equal(noMs.frameMs, RunMath.RUN_FRAME_MS, '缺 frameMs 用默认帧长');
  assert.equal(noMs.real, true);
});

test('选帧兜底：缺失/单帧/空洞序列回落到走路帧并放慢到 120ms', () => {
  for (const seq of [null, undefined, { frames: [] }, { frames: ['only'] }, { frames: [null, null] }]) {
    const r = RunMath.pickRunFrames(seq, ['w1', 'w2']);
    assert.deepEqual(r.frames, ['w1', 'w2']);
    assert.equal(r.frameMs, RunMath.WALK_FALLBACK_MS);
    assert.equal(r.real, false, '兜底必须标成非真帧（CSS 才会补缩放步态）');
  }
  assert.deepEqual(RunMath.pickRunFrames(null, null).frames, [], '连走路帧都没有时返回空');
});

test('真帧序列里的空洞被剔除', () => {
  const r = RunMath.pickRunFrames({ frames: ['a', null, 'b', undefined, 'c'] }, ['w']);
  assert.deepEqual(r.frames, ['a', 'b', 'c']);
  assert.equal(r.real, true);
});
