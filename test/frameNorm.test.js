const test = require('node:test');
const assert = require('node:assert');
const { alphaBBox, heightScale } = require('../lib/frameNorm');

function makeBitmap(w, h, rect) {
  const b = Buffer.alloc(w * h * 4, 0);
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      b[(y * w + x) * 4 + 3] = 255;
    }
  }
  return b;
}

test('alpha 包围盒：空图返回 null，矩形返回精确边界', () => {
  assert.equal(alphaBBox(Buffer.alloc(10 * 10 * 4, 0), 10, 10), null);
  const bmp = makeBitmap(20, 20, { x: 3, y: 4, w: 5, h: 6 });
  assert.deepEqual(alphaBBox(bmp, 20, 20), { x: 3, y: 4, w: 5, h: 6 });
});

test('缩放比例：目标高度、上下限钳制', () => {
  assert.equal(heightScale(170, 340), 2);
  assert.equal(heightScale(0, 340), 1);
  assert.equal(heightScale(1, 340), 3, '上限 3');
  assert.equal(heightScale(2000, 340), 0.5, '下限 0.5');
});
