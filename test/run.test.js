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

test('播放顺序按体长交替：收拢 → 过渡 → 伸展 → 过渡', () => {
  // 体长（归一化后的帧宽），乱序给入
  const len = [300, 160, 290, 200, 310, 150, 240, 260];
  const order = RunMath.orderRunCycle(len);
  assert.equal(order.length, 8);
  assert.deepEqual([...order].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7], '必须是一个排列，不丢帧不重复');
  const seq = order.map((i) => len[i]);
  assert.equal(seq[0], 150, '最收拢的帧开头');
  assert.equal(seq[2], 310, '第 3 帧是最伸展');
  assert.equal(seq[4], 160, '第 5 帧回到次收拢');
  assert.equal(seq[6], 300, '第 7 帧是次伸展');
  // 收拢帧与伸展帧必须交替出现，不能两个极端挨在一起
  assert.ok(seq[1] > seq[0] && seq[1] < seq[2], '过渡帧落在两极之间');
  assert.ok(seq[5] > seq[4] && seq[5] < seq[6], '过渡帧落在两极之间');
});

test('播放顺序：帧数不足或非法输入不乱序', () => {
  assert.deepEqual(RunMath.orderRunCycle([5, 1, 3]), [0, 1, 2], '少于 4 帧保持原序');
  assert.deepEqual(RunMath.orderRunCycle([]), []);
  assert.deepEqual(RunMath.orderRunCycle(null), []);
  for (const n of [4, 5, 6, 7, 8]) {
    const arr = Array.from({ length: n }, (_, i) => (i * 37) % 100);
    const ord = RunMath.orderRunCycle(arr);
    assert.deepEqual([...ord].sort((a, b) => a - b), arr.map((_, i) => i), `${n} 帧也必须是完整排列`);
  }
});
