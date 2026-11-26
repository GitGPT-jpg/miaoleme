const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/arrow');
const { normalizeState } = require('../lib/store');

test('caught arrow is returned exactly once, across a restart', () => {
  let pa = A.markCaught(null, 1000);
  assert.strictEqual(A.shouldReturn(pa, 'startup'), true);
  pa = A.markReturned(pa);
  // 重启：经过持久化与归一化后不会再还第二次
  const restored = normalizeState(JSON.parse(JSON.stringify({ paperArrow: pa }))).paperArrow;
  assert.strictEqual(A.shouldReturn(restored, 'startup'), false);
  assert.strictEqual(A.shouldReturn(restored, 'pomo-break'), false);
});

test('a held arrow survives a restart and waits for a valid moment', () => {
  const pa = A.markCaught({}, 5);
  const restored = normalizeState({ paperArrow: pa }).paperArrow;
  assert.strictEqual(restored.held, true);
  assert.strictEqual(A.shouldReturn(restored, 'random'), false);
  assert.strictEqual(A.shouldReturn(restored, 'pomo-break'), true);
});

test('a second catch while holding keeps the same arrow', () => {
  const a = A.markCaught({}, 10);
  const b = A.markCaught(a, 99);
  assert.strictEqual(b.heldAt, 10);
});
