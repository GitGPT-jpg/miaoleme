// 视线偏移与平滑（UMD：浏览器与 Node 共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GazeMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // 光标相对窗口中心的偏移 → 归一化视线（-1..1）
  function gazeFromOffset(dx, dy, maxDist = 600) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { x: 0, y: 0 };
    return { x: clamp(dx / maxDist, -1, 1), y: clamp(dy / maxDist, -1, 1) };
  }

  // 指数平滑：每帧向目标靠近，factor 0..1（越小越慢）
  function smooth(current, target, factor) {
    const f = clamp(factor, 0, 1);
    return current + (target - current) * f;
  }

  return { gazeFromOffset, smooth };
});
