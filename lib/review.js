// 每日复盘：记录校验、连续打卡与导入导出逻辑（UMD：浏览器与 Node 共用）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
const STORAGE_KEY = 'miaoleme.review.v1';
const FIELDS = ['done', 'gain', 'prob', 'plan', 'quote'];
const MOODS = ['😄 元气满满', '🙂 还不错', '😐 平平淡淡', '😪 有点累', '😣 不太顺'];
const MOOD_ICON = {'😄 元气满满': '😄', '🙂 还不错': '🙂', '😐 平平淡淡': '😐', '😪 有点累': '😪', '😣 不太顺': '😣'};
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// 本地时区的 YYYY-MM-DD；Date 可传字符串或 Date 实例
function dateKey(d) {
  const date = d instanceof Date ? d : (d ? new Date(d) : new Date());
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function shiftDay(key, delta) {
  const parts = key.split('-').map(Number);
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + delta);
  return dateKey(d);
}

function trim(s) {
  return typeof s === 'string' ? s.replace(/^\s+|\s+$/g, '') : '';
}

// 归一化表单输入；star 限制 0~5，mood 只接受已知值
function normalizeRecord(input) {
  const r = {};
  FIELDS.forEach((k) => { r[k] = trim(input && input[k]); });
  const star = Number(input && input.star);
  r.star = Number.isFinite(star) ? Math.max(0, Math.min(5, Math.round(star))) : 0;
  r.mood = input && MOODS.includes(input.mood) ? input.mood : '';
  r.ts = Number(input && input.ts) || 0;
  return r;
}

// 至少写了一个字段才允许保存
function isMeaningful(r) {
  return !!r && FIELDS.some((k) => r[k]);
}

// 连续打卡：从今天（今天没写则从昨天）往前数
function streakOf(records, todayKey) {
  const today = todayKey || dateKey();
  let cursor = today;
  if (!records || !records[cursor]) cursor = shiftDay(today, -1);
  let n = 0;
  while (records && records[cursor]) {
    n++;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

// 历史列表：按日期倒序
function sortedKeys(records) {
  return Object.keys(records || {}).sort().reverse();
}

// 摘要：优先完成项，压平换行并截断
function summaryOf(r, max) {
  if (!r) return '';
  const text = r.done || r.gain || r.plan || r.quote || '（仅打卡）';
  const flat = text.replace(/\s*\n+\s*/g, ' ').trim();
  const limit = max || 60;
  return flat.length > limit ? flat.slice(0, limit) + '…' : flat;
}

// 导入：只接受 YYYY-MM-DD 键且值为对象的条目，返回合并数量
function mergeImport(existing, incoming) {
  const target = existing || {};
  if (!incoming || typeof incoming !== 'object') return 0;
  let n = 0;
  Object.keys(incoming).forEach((k) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    if (!incoming[k] || typeof incoming[k] !== 'object') return;
    target[k] = incoming[k];
    n++;
  });
  return n;
}

return {STORAGE_KEY, FIELDS, MOODS, MOOD_ICON, WEEK, pad, dateKey, shiftDay, trim,
  normalizeRecord, isMeaningful, streakOf, sortedKeys, summaryOf, mergeImport};
});
