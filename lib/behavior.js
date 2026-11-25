// 桌宠"自己的生活"：行为权重挑选 + 写代码时"睡觉/自由"阶段判定（纯函数，方便测试）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BehaviorMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // weight 越大越常见；真猫大部分时间在走动、张望、舔毛、发呆
  const BEHAVIORS = [
    { name: 'walk', weight: 10 },
    { name: 'look', weight: 3 },
    { name: 'groom', weight: 3 },
    { name: 'run', weight: 4 },
    { name: 'zoomies', weight: 2 },
    { name: 'loaf', weight: 2 },
    { name: 'yawn', weight: 2 },
    { name: 'stretch', weight: 2 },
    { name: 'knead', weight: 2 },
    { name: 'scratch', weight: 2 },
    { name: 'tail', weight: 1.5 },
    { name: 'pounce', weight: 1.5 },
    { name: 'yarn', weight: 1.5 },
    { name: 'butterfly', weight: 1.5 },
    { name: 'roll', weight: 1.5 },
    { name: 'eat', weight: 1 },
    { name: 'drink', weight: 1 },
    { name: 'catnap', weight: 1 },
  ];

  function pickBehavior(list, recent, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const all = (list || []).filter((b) => b && b.weight > 0);
    if (!all.length) return null;
    const skip = new Set(recent || []);
    let pool = all.filter((b) => !skip.has(b.name));
    if (!pool.length) pool = all;
    const total = pool.reduce((s, b) => s + b.weight, 0);
    let x = r() * total;
    for (const b of pool) {
      x -= b.weight;
      if (x < 0) return b.name;
    }
    return pool[pool.length - 1].name;
  }

  // 记住最近 n 个行为，避免连着重复同一件事
  function pushRecent(recent, name, n) {
    const out = (recent || []).concat(name);
    const keep = n == null ? 3 : n;
    return out.slice(Math.max(0, out.length - keep));
  }

  // 散步落点：在可见区里走一段像样的距离（不再只绕着窝打转），
  // 离窝太远时偏向往回走，免得一路漂到屏幕另一头再也不回来
  function roamTargetX(fromX, homeX, left, right, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const lo = Math.min(left, right);
    const hi = Math.max(left, right);
    const dist = 140 + r() * 300;
    let dir = r() < 0.5 ? -1 : 1;
    const away = fromX - (Number.isFinite(homeX) ? homeX : fromX);
    if (Math.abs(away) > 420) dir = away > 0 ? -1 : 1;
    if (fromX + dir * dist > hi) dir = -1;
    else if (fromX + dir * dist < lo) dir = 1;
    return Math.round(Math.max(lo, Math.min(hi, fromX + dir * dist)));
  }

  const TYPING_MS = 2500;
  const FREE_MS = 6000;

  // 带滞回：刚停手不立刻醒，停够 6s 才算"自由"
  function vibePhase(prev, idleMs) {
    if (!(idleMs < FREE_MS)) return 'free';
    if (idleMs < TYPING_MS) return 'typing';
    return prev === 'typing' ? 'typing' : 'free';
  }

  return { BEHAVIORS, pickBehavior, pushRecent, vibePhase, roamTargetX, TYPING_MS, FREE_MS };
});
