// Keyboard attention model: only counts and timing, never key identity.
// level: 'none' -> 'ear' (single tap) -> 'look' (a burst). After the hands
// go quiet the cat lingers a beat, then 'resume' tells the body to continue
// whatever it was doing.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AttentionMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    lookKeys: 3,        // keys inside lookWindowMs that make it raise its eyes
    lookWindowMs: 1200,
    earMs: 1100,        // a lone tap: ear stays turned this long
    settleMs: 2600,     // quiet time before attention starts to drop
    lingerMs: 500,      // the extra half-beat look before looking away
    flickMs: 280,       // dense typing merges into one micro-twitch per window
  };

  function createAttention(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    let level = 'none';
    let phase = 'idle';
    let lastKey = -Infinity;
    let lastFlick = -Infinity;
    let hits = [];        // [time, n]

    function recent(now) {
      hits = hits.filter((h) => now - h[0] <= o.lookWindowMs);
      let s = 0;
      for (const h of hits) s += h[1];
      return s;
    }

    function onKeys(n, now) {
      n = Math.max(1, Math.min(50, n | 0 || 1));
      const prevLevel = level;
      hits.push([now, n]);
      const burst = recent(now);
      const gap = now - lastKey;
      lastKey = now;
      phase = 'hold';
      if (burst >= o.lookKeys || (prevLevel === 'look')) level = 'look';
      else level = 'ear';
      let flick = false;
      if (prevLevel !== 'none' && gap < o.lookWindowMs && now - lastFlick >= o.flickMs) {
        flick = true;
        lastFlick = now;
      }
      return { level, phase, started: prevLevel === 'none', raised: prevLevel !== 'look' && level === 'look', flick };
    }

    function tick(now) {
      if (level === 'none') return { level, phase, resumed: false };
      const quiet = now - lastKey;
      if (level === 'ear') {
        if (quiet >= o.earMs) {
          level = 'none'; phase = 'resume'; hits = [];
          return { level, phase, resumed: true };
        }
        return { level, phase, resumed: false };
      }
      if (quiet >= o.settleMs + o.lingerMs) {
        level = 'none'; phase = 'resume'; hits = [];
        return { level, phase, resumed: true };
      }
      if (quiet >= o.settleMs) phase = 'linger';
      return { level, phase, resumed: false };
    }

    function reset() {
      level = 'none'; phase = 'idle'; hits = []; lastKey = -Infinity; lastFlick = -Infinity;
    }

    return { onKeys, tick, reset, get level() { return level; }, get phase() { return phase; }, options: o };
  }

  // Aggregate raw key counts into short windows so a 50 ms poller and a
  // per-key hook look the same to the renderer. First key goes out at once.
  function createKeyAggregator(windowMs, emit) {
    let pending = 0;
    let timer = null;
    let lastEmit = -Infinity;
    const w = windowMs || 60;
    function flush() {
      timer = null;
      if (pending > 0) { const n = pending; pending = 0; lastEmit = Date.now(); emit(n); }
    }
    return {
      add(n, now) {
        now = now == null ? Date.now() : now;
        pending += Math.max(1, n | 0 || 1);
        if (now - lastEmit >= w && !timer) { flush(); return; }
        if (!timer) timer = setTimeout(flush, w);
      },
      dispose() { if (timer) clearTimeout(timer); timer = null; pending = 0; },
    };
  }

  // Cursor teasing near the paws: count direction reversals in a small zone.
  function createTease(opts) {
    const o = Object.assign({ zoneX: 90, minY: -10, maxY: 120, reversals: 3, windowMs: 2600 }, opts || {});
    let lastX = null, dir = 0, flips = [];
    return {
      feed(dx, dy, now) {
        const inZone = Math.abs(dx) <= o.zoneX && dy >= o.minY && dy <= o.maxY;
        if (!inZone) { lastX = null; dir = 0; flips = []; return { inZone, teased: false }; }
        if (lastX != null) {
          const d = dx - lastX;
          if (Math.abs(d) >= 6) {
            const nd = d > 0 ? 1 : -1;
            if (dir !== 0 && nd !== dir) flips.push(now);
            dir = nd;
          }
        }
        lastX = dx;
        flips = flips.filter((t) => now - t <= o.windowMs);
        return { inZone, teased: flips.length >= o.reversals };
      },
      reset() { lastX = null; dir = 0; flips = []; },
    };
  }

  return { createAttention, createKeyAggregator, createTease, DEFAULTS };
});
