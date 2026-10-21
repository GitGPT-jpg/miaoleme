const test = require('node:test');
const assert = require('node:assert');
const { ACTION_META, buildBundledSequences, frameIndices } = require('../lib/sequences');

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
  assert.equal(seq.actions.stretch.frames.length, 3);
  const partial = buildBundledSequences((f) => (f === 'act-roll-3.png' ? null : 'x:' + f));
  assert.equal(partial.actions.roll.frames.length, 4, '缺失帧被跳过');
});

test('frameIndices：循环播放且数量与总时长匹配', () => {
  assert.deepEqual(frameIndices(0, 700, 3), []);
  assert.deepEqual(frameIndices(2100, 700, 3), [0, 1, 2]);
  assert.deepEqual(frameIndices(3000, 700, 3), [0, 1, 2, 0, 1]);
  assert.deepEqual(frameIndices(1000, 0, 4), [0]);
});
