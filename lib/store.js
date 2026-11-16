// 状态存储：默认值、受控校验与损坏恢复（不依赖 Electron，可单测）
const fs = require('fs');
const { RUN_FRAMES } = require('./run');

const DEFAULT_STATE = {
  form: 'custom',
  customImage: null,
  customImages: [],       // 多张参考照片（同一只猫）
  displayMode: 'photo',   // photo=写实展示 | rig=骨骼动画
  rigSourceImage: '',     // 骨骼部件对应的原图文件名（换图后失效）
  customGenIdle: null,
  customGenWalk: null,
  customGenActions: null,
  customGenRunSeq: [],    // 奔跑序列帧（run-1…run-8 的文件路径，缺帧留 null）
  water: { enabled: true, intervalMin: 45, lastRemindTs: 0, lastCheckinTs: 0 },
  sit: { enabled: false, intervalMin: 60, lastRemindTs: 0 },
  pomodoro: { workMin: 25, breakMin: 5 },
  dnd: { enabled: false, start: '22:00', end: '08:00' },
  feed: {
    waterRequest: false,
    waterNagTs: 0,
    mealRequest: false,
    mealNagTs: 0,
    mealSlot: null,           // 当前待喂餐次 'lunch' | 'dinner'
    mealRequestDate: '',      // 当前请求发生日期（跨天清理）
    mealSnoozeUntil: 0,       // 稍后提醒的恢复时间戳
    // 日期+餐次 去重（lunch/dinner 各自独立），值为 YYYY-M-D
    lastMealRequest: { lunch: '', dinner: '' },
    lastMealFed: { lunch: '', dinner: '' }
  },
  theme: 'light',
  autoLaunch: false,
  quiet: false,          // 安静模式：抑制非必要的自动气泡与闲聊
  stats: { intimacy: 0, waterDone: 0, pomodoroDone: 0, lastPetTs: 0, petDaily: { date: '', count: 0 } },
  mealMenus: { lunch: null, dinner: null },  // 自定义菜单（数组）
  games: { rps: { win: 0, lose: 0, draw: 0 } }, // 小游戏战绩
  meetings: [],
  ddls: [],
  notifiedMeetings: [],
  notifiedDdls: [],
  petPos: null,
  genJob: null,
  pomo: null             // 番茄钟运行态 { active, phase, endTs }（仅用于恢复，不累计完成数）
};

const FORMS = ['cat', 'robot', 'slime', 'custom'];
const THEMES = ['light', 'dark'];
const ACTION_KEYS = ['roll', 'groom', 'eat', 'sleep', 'drink'];
const MAX_MARKS = 500;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => JSON.parse(JSON.stringify(v));

function num(v, def, min, max, int) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return def;
  let out = int ? Math.round(n) : n;
  if (Number.isFinite(min)) out = Math.max(min, out);
  if (Number.isFinite(max)) out = Math.min(max, out);
  return out;
}

function bool(v, def) {
  if (typeof v === 'boolean') return v;
  return def;
}

function str(v, def, maxLen) {
  if (typeof v !== 'string') return def;
  return maxLen ? v.slice(0, maxLen) : v;
}

function enumOf(v, allowed, def) {
  return allowed.includes(v) ? v : def;
}

function filePath(v) {
  return typeof v === 'string' && v.length > 0 && v.length < 4096 ? v : null;
}

// 奔跑序列：定长槽位（run-1…run-8 按序对应），非法/缺帧留 null，尾部空槽收敛掉
function runSeqList(v) {
  if (!Array.isArray(v)) return [];
  const out = v.slice(0, RUN_FRAMES).map((x) => filePath(x));
  while (out.length && out[out.length - 1] === null) out.pop();
  return out.some(Boolean) ? out : [];
}

function timeOf(v, def) {
  const m = typeof v === 'string' && /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return def;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return def;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function dateStr(v) {
  return typeof v === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(v) ? v : '';
}

function eventList(v, key) {
  const out = [];
  if (!Array.isArray(v)) return out;
  for (const it of v) {
    if (!isObj(it)) continue;
    const title = str(it.title, '', 120).trim();
    const ts = num(it.ts, NaN);
    if (!title || !Number.isFinite(ts)) continue;
    out.push({ id: str(it.id, '', 64) || `${key}-${ts}-${out.length}`, title, ts });
  }
  return out.slice(0, 200).sort((a, b) => a.ts - b.ts);
}

function markList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string').slice(-MAX_MARKS);
}

