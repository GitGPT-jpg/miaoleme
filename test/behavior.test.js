const test = require('node:test');
const assert = require('node:assert');
const B = require('../lib/behavior');

const list = [
  { name: 'a', weight: 1 },
  { name: 'b', weight: 3 },
];

test('pickBehavior follows weights', () => {
  assert.strictEqual(B.pickBehavior(list, [], () => 0), 'a');
  assert.strictEqual(B.pickBehavior(list, [], () => 0.24), 'a');
  assert.strictEqual(B.pickBehavior(list, [], () => 0.26), 'b');
  assert.strictEqual(B.pickBehavior(list, [], () => 0.999), 'b');
});

test('pickBehavior skips recent and falls back when all recent', () => {
  assert.strictEqual(B.pickBehavior(list, ['b'], () => 0.9), 'a');
  assert.strictEqual(B.pickBehavior(list, ['a', 'b'], () => 0), 'a');
  assert.strictEqual(B.pickBehavior([], [], () => 0), null);
});

test('pushRecent keeps last n', () => {
  assert.deepStrictEqual(B.pushRecent(['x', 'y', 'z'], 'w', 3), ['y', 'z', 'w']);
  assert.deepStrictEqual(B.pushRecent(undefined, 'w'), ['w']);
});

test('vibePhase hysteresis', () => {
  assert.strictEqual(B.vibePhase('free', Infinity), 'free');
  assert.strictEqual(B.vibePhase('free', 500), 'typing');
  assert.strictEqual(B.vibePhase('typing', 4000), 'typing');
  assert.strictEqual(B.vibePhase('free', 4000), 'free');
  assert.strictEqual(B.vibePhase('typing', 6500), 'free');
  assert.strictEqual(B.vibePhase(undefined, 4000), 'free');
});

test('every default behavior has a positive weight and unique name', () => {
  const names = B.BEHAVIORS.map((b) => b.name);
  assert.strictEqual(new Set(names).size, names.length);
  assert.ok(B.BEHAVIORS.every((b) => b.weight > 0));
});

test('roamTargetX walks a real distance and stays on screen', () => {
  const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  const x = B.roamTargetX(600, 600, 20, 1180, seq([0.5, 0.9]));
  assert.ok(x - 600 >= 140, 'walks right at least 140px');
  assert.strictEqual(B.roamTargetX(1150, 1100, 20, 1180, seq([0.5, 0.9])), 860);
  assert.strictEqual(B.roamTargetX(30, 40, 20, 1180, seq([0.5, 0.1])), 320);
});

test('roamTargetX heads back toward home when it drifted far', () => {
  const x = B.roamTargetX(1000, 300, 20, 1180, () => 0.9);
  assert.ok(x < 1000);
});

test('circadianWeights：深夜更爱睡、傍晚更疯，不改原表', () => {
  const w = (l, n) => l.find((b) => b.name === n).weight;
  const base = B.BEHAVIORS.map((b) => b.weight);
  const night = B.circadianWeights(B.BEHAVIORS, 2);
  const dusk = B.circadianWeights(B.BEHAVIORS, 18);
  assert.ok(w(night, 'catnap') > w(B.BEHAVIORS, 'catnap'));
  assert.ok(w(night, 'zoomies') < w(B.BEHAVIORS, 'zoomies'));
  assert.ok(w(dusk, 'zoomies') > w(B.BEHAVIORS, 'zoomies'));
  assert.strictEqual(w(B.circadianWeights(B.BEHAVIORS, 26), 'catnap'), w(night, 'catnap'));
  assert.deepStrictEqual(B.BEHAVIORS.map((b) => b.weight), base);
  assert.notStrictEqual(night, B.BEHAVIORS);
});

test('新的真猫行为都在候选里，且有正权重', () => {
  const names = B.BEHAVIORS.map((b) => b.name);
  ['shake', 'earscratch', 'belly', 'chatter', 'sitlick', 'tailwrap'].forEach((n) => assert.ok(names.includes(n), n));
});

const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const share = (state, name, n = 4000) => {
  const r = seeded(7); let k = 0;
  for (let i = 0; i < n; i++) if (B.pickIntentional(state, r, 14) === name) k++;
  return k / n;
};

