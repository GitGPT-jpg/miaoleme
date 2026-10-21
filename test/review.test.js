const test = require('node:test');
const assert = require('node:assert');
const {
  STORAGE_KEY, MOODS, dateKey, shiftDay, normalizeRecord, isMeaningful,
  streakOf, sortedKeys, summaryOf, mergeImport
} = require('../lib/review');

test('dateKey：本地日期补零，跨时区一致取本地', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dateKey(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('shiftDay：跨月与跨年', () => {
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay('2024-03-01', -1), '2024-02-29');
  assert.equal(shiftDay('2026-10-21', 1), '2026-10-22');
});

test('normalizeRecord：去空白、星级夹取、心情白名单', () => {
  const r = normalizeRecord({done: '  写了周报  ', star: 9, mood: MOODS[1]});
  assert.equal(r.done, '写了周报');
  assert.equal(r.star, 5);
  assert.equal(r.mood, MOODS[1]);
  assert.equal(normalizeRecord({star: -3}).star, 0);
  assert.equal(normalizeRecord({star: 3.6}).star, 4);
  assert.equal(normalizeRecord({star: 'abc'}).star, 0);
  assert.equal(normalizeRecord({mood: '😡 愤怒'}).mood, '');
  assert.equal(normalizeRecord({}).ts, 0);
});

test('isMeaningful：空白表单不可保存', () => {
  assert.equal(isMeaningful(normalizeRecord({})), false);
  assert.equal(isMeaningful(normalizeRecord({done: '   '})), false);
  assert.equal(isMeaningful(normalizeRecord({quote: '一句话'})), true);
  assert.equal(isMeaningful(null), false);
});

test('streakOf：从今天往前连数', () => {
  const records = {'2026-10-21': {}, '2026-10-20': {}, '2026-10-19': {}, '2026-10-17': {}};
  assert.equal(streakOf(records, '2026-10-21'), 3);
});

test('streakOf：今天未写时从昨天算', () => {
  const records = {'2026-10-20': {}, '2026-10-19': {}};
  assert.equal(streakOf(records, '2026-10-21'), 2);
});

test('streakOf：断档、空数据、跨月', () => {
  assert.equal(streakOf({'2026-10-21': {}, '2026-10-19': {}}, '2026-10-21'), 1);
  assert.equal(streakOf({}, '2026-10-21'), 0);
  assert.equal(streakOf(null, '2026-10-21'), 0);
  const crossMonth = {'2026-09-30': {}, '2026-10-01': {}, '2026-10-02': {}};
  assert.equal(streakOf(crossMonth, '2026-10-02'), 3);
});

test('sortedKeys：按日期倒序', () => {
  assert.deepEqual(sortedKeys({'2026-10-19': {}, '2026-10-21': {}, '2026-10-20': {}}),
    ['2026-10-21', '2026-10-20', '2026-10-19']);
  assert.deepEqual(sortedKeys(null), []);
});

test('summaryOf：优先完成项、压平换行、超长截断', () => {
  assert.equal(summaryOf({done: 'A\n\nB', gain: 'C'}), 'A B');
  assert.equal(summaryOf({gain: 'C'}), 'C');
  assert.equal(summaryOf({}), '（仅打卡）');
  assert.equal(summaryOf(null), '');
  const long = 'x'.repeat(80);
  const out = summaryOf({done: long}, 10);
  assert.equal(out.length, 11);
  assert.ok(out.endsWith('…'));
});

test('mergeImport：只接受日期键，返回条数', () => {
  const target = {};
  const n = mergeImport(target, {
    '2026-10-21': {done: 'x'},
    'bad-key': {done: 'y'},
    '2026-10-20': null,
    '2026-10-19': 'oops'
  });
  assert.equal(n, 1);
  assert.deepEqual(Object.keys(target), ['2026-10-21']);
  assert.equal(mergeImport({}, null), 0);
  assert.equal(mergeImport({}, 'nope'), 0);
});

test('存储键与心情列表稳定', () => {
  assert.equal(STORAGE_KEY, 'miaoleme.review.v1');
  assert.equal(MOODS.length, 5);
});