// 保留不认识的顶层字段：同一个 userData 可能被另一个版本/分支的构建读写，
// 直接丢掉对方的字段等于把对方的数据抹掉（本机并行 checkout 已踩过：
// health/hunt 与 customGenRunSeq 互相被抹）。带数量与单字段体积上限，避免状态文件被撑爆。
const KNOWN_KEYS = new Set(Object.keys(DEFAULT_STATE));
const MAX_FOREIGN_KEYS = 24;
const MAX_FOREIGN_BYTES = 64 * 1024;

function keepForeignKeys(src, out) {
  if (!isObj(src)) return;
  let kept = 0;
  for (const k of Object.keys(src)) {
    if (KNOWN_KEYS.has(k)) continue;
    if (kept >= MAX_FOREIGN_KEYS) break;
    let text;
    try { text = JSON.stringify(src[k]); } catch (e) { continue; }   // 含循环引用等：跳过
    if (typeof text !== 'string' || text.length > MAX_FOREIGN_BYTES) continue;
    out[k] = JSON.parse(text);
    kept++;
  }
}

// 迁移旧版 feed（lastMealRequestDate/lastMealFedDate 按天）→ 日期+餐次
function migrateLegacyFeed(src, out) {
  if (!isObj(src)) return;
  if (typeof src.lastMealRequestDate === 'string' && src.lastMealRequestDate) {
    out.lastMealRequest.lunch = out.lastMealRequest.lunch || src.lastMealRequestDate;
    out.lastMealRequest.dinner = out.lastMealRequest.dinner || src.lastMealRequestDate;
  }
  if (typeof src.lastMealFedDate === 'string' && src.lastMealFedDate) {
    out.lastMealFed.lunch = out.lastMealFed.lunch || src.lastMealFedDate;
    out.lastMealFed.dinner = out.lastMealFed.dinner || src.lastMealFedDate;
  }
}

