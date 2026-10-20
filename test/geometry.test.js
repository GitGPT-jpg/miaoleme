const test = require('node:test');
const assert = require('node:assert');
const { clampToArea, isInsideAnyDisplay } = require('../lib/geometry');

const area = { x: 0, y: 25, width: 1920, height: 1055 };

test('clamp：左上/右下边界', () => {
  assert.deepEqual(clampToArea(-100, -100, 220, 260, area), { x: 0, y: 25 });
  assert.deepEqual(clampToArea(5000, 5000, 220, 260, area), { x: 1700, y: 820 });
  assert.deepEqual(clampToArea(100, 100, 220, 260, area), { x: 100, y: 100 });
});

test('clamp：负坐标显示器（外接屏在左侧）', () => {
  const left = { x: -1920, y: 0, width: 1920, height: 1080 };
  assert.deepEqual(clampToArea(-2000, -30, 220, 260, left), { x: -1920, y: 0 });
  assert.deepEqual(clampToArea(-500, 100, 220, 260, left), { x: -500, y: 100 });
});

test('isInsideAnyDisplay：拔掉外接屏后判定', () => {
  const displays = [{ bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
  assert.equal(isInsideAnyDisplay({ x: 100, y: 100 }, 220, 260, displays), true);
  assert.equal(isInsideAnyDisplay({ x: 5000, y: 100 }, 220, 260, displays), false);
  assert.equal(isInsideAnyDisplay({ x: -1920, y: 100 }, 220, 260, displays), false);
  assert.equal(isInsideAnyDisplay(null, 220, 260, displays), false);
  const two = displays.concat([{ bounds: { x: -1920, y: 0, width: 1920, height: 1080 } }]);
  assert.equal(isInsideAnyDisplay({ x: -1920, y: 100 }, 220, 260, two), true);
});
