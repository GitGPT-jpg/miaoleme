// 写代码氛围模式：打字节奏统计（KPM / 连击 / 热度）与粒子文本（UMD：浏览器与 Node 共用）
// 只处理“有输入发生”的时间戳与类别，不接触任何按键内容。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VibeMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KINDS = ['key', 'click', 'mouse'];
  // 每类输入为热度贡献的能量；鼠标移动只给一点点，避免晃鼠标就“着火”
  const GAIN = { key: 0.09, click: 0.06, mouse: 0.015 };
  const TOKENS = [
    '{ }', ';', '=>', '()', '</>', 'const', 'let', 'if', 'for', 'return',
    '&&', '||', '++', '[]', '0x1F', '1010', 'fn', 'async', 'await', '#',
    '// TODO', 'git push', '✨', '⚡', '🐟', '☕'
  ];
  const MILESTONES = [10, 30, 60, 100, 200, 500];
  const LEVELS = [
    { min: 0, name: 'calm' },
    { min: 80, name: 'flow' },
    { min: 200, name: 'fire' }
  ];

  function createMeter(opts = {}) {
    const windowMs = opts.windowMs > 0 ? opts.windowMs : 10000;
    const comboGapMs = opts.comboGapMs > 0 ? opts.comboGapMs : 1500;
    const decayMs = opts.decayMs > 0 ? opts.decayMs : 1500;
    const maxHits = opts.maxHits > 0 ? opts.maxHits : 2000;
    let keys = [];          // 窗口内键盘/点击的时间戳
    let combo = 0;
    let lastKeyT = -Infinity;
    let energy = 0;
    let energyT = 0;

    function prune(t) {
      const from = t - windowMs;
      let i = 0;
      while (i < keys.length && keys[i] < from) i++;
      if (i) keys = keys.slice(i);
      if (keys.length > maxHits) keys = keys.slice(keys.length - maxHits);
    }
    function decayed(t) {
      const dt = Math.max(0, t - energyT);
      return energy * Math.exp(-dt / decayMs);
    }

    function hit(t, kind = 'key') {
      if (!Number.isFinite(t)) return combo;
      const k = KINDS.includes(kind) ? kind : 'key';
      energy = Math.min(1, decayed(t) + GAIN[k]);
      energyT = t;
      if (k === 'mouse') return combo;
      combo = t - lastKeyT <= comboGapMs ? combo + 1 : 1;
      lastKeyT = t;
      keys.push(t);
      prune(t);
      return combo;
    }
    function kpm(t) {
      prune(t);
      // 刚开始敲时窗口未满，按实际经过时间折算，至少按 2 秒算，避免首键就显示爆表
      const first = keys.length ? keys[0] : t;
      const span = Math.min(windowMs, Math.max(2000, t - first));
      return Math.round((keys.length * 60000) / span);
    }
    function comboAt(t) {
      return t - lastKeyT <= comboGapMs ? combo : 0;
    }
    function intensity(t) {
      return Math.max(0, Math.min(1, decayed(t)));
    }
    function level(t) {
      const v = kpm(t);
      let name = LEVELS[0].name;
      for (const l of LEVELS) if (v >= l.min) name = l.name;
      return name;
    }
    function idleMs(t) {
      return Number.isFinite(lastKeyT) ? Math.max(0, t - lastKeyT) : Infinity;
    }
    function reset() {
      keys = []; combo = 0; lastKeyT = -Infinity; energy = 0; energyT = 0;
    }
    return { hit, kpm, combo: comboAt, intensity, level, idleMs, reset };
  }

  // 连击从 prev 增长到 next 时跨过的最大里程碑（没有则 0）
  function milestone(prev, next) {
    let hitM = 0;
    for (const m of MILESTONES) if (prev < m && next >= m) hitM = m;
    return hitM;
  }

  function pickParticle(rng = Math.random) {
    const r = rng();
    const i = Math.floor((Number.isFinite(r) ? Math.abs(r) % 1 : 0) * TOKENS.length);
    return TOKENS[i];
  }

  return { createMeter, milestone, pickParticle, TOKENS, MILESTONES };
});