// 对任意输入（含 null / 错误类型 / 缺字段）产出合法状态
function normalizeState(raw) {
  const src = isObj(raw) ? raw : {};
  const out = clone(DEFAULT_STATE);

  out.form = enumOf(src.form, FORMS, DEFAULT_STATE.form);
  out.customImage = filePath(src.customImage);
  out.customImages = Array.isArray(src.customImages)
    ? src.customImages.filter((x) => typeof x === 'string' && x.length && x.length < 4096).slice(0, 8)
    : [];
  out.displayMode = src.displayMode === 'rig' ? 'rig' : 'photo';
  out.rigSourceImage = typeof src.rigSourceImage === 'string' ? src.rigSourceImage.slice(0, 200) : '';
  out.customGenIdle = filePath(src.customGenIdle);
  out.customGenWalk = filePath(src.customGenWalk);
  out.customGenActions = null;
  if (isObj(src.customGenActions)) {
    const actions = {};
    for (const k of ACTION_KEYS) {
      const p = filePath(src.customGenActions[k]);
      if (p) actions[k] = p;
    }
    out.customGenActions = Object.keys(actions).length ? actions : null;
  }
  out.customGenRunSeq = runSeqList(src.customGenRunSeq);

  const w = isObj(src.water) ? src.water : {};
  out.water = {
    enabled: bool(w.enabled, DEFAULT_STATE.water.enabled),
    intervalMin: num(w.intervalMin, 45, 5, 240, true),
    lastRemindTs: num(w.lastRemindTs, 0, 0),
    lastCheckinTs: num(w.lastCheckinTs, 0, 0)
  };
  const s = isObj(src.sit) ? src.sit : {};
  out.sit = {
    enabled: bool(s.enabled, false),
    intervalMin: num(s.intervalMin, 60, 10, 240, true),
    lastRemindTs: num(s.lastRemindTs, 0, 0)
  };
  const p = isObj(src.pomodoro) ? src.pomodoro : {};
  out.pomodoro = {
    workMin: num(p.workMin, 25, 1, 120, true),
    breakMin: num(p.breakMin, 5, 1, 60, true)
  };
  const d = isObj(src.dnd) ? src.dnd : {};
  out.dnd = {
    enabled: bool(d.enabled, false),
    start: timeOf(d.start, '22:00'),
    end: timeOf(d.end, '08:00')
  };

  const f = isObj(src.feed) ? src.feed : {};
  out.feed = {
    waterRequest: bool(f.waterRequest, false),
    waterNagTs: num(f.waterNagTs, 0, 0),
    mealRequest: bool(f.mealRequest, false),
    mealNagTs: num(f.mealNagTs, 0, 0),
    mealSlot: f.mealSlot === 'lunch' || f.mealSlot === 'dinner' ? f.mealSlot : null,
    mealRequestDate: dateStr(f.mealRequestDate),
    mealSnoozeUntil: num(f.mealSnoozeUntil, 0, 0),
    lastMealRequest: {
      lunch: dateStr(isObj(f.lastMealRequest) ? f.lastMealRequest.lunch : ''),
      dinner: dateStr(isObj(f.lastMealRequest) ? f.lastMealRequest.dinner : '')
    },
    lastMealFed: {
      lunch: dateStr(isObj(f.lastMealFed) ? f.lastMealFed.lunch : ''),
      dinner: dateStr(isObj(f.lastMealFed) ? f.lastMealFed.dinner : '')
    }
  };
  migrateLegacyFeed(f, out.feed);

  out.theme = enumOf(src.theme, THEMES, 'light');
  out.autoLaunch = bool(src.autoLaunch, false);
  out.quiet = bool(src.quiet, false);

  const st = isObj(src.stats) ? src.stats : {};
  out.stats = {
    intimacy: num(st.intimacy, 0, 0, 1e9, true),
    waterDone: num(st.waterDone, 0, 0, 1e9, true),
    pomodoroDone: num(st.pomodoroDone, 0, 0, 1e9, true),
    lastPetTs: num(st.lastPetTs, 0, 0),
    petDaily: {
      date: isObj(st.petDaily) ? dateStr(st.petDaily.date) : '',
      count: isObj(st.petDaily) ? num(st.petDaily.count, 0, 0, 1000, true) : 0
    }
  };

  const gm = isObj(src.games) ? src.games : {};
  const rps = isObj(gm.rps) ? gm.rps : {};
  out.games = { rps: {
    win: num(rps.win, 0, 0, 1e9, true),
    lose: num(rps.lose, 0, 0, 1e9, true),
    draw: num(rps.draw, 0, 0, 1e9, true)
  } };

  out.mealMenus = { lunch: null, dinner: null };
  if (isObj(src.mealMenus)) {
    for (const slot of ['lunch', 'dinner']) {
      const arr = src.mealMenus[slot];
      if (Array.isArray(arr)) {
        const items = arr.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 20)).filter(Boolean).slice(0, 12);
        out.mealMenus[slot] = items.length >= 2 ? items : null;
      }
    }
  }

  out.meetings = eventList(src.meetings, 'm');
  out.ddls = eventList(src.ddls, 'd');
  out.notifiedMeetings = markList(src.notifiedMeetings);
  out.notifiedDdls = markList(src.notifiedDdls);

  if (isObj(src.pomo) && src.pomo.active === true && (src.pomo.phase === 'work' || src.pomo.phase === 'break') && Number.isFinite(src.pomo.endTs)) {
    out.pomo = { active: true, phase: src.pomo.phase, endTs: src.pomo.endTs };
  } else {
    out.pomo = null;
  }

  if (isObj(src.genJob) && typeof src.genJob.jobId === 'string') {
    const g = src.genJob;
    out.genJob = {
      jobId: g.jobId.slice(0, 80),
      sourceId: str(g.sourceId, '', 80),
      status: ['running', 'completed', 'partial', 'failed', 'cancelled', 'unavailable'].includes(g.status) ? g.status : 'failed',
      total: num(g.total, 0, 0, 50, true),
      succeeded: num(g.succeeded, 0, 0, 50, true),
      failed: num(g.failed, 0, 0, 50, true),
      activePose: g.activePose === null ? null : str(g.activePose, null, 20),
      errorCode: g.errorCode === null ? null : str(g.errorCode, null, 40),
      startedAt: num(g.startedAt, 0, 0),
      updatedAt: num(g.updatedAt, 0, 0)
    };
  } else {
    out.genJob = null;
  }

  if (isObj(src.petPos) && Number.isFinite(src.petPos.x) && Number.isFinite(src.petPos.y)) {
    out.petPos = { x: Math.round(src.petPos.x), y: Math.round(src.petPos.y) };
  } else {
    out.petPos = null;
  }
  keepForeignKeys(src, out);
  return out;
}

// 读取状态：文件缺失→默认值；JSON 损坏→备份后重建（不静默丢弃）
function readState(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch (e) {
    return { state: normalizeState(null), missing: true, corruptionBackup: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    let backup = null;
    try {
      backup = `${file}.corrupt-${Date.now()}`;
      fs.copyFileSync(file, backup);
    } catch (_) { backup = null; }
    return { state: normalizeState(null), missing: false, corruptionBackup: backup };
  }
  return { state: normalizeState(parsed), missing: false, corruptionBackup: null };
}

module.exports = { DEFAULT_STATE, ACTION_KEYS, normalizeState, readState };
