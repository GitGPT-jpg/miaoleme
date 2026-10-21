const test = require('node:test');
const assert = require('node:assert');
const { gazeFromOffset, smooth } = require('../lib/gaze');

test('视线归一化与边界', () => {
  assert.deepEqual(gazeFromOffset(0, 0), { x: 0, y: 0 });
  assert.deepEqual(gazeFromOffset(300, -300, 600), { x: 0.5, y: -0.5 });
  assert.deepEqual(gazeFromOffset(9999, -9999, 600), { x: 1, y: -1 });
  assert.deepEqual(gazeFromOffset(NaN, 1), { x: 0, y: 0 });
});

test('平滑收敛：逐步接近目标且不过冲', () => {
  let v = 0;
  for (let i = 0; i < 40; i++) v = smooth(v, 1, 0.15);
  assert.ok(v > 0.99 && v <= 1);
  assert.equal(smooth(0, 1, 0), 0);
  assert.equal(smooth(0, 1, 1), 1);
});
