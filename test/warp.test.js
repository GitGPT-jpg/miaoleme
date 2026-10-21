const test = require('node:test');
const assert = require('node:assert');
const { bandOffsets, stepSpring, nextSaccade } = require('../lib/warp');

test('分带偏移：顶部最大、底部趋近 0、方向正确', () => {
  const bands = bandOffsets(1, -1, 3, 12, 8);
  assert.equal(bands.length, 3);
  assert.ok(Math.abs(bands[0].x) > Math.abs(bands[1].x));
  assert.ok(Math.abs(bands[1].x) > Math.abs(bands[2].x));
  assert.ok(bands[0].x > 0 && bands[0].y < 0);
  assert.deepEqual(bandOffsets(0, 0, 3), [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
});

test('弹簧：收敛到目标且不爆炸', () => {
  let s = { x: 0, v: 0 };
  for (let i = 0; i < 300; i++) s = stepSpring(s, 1, 1 / 30, 120, 16);
  assert.ok(Math.abs(s.x - 1) < 0.01, `x=${s.x}`);
  assert.ok(Math.abs(s.v) < 0.02, `v=${s.v}`);
  assert.ok(Number.isFinite(s.x));
  // 目标突变后仍有惯性（速度不为 0）
  const after = stepSpring({ x: 1, v: 0 }, 0, 1 / 30, 120, 16);
  assert.ok(after.v < 0);
});

test('saccade：时间单调且偏移在范围内', () => {
  let seed = 0.7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const r = nextSaccade(10, rnd);
  assert.ok(r.until > 10 && r.nextAt > r.until);
  assert.ok(Math.abs(r.dx) <= 2.4 && Math.abs(r.dy) <= 1.4);
});
