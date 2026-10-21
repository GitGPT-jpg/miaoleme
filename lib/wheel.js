// 转盘选择：角度与结果一致性（UMD：浏览器与 Node 共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WheelMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
// 约定：扇区 i 在本地角度 [i*seg, (i+1)*seg)，0° = 12 点方向，顺时针；
// 指针固定在 0°。旋转 rotation 后，本地角度 α 显示在 (α + rotation) mod 360。

function segmentAngle(count) {
  return 360 / count;
}

// 让 index 扇区的中心转到指针处所需旋转（叠加整圈数用于动画）
function spinRotation(count, index, turns = 5) {
  const seg = segmentAngle(count);
  const center = index * seg + seg / 2;
  return turns * 360 + (360 - center);
}

// 指针当前指向的扇区（结果唯一事实来源）
function landedIndex(rotation, count) {
  const seg = segmentAngle(count);
  const local = (((-rotation) % 360) + 360) % 360;
  return Math.floor(local / seg) % count;
}

// 组合：给定目标索引，返回旋转与最终落点（应当一致）
function spinPlan(count, index, turns = 5) {
  const rotation = spinRotation(count, index, turns);
  return { rotation, landed: landedIndex(rotation, count) };
}

return { segmentAngle, spinRotation, landedIndex, spinPlan };
});
