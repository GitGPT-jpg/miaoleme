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
    { name: 'shake', weight: 1.5 },
    { name: 'earscratch', weight: 1.5 },
    { name: 'belly', weight: 1.2 },
    { name: 'chatter', weight: 1 },
    { name: 'sitlick', weight: 1.5 },
    { name: 'tailwrap', weight: 1 },
    { name: 'sneak', weight: 1.5 },
    { name: 'facewash', weight: 2 },
    { name: 'sniff', weight: 2 },
    { name: 'blink', weight: 2 },
    { name: 'rub', weight: 1 },
    { name: 'hunt', weight: 1.5 },
    { name: 'greet', weight: 1 },
  ];

  // 昼夜节律：深夜犯困，傍晚疯跑，清晨伸懒腰。返回新数组，不改原表
  const CIRCADIAN = [
    { from: 22, to: 6, mul: { catnap: 2, loaf: 2, tailwrap: 1.5, run: 0.5, zoomies: 0.5 } },
    { from: 17, to: 20, mul: { zoomies: 1.8, run: 1.8, chatter: 1.5 } },
    { from: 6, to: 9, mul: { stretch: 1.5, yawn: 1.5, shake: 1.3 } },
  ];
  function circadianWeights(list, hour) {
    const h = ((Math.floor(Number(hour)) % 24) + 24) % 24;
    const band = Number.isFinite(h) ? CIRCADIAN.find((b) => (b.from < b.to ? h >= b.from && h < b.to : h >= b.from || h < b.to)) : null;
    return (list || []).map((b) => {
      const m = band && band.mul[b.name];
      return m ? { ...b, weight: b.weight * m } : b;
    });
  }

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

  // ---------- 意向性：驱动值 + 行为链 ----------
  // 真猫不是每隔几秒掷一次骰子：玩累了才困，困了先找地方趴下，睡醒先伸懒腰，跑完要舔毛。
  const ACTIVITY = {
    walk: 'active', run: 'active', zoomies: 'active', pounce: 'active', yarn: 'active', butterfly: 'active',
    chatter: 'active', tail: 'active', sneak: 'active', hunt: 'active', blink: 'rest', loaf: 'rest', tailwrap: 'rest', belly: 'rest', knead: 'rest', catnap: 'sleep',
  };
  const activityOf = (name) => ACTIVITY[name] || 'light';
  // 每分钟变化量：活动耗体力、攒困意；休息慢慢回体力；睡觉回得快，困意也消
  const DRIVE_RATES = {
    active: { energy: -0.12, sleepiness: 0.07 },
    light: { energy: -0.02, sleepiness: 0.03 },
    rest: { energy: 0.04, sleepiness: 0.02 },
    sleep: { energy: 0.18, sleepiness: -0.25 },
  };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function createDrives(init) {
    const o = init || {};
    return { energy: clamp01(o.energy == null ? 0.8 : o.energy), sleepiness: clamp01(o.sleepiness == null ? 0.25 : o.sleepiness) };
  }
  function tickDrives(d, dtMs, activity) {
    const rate = DRIVE_RATES[activity] || DRIVE_RATES.light;
    const min = Math.max(0, Number(dtMs) || 0) / 60000;
    return { energy: clamp01(d.energy + rate.energy * min), sleepiness: clamp01(d.sleepiness + rate.sleepiness * min) };
  }

  // 上一件事 → 下一件事的倾向（乘在基础权重上，没列出的保持 1）
  const TRANSITIONS = {
    walk: { sniff: 3, look: 3, blink: 2, sitlick: 2.5, groom: 2, scratch: 1.5, chatter: 1.5, rub: 1.5, walk: 0.6, run: 0.6 },
    run: { sitlick: 3, groom: 3, facewash: 2, loaf: 2.5, shake: 2, run: 0.3, zoomies: 0.2, catnap: 0.4 },
    zoomies: { sitlick: 3, groom: 3, facewash: 2, loaf: 2.5, shake: 2, run: 0.2, zoomies: 0.1, catnap: 0.4 },
    look: { sneak: 3, hunt: 2.5, walk: 2.5, chatter: 2, pounce: 1.5, butterfly: 1.5, look: 0.4 },
    sneak: { hunt: 4, pounce: 2.5, look: 1.5, sneak: 0.2, catnap: 0.2 },
    hunt: { facewash: 4, groom: 3, sitlick: 2, shake: 1.5, hunt: 0.2, catnap: 0.2 },
    facewash: { blink: 2.5, loaf: 2, tailwrap: 1.5, earscratch: 1.5, facewash: 0.2, groom: 0.5 },
    sniff: { walk: 2.5, look: 2, rub: 2, eat: 1.5, drink: 1.5, sniff: 0.3 },
    blink: { loaf: 2.5, tailwrap: 2, yawn: 1.5, catnap: 1.5, blink: 0.3, run: 0.3, zoomies: 0.2 },
    rub: { greet: 2, walk: 2, look: 1.5, rub: 0.2 },
    greet: { rub: 2, blink: 2, walk: 1.5, greet: 0.2 },
    groom: { loaf: 2, tailwrap: 2, facewash: 1.5, earscratch: 1.5, shake: 1.5, groom: 0.3, sitlick: 0.3 },
    sitlick: { loaf: 2, tailwrap: 2, blink: 1.5, earscratch: 1.5, shake: 1.5, groom: 0.3, sitlick: 0.3 },
    loaf: { catnap: 2.5, blink: 2, yawn: 2, knead: 1.5, walk: 0.7, run: 0.2, zoomies: 0.1 },
    tailwrap: { catnap: 2, blink: 2, yawn: 2, look: 1.5, run: 0.2, zoomies: 0.1 },
    belly: { roll: 1.5, catnap: 2, yawn: 1.5, run: 0.3 },
    knead: { loaf: 2, catnap: 3, run: 0.2 },
    catnap: { yawn: 4, stretch: 4, shake: 2, groom: 1.5, catnap: 0, loaf: 0.3, run: 0.2, zoomies: 0.1, hunt: 0.2, sneak: 0.2 },
    yawn: { stretch: 2.5, shake: 2, walk: 2, groom: 1.5, catnap: 0.1, loaf: 0.4 },
    stretch: { shake: 2, walk: 2.5, sniff: 1.5, groom: 1.5, look: 1.5, catnap: 0.1, loaf: 0.4 },
    pounce: { facewash: 3, groom: 2.5, sitlick: 2, shake: 1.5, pounce: 0.5 },
    yarn: { groom: 2.5, sitlick: 2, loaf: 1.5, yarn: 0.3 },
    butterfly: { look: 2, groom: 2, sitlick: 1.5, butterfly: 0.3 },
    eat: { facewash: 3, sitlick: 3, groom: 3, loaf: 1.5, eat: 0 },
    drink: { facewash: 2, sitlick: 2, groom: 2, look: 1.5, drink: 0 },
  };
  const WAKE_COOLDOWN_MS = 4 * 60 * 1000;   // 刚睡醒的几分钟里不会又倒头就睡

  // state: { drives, last, recent, sinceWakeMs }；返回下一件事
  function intentionalWeights(list, state, hour) {
    const st = state || {};
    const d = st.drives || createDrives();
    const tr = TRANSITIONS[st.last] || {};
    const awakeLong = !(st.sinceWakeMs < WAKE_COOLDOWN_MS);
    return circadianWeights(list, hour).map((b) => {
      let w = b.weight * (tr[b.name] == null ? 1 : tr[b.name]);
      const act = activityOf(b.name);
      if (b.name === 'catnap') w *= awakeLong ? 0.15 + 8 * Math.max(0, d.sleepiness - 0.45) : 0;
      else if (act === 'active') w *= 0.25 + d.energy;
      else if (act === 'rest') w *= 0.6 + d.sleepiness + (1 - d.energy) * 0.6;
      return w === b.weight ? b : { ...b, weight: w };
    });
  }
  function pickIntentional(state, rand, hour) {
    const st = state || {};
    const d = st.drives || createDrives();
    // 困到眼皮打架、又醒了够久：找地方趴下睡（趴下的过渡由渲染层演）
    if (d.sleepiness > 0.85 && !(st.sinceWakeMs < WAKE_COOLDOWN_MS)) return 'catnap';
    return pickBehavior(intentionalWeights(BEHAVIORS, st, hour), st.recent, rand);
  }
  // 一件事做完后原地停留多久再做下一件：歇着的、困的猫停得更久
  function dwellMs(last, drives, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const d = drives || createDrives();
    const act = activityOf(last);
    const base = act === 'active' ? 3500 : act === 'rest' || act === 'sleep' ? 6000 : 4500;
    return Math.round(base * (0.8 + d.sleepiness * 0.8) + r() * 3600);
  }
  // 自己挑的小睡时长：越困睡越久
  function napDurationMs(drives, rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const d = drives || createDrives();
    return Math.round(25000 + d.sleepiness * 60000 + r() * 20000);
  }

  const TYPING_MS = 2500;
  const FREE_MS = 6000;

  // 带滞回：刚停手不立刻醒，停够 6s 才算"自由"
  function vibePhase(prev, idleMs) {
    if (!(idleMs < FREE_MS)) return 'free';
    if (idleMs < TYPING_MS) return 'typing';
    return prev === 'typing' ? 'typing' : 'free';
  }

  return {
    BEHAVIORS, pickBehavior, circadianWeights, pushRecent, vibePhase, roamTargetX, TYPING_MS, FREE_MS,
    TRANSITIONS, WAKE_COOLDOWN_MS, activityOf, createDrives, tickDrives, intentionalWeights, pickIntentional, dwellMs, napDurationMs,
  };
});
