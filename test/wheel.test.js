const test = require('node:test');
const assert = require('node:assert');
const { segmentAngle, spinRotation, landedIndex, spinPlan } = require('../lib/wheel');

test('任意扇区数：计划落点与目标索引一致', () => {
  for (let count = 2; count <= 16; count++) {
    for (let idx = 0; idx < count; idx++) {
      const plan = spinPlan(count, idx);
      assert.equal(plan.landed, idx, `count=${count} idx=${idx}`);
    }
  }
});

test('落点反推：旋转整圈不改变落点', () => {
  for (let turns = 0; turns <= 6; turns++) {
    const r = spinRotation(8, 3, turns);
    assert.equal(landedIndex(r, 8), 3, `turns=${turns}`);
  }
});

test('扇区边界：中心附近与边界值', () => {
  const n = 8;
  const seg = segmentAngle(n); // 45
  assert.equal(landedIndex(0, n), 0);
  assert.equal(landedIndex(-seg / 2, n), 0);
  assert.equal(landedIndex(-seg - 0.01, n), 1);
  assert.equal(landedIndex(360 - seg / 2, n), 0);
});

test('负角度/大角度均归一化正确', () => {
  assert.equal(landedIndex(-45, 8), 1);
  assert.equal(landedIndex(-3600 - 45, 8), 1);
  assert.equal(landedIndex(3600 + 202.5, 8), 3);
});

test('指针位置与结果不一致的回归：牛肉面场景', () => {
  // 8 个选项，牛肉面 index=1；旧版本出现过指针在沙拉、结果却是牛肉面
  const plan = spinPlan(8, 1);
  assert.equal(plan.landed, 1, '落点必须是牛肉面');
  assert.equal(landedIndex(plan.rotation % 360, 8), 1, '归一化后仍需一致');
});

test('落点与标签位置一致：旋转后离指针最近的标签即结果', () => {
  for (let count = 3; count <= 12; count++) {
    const seg = 360 / count;
    const labels = Array.from({ length: count }, (_, i) => i * seg + seg / 2);
    for (let idx = 0; idx < count; idx++) {
      const { rotation, landed } = spinPlan(count, idx);
      const shown = labels.map((a) => (((a + rotation) % 360) + 360) % 360);
      const nearest = shown.indexOf(Math.min(...shown));
      assert.equal(nearest, landed, `count=${count} idx=${idx}`);
    }
  }
});
