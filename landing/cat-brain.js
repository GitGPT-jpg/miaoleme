// 主页小猫的大脑：纯状态机，不碰 DOM。坐标为舞台归一化坐标（0..1），时间为毫秒。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CatBrain = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const WASH = ['wash-1', 'wash-2', 'wash-3', 'wash-4'];
  const WASH_MS = [650, 520, 520, 720];
  const T = {
    earMs: 480,          // 单键：只转耳的时长
    burstWin: 1000,      // 连打判定窗口
    burstKeys: 3,
    quietMs: 1300,       // 停手多久算“暂时用不着它”
    halfBeat: 550,       // 停手后多看半拍
    idleRounds: 4,       // 没人理时洗几轮脸再趴下
    habitPerKey: 0.045,
    habitDecay: 1 / 9000,
    habitCalm: 0.7,      // 超过它就只动耳朵，继续洗脸
    paw: { x: 0.45, y: 0.86 },
    nearR: 0.36,         // 爪边
    watchR: 1.0,         // 目送范围
    goneR: 1.5,          // 超过即“看不见了”
    lingerMs: 900,       // 爪边晃多久才扑
    stareMs: 1100,       // 盯着最后看见的位置
    searchMs: 1500,
    crouchGiveUp: 2200,
    boredMs: 2600,
    interestMax: 3,
    interestRegen: 20000,
    rubHold: 650,
  };
  const SEQ = {
    tuck: [['sit', 500], ['sit-tag', 420], ['lie-1', 520], ['lie-2', 700], ['lie-3', 900], ['loaf', 600], ['loaf-tail', 520]],
    rise: [['lie-2', 360], ['lie-1', 360], ['sit', 300], ['sit-tag', 380]],
    miss: [['swipe', 260], ['hover', 480], ['wash-2', 520], ['wash-3', 420], ['wash-peek', 900], ['wash-4', 620]],
  };
  const SLOW = new Set(['sit|crouch', 'crouch|swipe', 'swipe|hover', 'sit|lie-1', 'hover|wash-2',
    'sit|rub-l', 'sit|rub-r', 'crouch|search', 'crouch|crouch-l', 'crouch|crouch-r', 'wash-1|crouch',
    'wash-2|crouch', 'wash-3|crouch', 'wash-4|crouch', 'sit-tag|crouch', 'loaf|lie-2', 'lie-1|sit']);

  function fadeFor(a, b) {
    if (!a || a === b) return 0;
    const k1 = a + '|' + b, k2 = b + '|' + a;
    if (SLOW.has(k1) || SLOW.has(k2)) return 380;
    if (a.startsWith('crouch') && b.startsWith('crouch')) return 260;
    if (b.endsWith('-ear') || a.endsWith('-ear')) return 120;
    return 200;
  }

  function createBrain(now = 0) {
    return {
      act: 'wash', phase: 0, phaseAt: now, rounds: 0,
      attn: null,            // {kind:'ear'|'look'|'watch', until, side}
      keys: [], lastKey: -1e9, habit: 0,
      seq: null,             // {name, i, at, then}
      hunt: null,            // {stage, at, linger, lastMove}
      lastSeen: null,        // {x, y, t}
      pointer: null,         // {x, y, t, near}
      nearVisits: 0, wasNear: false, wasSeen: false,
      interest: T.interestMax, interestAt: now,
      rub: null,
      frame: 'wash-1', fade: 0, breathe: false, lastTick: now,
    };
  }

  const dist = (p) => Math.hypot(p.x - T.paw.x, (p.y - T.paw.y) * 1.2);

  function startSeq(s, name, now, then) { s.seq = { name, i: 0, at: now, then }; }
  function resumeWash(s, now, phase) {
    s.act = 'wash'; s.seq = null; s.hunt = null; s.attn = null;
    if (phase != null) s.phase = phase;
    s.phaseAt = now; s.rounds = 0;
  }

  // ---- 键盘：只关心疏密，不关心是哪个键 ----
  function key(s, now) {
    s.keys = s.keys.filter((t) => now - t < T.burstWin);
    s.keys.push(now);
    s.lastKey = now;
    s.habit = Math.min(1, s.habit + T.habitPerKey);
    s.rounds = 0;
    if (s.act === 'loaf' || (s.seq && s.seq.name === 'tuck')) {
      s.attn = { kind: 'ear', until: now + T.earMs };
      return tick(s, now);
    }
    if (s.act !== 'wash') return tick(s, now);
    const burst = s.keys.length >= T.burstKeys;
    const calm = s.habit >= T.habitCalm;
    if (burst && !calm) {
      if (!s.attn || s.attn.kind !== 'look') s.attn = { kind: 'look', since: now, phase: s.phase };
    } else if (!s.attn || s.attn.kind === 'ear') {
      s.attn = { kind: 'ear', until: now + T.earMs };
    }
    return tick(s, now);
  }

  // ---- 光标：x/y 为舞台归一化坐标；离开页面传 null ----
  function pointer(s, p, now) {
    if (!p) return lose(s, now);
    const d = dist(p);
    if (d > T.goneR) return lose(s, now);
    const near = d < T.nearR;
    const prev = s.pointer;
    const moved = !prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 0.004;
    s.pointer = { x: p.x, y: p.y, t: now, near };
    // 每次光标进入视野算一次「经过」；第一次只目送，再回到爪边才认真
    const seen = d < T.watchR;
    if (seen && s.seenAt && now - s.seenAt > 9000) s.nearVisits = 0;
    if (seen && !s.wasSeen) s.nearVisits++;
    if (seen) s.seenAt = now;
    s.wasSeen = seen; s.wasNear = near;
    if (d < T.watchR) s.lastSeen = { x: p.x, y: p.y, t: now };
    s.rounds = 0;
    const h = s.hunt;
    if (h) {
      if (h.stage === 'stare' || h.stage === 'search') {
        if (d < T.watchR) { h.stage = 'crouch'; h.at = now; h.linger = 0; }
      } else if (h.stage === 'crouch') {
        if (near && moved) h.linger += Math.min(120, now - (h.lastMove || now));
        h.lastMove = now;
        if (near) h.at = now;
        if (h.linger >= T.lingerMs) {
          s.hunt = null; s.act = 'play';
          startSeq(s, 'miss', now, 'wash');
          spend(s, now);
        }
      }
      return tick(s, now);
    }
    if (s.act === 'wash' && !s.seq) {
      if (near && s.nearVisits >= 2 && s.interest > 0) {
        s.attn = null; s.act = 'hunt';
        s.hunt = { stage: 'crouch', at: now, linger: 0, lastMove: now };
      } else if (near && s.nearVisits >= 2) {
        s.attn = null; s.act = 'bored'; s.boredAt = now;
      } else if (d < T.watchR && (!s.attn || s.attn.kind !== 'look')) {
        s.attn = { kind: 'watch', until: now + 900, side: p.x < 0.5 ? 'l' : 'r', phase: s.phase };
      }
    } else if (s.act === 'loaf' && near && s.nearVisits >= 2 && s.interest > 0) {
      s.act = 'rising'; startSeq(s, 'rise', now, 'wash');
    }
    return tick(s, now);
  }

  function lose(s, now) {
    s.pointer = null; s.wasNear = false; s.wasSeen = false;
    if (s.hunt && s.hunt.stage === 'crouch') { s.hunt.stage = 'stare'; s.hunt.at = now; }
    return tick(s, now);
  }

  function spend(s, now) {
    s.interest = Math.max(0, s.interest - 1);
    s.interestAt = now;
  }

  // ---- 触摸脸颊 ----
  function touch(s, p, now) {
    if (!p || p.y > 0.62 || p.x < 0.15 || p.x > 0.85) return tick(s, now);
    if (s.act === 'loaf' || s.act === 'play' || s.act === 'rising') return tick(s, now);
    s.hunt = null; s.seq = null; s.attn = null;
    s.act = 'rub';
    s.rub = { side: p.x < 0.45 ? 'l' : 'r', until: now + T.rubHold };
    s.rounds = 0;
    return tick(s, now);
  }

  function tick(s, now) {
    if (s.interest < T.interestMax && now - s.interestAt > T.interestRegen) { s.interest++; s.interestAt = now; }
    s.habit = Math.max(0, s.habit - (now - s.lastTick) * T.habitDecay);
    s.lastTick = now;
    if (s.attn && s.attn.until && now > s.attn.until) {
      const a = s.attn; s.attn = null;
      if (a.kind === 'watch') s.phaseAt = now;
    }
    let f = s.frame, breathe = false;

    if (s.seq) {
      const list = SEQ[s.seq.name];
      while (s.seq && now - s.seq.at >= list[s.seq.i][1]) {
        s.seq.at += list[s.seq.i][1];
        s.seq.i++;
        if (s.seq.i >= list.length) {
          const then = s.seq.then; s.seq = null;
          if (then === 'loaf') { s.act = 'loaf'; s.loafAt = now; }
          else resumeWash(s, now, 0);
        }
      }
      if (s.seq) f = list[s.seq.i][0];
    }

    if (!s.seq) switch (s.act) {
      case 'rub':
        f = 'rub-' + s.rub.side;
        if (now > s.rub.until) { s.rub = null; resumeWash(s, now, 1); f = 'wash-2'; }
        break;
      case 'bored':
        f = 'bored'; breathe = true;
        if (now - s.boredAt > T.boredMs) { resumeWash(s, now, 1); f = 'wash-2'; }
        break;
      case 'hunt': {
        const h = s.hunt; breathe = true;
        if (h.stage === 'crouch') {
          const p = s.pointer;
          f = !p ? 'crouch' : p.x < T.paw.x - 0.14 ? 'crouch-l' : p.x > T.paw.x + 0.14 ? 'crouch-r' : 'crouch';
          if (!p || !p.near) { if (now - h.at > T.crouchGiveUp) { resumeWash(s, now, 1); f = 'wash-2'; } }
        } else if (h.stage === 'stare') {
          const ls = s.lastSeen;
          f = !ls ? 'crouch' : ls.x < T.paw.x - 0.14 ? 'crouch-l' : ls.x > T.paw.x + 0.14 ? 'crouch-r' : 'crouch';
          if (now - h.at > T.stareMs) { h.stage = 'search'; h.at = now; }
        } else {
          f = 'search';
          if (now - h.at > T.searchMs) { spend(s, now); resumeWash(s, now, 1); f = 'wash-2'; }
        }
        break;
      }
      case 'loaf': {
        breathe = true;
        const held = now - s.loafAt;
        f = held > 9000 ? 'loaf-sleep' : (held % 7000 > 6200 ? 'loaf-tail' : 'loaf');
        if (s.attn && s.attn.kind === 'ear') f = 'loaf-ear';
        if (held > 45000) { s.act = 'rising'; startSeq(s, 'rise', now, 'wash'); f = 'lie-2'; }
        break;
      }
      case 'wash':
      default: {
        s.act = 'wash';
        const a = s.attn;
        if (a && a.kind === 'look') {
          breathe = true;
          f = 'wash-look';
          if (s.habit >= T.habitCalm) { s.attn = null; s.phase = 1; s.phaseAt = now; f = 'wash-2-ear'; }
          else if (now - s.lastKey > T.quietMs + T.halfBeat) {
            // 多看了半拍，垂眼回到刚才那一侧：爪还在脸颊上，从 wash-2 接着洗
            s.attn = null; s.phase = 1; s.phaseAt = now; f = 'wash-2';
          }
          break;
        }
        if (a && a.kind === 'watch') { f = 'watch-' + a.side; breathe = true; break; }
        while (now - s.phaseAt >= WASH_MS[s.phase]) {
          s.phaseAt += WASH_MS[s.phase];
          s.phase = (s.phase + 1) % WASH.length;
          if (s.phase === 0) s.rounds++;
        }
        f = WASH[s.phase] + (a && a.kind === 'ear' ? '-ear' : '');
        const quiet = now - s.lastKey > 4000 && !(s.pointer && s.pointer.near);
        if (s.rounds >= T.idleRounds && quiet && s.phase === 0) {
          s.act = 'tucking'; startSeq(s, 'tuck', now, 'loaf'); f = 'sit';
        }
      }
    }
    const fade = fadeFor(s.frame, f);
    s.frame = f;
    return { frame: f, fade, breathe, act: s.act, interest: s.interest, lastSeen: s.lastSeen, habit: s.habit };
  }

  return { createBrain, key, pointer, touch, tick, fadeFor, T, WASH, SEQ };
});