test('驱动值：活动耗体力攒困意，睡觉回体力消困意，始终夹在 0–1', () => {
  const d0 = B.createDrives();
  const tired = B.tickDrives(d0, 5 * 60000, 'active');
  assert.ok(tired.energy < d0.energy && tired.sleepiness > d0.sleepiness);
  const slept = B.tickDrives(tired, 3 * 60000, 'sleep');
  assert.ok(slept.energy > tired.energy && slept.sleepiness < tired.sleepiness);
  const huge = B.tickDrives(d0, 3600000, 'active');
  assert.ok(huge.energy >= 0 && huge.sleepiness <= 1);
});

test('刚睡醒的冷却期里绝不再选小睡，哪怕很困', () => {
  const state = { drives: { energy: 0.3, sleepiness: 0.95 }, last: 'catnap', recent: [], sinceWakeMs: 30000 };
  assert.strictEqual(share(state, 'catnap'), 0);
});

test('醒得够久又很困时，直接去睡', () => {
  const state = { drives: { energy: 0.3, sleepiness: 0.9 }, last: 'look', recent: [], sinceWakeMs: 10 * 60000 };
  assert.strictEqual(B.pickIntentional(state, () => 0.5, 14), 'catnap');
});

test('精神好时几乎不睡；走完一段更倾向张望或舔毛', () => {
  const fresh = { drives: { energy: 0.9, sleepiness: 0.1 }, recent: [], sinceWakeMs: 10 * 60000 };
  assert.ok(share({ ...fresh, last: 'walk' }, 'catnap') < 0.02);
  const afterWalk = share({ ...fresh, last: 'walk' }, 'look') + share({ ...fresh, last: 'walk' }, 'groom');
  const afterLoaf = share({ ...fresh, last: 'loaf' }, 'look') + share({ ...fresh, last: 'loaf' }, 'groom');
  assert.ok(afterWalk > afterLoaf * 1.5, `${afterWalk} vs ${afterLoaf}`);
});

test('跑累了以后不会紧接着再跑，更可能歇着舔毛', () => {
  const st = { drives: { energy: 0.2, sleepiness: 0.5 }, last: 'run', recent: [], sinceWakeMs: 10 * 60000 };
  assert.ok(share(st, 'run') + share(st, 'zoomies') < 0.02);
  assert.ok(share(st, 'groom') + share(st, 'sitlick') + share(st, 'loaf') > 0.25);
});

test('停留时长与小睡时长：困的猫停得更久、睡得更久，且注入 rand 时可复现', () => {
  const awake = { energy: 0.9, sleepiness: 0.1 }, sleepy = { energy: 0.3, sleepiness: 0.9 };
  assert.ok(B.dwellMs('loaf', sleepy, () => 0) > B.dwellMs('run', awake, () => 0));
  assert.strictEqual(B.dwellMs('walk', awake, () => 0.3), B.dwellMs('walk', awake, () => 0.3));
  assert.ok(B.napDurationMs(sleepy, () => 0) > B.napDurationMs(awake, () => 0));
  assert.ok(B.napDurationMs(awake, () => 0) >= 25000);
});

test('追猎链有前因后果：张望后更想潜行，扑完更想洗脸', () => {
  const fresh = { drives: { energy: 0.8, sleepiness: 0.2 }, recent: [], sinceWakeMs: 10 * 60000 };
  assert.ok(share({ ...fresh, last: 'look' }, 'sneak') > share({ ...fresh, last: 'loaf' }, 'sneak') * 2);
  assert.ok(share({ ...fresh, last: 'hunt' }, 'facewash') > share({ ...fresh, last: 'walk' }, 'facewash') * 2);
  assert.ok(share({ ...fresh, last: 'sneak' }, 'sneak') < share({ ...fresh, last: 'sneak' }, 'hunt'));
});

test('新行为的活动量分类与更长的停留', () => {
  assert.strictEqual(B.activityOf('sneak'), 'active');
  assert.strictEqual(B.activityOf('hunt'), 'active');
  assert.strictEqual(B.activityOf('blink'), 'rest');
  const d = { energy: 0.8, sleepiness: 0.2 };
  assert.ok(B.dwellMs('blink', d, () => 0) >= 6000 * 0.96 - 1);
  assert.ok(B.dwellMs('hunt', d, () => 0) >= 3000);
});
