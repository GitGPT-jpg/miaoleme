// 形变与物理（UMD：浏览器与 Node 共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WarpMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
// 1) 头部分带偏移：越靠上的带跟随视线越多，形成“抬头/低头”的竖向渐变
function bandOffsets(gazeX, gazeY, bands = 3, ampX = 14, ampY = 8) {
  const n = Math.max(1, bands | 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const weight = 1 - i / n;          // 顶部权重最大
    out.push({ x: (gazeX || 0) * ampX * weight, y: (gazeY || 0) * ampY * weight });
  }
  return out;
}

// 2) 临界阻尼弹簧（半隐式欧拉）：尾巴/头部的真实惯性
function stepSpring(state, target, dt, stiffness = 120, damping = 16) {
  const x = Number.isFinite(state && state.x) ? state.x : 0;
  const v = Number.isFinite(state && state.v) ? state.v : 0;
  const t = Number.isFinite(target) ? target : x;
  const h = Math.min(0.05, Math.max(0.001, dt || 0.016));
  const accel = stiffness * (t - x) - damping * v;
  const nv = v + accel * h;
  const nx = x + nv * h;
  return { x: nx, v: nv };
}

// 3) 瞳孔微动：随机小跳跃（saccade），返回下一次跳跃时间与偏移
function nextSaccade(now, rnd = Math.random) {
  const hold = 0.15 + rnd() * 0.25;      // 保持 150–400ms
  const gap = 1.6 + rnd() * 2.8;         // 间隔 1.6–4.4s
  return {
    until: now + hold,
    nextAt: now + hold + gap,
    dx: (rnd() * 2 - 1) * 2.4,
    dy: (rnd() * 2 - 1) * 1.4
  };
}

return { bandOffsets, stepSpring, nextSaccade };
});
