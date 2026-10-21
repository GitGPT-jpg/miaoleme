// 纯调度逻辑（不依赖 Electron，可单测）：时间窗口、餐次去重、免打扰、会议/DDL 提醒文案与去重
const MEAL_WINDOWS = {
  lunch: { start: 11 * 60 + 30, end: 13 * 60 },
  dinner: { start: 17 * 60 + 30, end: 19 * 60 }
};

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function minutesOfDay(ts) {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

// 当前所处餐次：'lunch' | 'dinner' | null
function mealSlotAt(ts, windows = MEAL_WINDOWS) {
  const m = minutesOfDay(ts);
  for (const slot of ['lunch', 'dinner']) {
    const w = windows[slot];
    if (m >= w.start && m <= w.end) return slot;
  }
  return null;
}

// 该餐次今天是否还需要发请求（日期+餐次独立去重）
function mealEligible(feed, slot, ts, snoozeUntil = 0) {
  if (!slot || !feed) return false;
  if (ts < snoozeUntil) return false;
  const today = dateKey(ts);
  const asked = feed.lastMealRequest && feed.lastMealRequest[slot];
  const fed = feed.lastMealFed && feed.lastMealFed[slot];
  return asked !== today && fed !== today;
}

// 免打扰：支持跨午夜；start === end 视为关闭
function inDndWindow(dnd, ts) {
  if (!dnd || !dnd.enabled) return false;
  const parse = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    const h = Number(m[1]);
    const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  const start = parse(dnd.start);
  const end = parse(dnd.end);
  if (start === null || end === null || start === end) return false;
  const cur = minutesOfDay(ts);
  if (start > end) return cur >= start || cur < end; // 跨午夜
  return cur >= start && cur < end;
}

// 会议提醒：返回一条通知（或仅补标记）；已提醒/无需提醒返回 null
// 休眠/暂停跨过窗口时：10 分钟内补发“已开始”，超过 10 分钟只补标记不再打扰
function meetingNotice(meeting, now, notified) {
  const diff = meeting.ts - now;
  const key5 = meeting.id + ':5';
  const key0 = meeting.id + ':0';
  const mark = (k) => !notified.includes(k);
  if (diff > 5 * MIN) return null;

  if (diff <= -10 * MIN) {
    const keys = [key5, key0].filter(mark);
    return keys.length ? { title: null, markKeys: keys } : null;
  }
  if (diff <= 0) {
    if (!mark(key0)) return null;
    const late = Math.max(1, Math.round(-diff / MIN));
    return {
      title: '📅 会议开始',
      body: `「${meeting.title}」已经开始 ${late} 分钟`,
      pet: `开会时间到：「${meeting.title}」`,
      markKeys: [key5, key0].filter(mark)
    };
  }
  if (!mark(key5)) return null;
  const mins = Math.max(1, Math.round(diff / MIN));
  return {
    title: '📅 会议即将开始',
    body: `「${meeting.title}」还有 ${mins} 分钟开始`,
    pet: `「${meeting.title}」快开会啦！`,
    markKeys: [key5]
  };
}

const DDL_STAGES = [
  { k: 'd', ms: DAY },
  { k: 'h', ms: HOUR },
  { k: '0', ms: 0 }
];

function ddlLabel(diff) {
  if (diff <= 0) return `已过截止时间 ${Math.max(1, Math.round(-diff / MIN))} 分钟`;
  const mins = Math.round(diff / MIN);
  if (mins < 60) return `${mins} 分钟后截止`;
  const hours = Math.round(diff / HOUR);
  if (hours < 24) return `${hours} 小时后截止`;
  return `${Math.round(diff / DAY)} 天后截止`;
}

// DDL 提醒：只发最紧迫的一条已过期阶段，并把更早的阶段一起标记，避免补发一串
function ddlNotice(ddl, now, notified) {
  const diff = ddl.ts - now;
  const passed = DDL_STAGES.filter((s) => diff <= s.ms && !notified.includes(ddl.id + ':' + s.k));
  if (!passed.length) return null;
  const keys = passed.map((s) => ddl.id + ':' + s.k);
  if (diff <= -DAY) return { title: null, markKeys: keys }; // 过期超过一天：只标记
  const urgent = passed[passed.length - 1];
  return {
    title: '⏰ DDL 提醒',
    body: `「${ddl.title}」${ddlLabel(diff)}`,
    pet: `DDL：「${ddl.title}」${ddlLabel(diff)}！`,
    markKeys: keys,
    stage: urgent.k
  };
}

// 删除事件时清理对应提醒标记
function clearMarks(marks, id) {
  return (Array.isArray(marks) ? marks : []).filter((k) => typeof k === 'string' && !k.startsWith(id + ':'));
}

// 喂饭决策：返回本次应标记的餐次（无待喂请求且不在餐窗时返回 null）
function feedPlan(feed, ts) {
  const today = dateKey(ts);
  const slotValid = !!(feed && feed.mealRequest && feed.mealSlot
    && (!feed.mealRequestDate || feed.mealRequestDate === today));
  const slot = slotValid ? feed.mealSlot : mealSlotAt(ts);
  const hadRequest = !!slotValid;
  return { slot, hadRequest, markFed: !!slot, awardIntimacy: hadRequest };
}

module.exports = {
  MEAL_WINDOWS,
  dateKey,
  minutesOfDay,
  mealSlotAt,
  mealEligible,
  inDndWindow,
  meetingNotice,
  ddlNotice,
  ddlLabel,
  clearMarks,
  feedPlan
};
