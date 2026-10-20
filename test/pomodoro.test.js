const test = require('node:test');
const assert = require('node:assert');
const { restorePomodoro, pomoSnapshot } = require('../lib/pomodoro');

const now = 1_000_000;

test('未激活/空/损坏的存档 → idle（不启动计时器）', () => {
  assert.deepEqual(restorePomodoro(null, now), { action: 'idle' });
  assert.deepEqual(restorePomodoro({ active: false, phase: 'work', endTs: now + 1000 }, now), { action: 'idle' });
  assert.deepEqual(restorePomodoro({ active: true, phase: 'nap', endTs: now + 1000 }, now), { action: 'idle' });
  assert.deepEqual(restorePomodoro({ active: true, phase: 'work', endTs: 'x' }, now), { action: 'idle' });
  assert.deepEqual(restorePomodoro({ active: true, phase: 'work', endTs: 0 }, now), { action: 'idle' });
});

test('未到期的专注/休息 → resume 且剩余时间正确', () => {
  const r = restorePomodoro({ active: true, phase: 'work', endTs: now + 5 * 60 * 1000 }, now);
  assert.equal(r.action, 'resume');
  assert.equal(r.phase, 'work');
  assert.equal(r.remainMs, 5 * 60 * 1000);
  const b = restorePomodoro({ active: true, phase: 'break', endTs: now + 1000 }, now);
  assert.deepEqual(b, { action: 'resume', phase: 'break', remainMs: 1000 });
});

test('已过期 → expired（不返回任何完成次数，避免虚构）', () => {
  const r = restorePomodoro({ active: true, phase: 'work', endTs: now - 1 }, now);
  assert.deepEqual(r, { action: 'expired', phase: 'work' });
  const r2 = restorePomodoro({ active: true, phase: 'break', endTs: now - 9000 }, now);
  assert.deepEqual(r2, { action: 'expired', phase: 'break' });
});

test('快照：仅在激活时持久化', () => {
  assert.equal(pomoSnapshot({ active: false, phase: 'work', endTs: 0 }), null);
  assert.deepEqual(pomoSnapshot({ active: true, phase: 'work', endTs: 123 }), { active: true, phase: 'work', endTs: 123 });
});
