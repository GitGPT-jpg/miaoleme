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
