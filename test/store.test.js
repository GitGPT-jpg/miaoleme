const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeState, readState, DEFAULT_STATE } = require('../lib/store');

const tmpFile = (content) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miaoleme-test-'));
  const f = path.join(dir, 'store.json');
  if (content !== undefined) fs.writeFileSync(f, content);
  return f;
};

test('null/非对象输入回退为默认值', () => {
  const a = normalizeState(null);
  assert.equal(a.form, 'custom');
  assert.equal(a.water.intervalMin, 45);
  assert.deepEqual(normalizeState('oops'), a);
  assert.deepEqual(normalizeState([1, 2]), a);
});

test('嵌套字段类型错误被修正与范围钳制', () => {
  const s = normalizeState({
    form: 'dragon',
    water: { enabled: 'yes', intervalMin: 9999, lastRemindTs: 'abc' },
    pomodoro: null,
    dnd: { enabled: 1, start: '25:99', end: '8:5' },
    stats: { intimacy: -5, waterDone: 'many', pomodoroDone: Infinity },
    petPos: { x: 'a', y: 3 }
  });
  assert.equal(s.form, 'custom');
  assert.equal(s.water.enabled, true, '非布尔值回退默认（默认开启）');
  assert.equal(s.water.intervalMin, 240);
  assert.equal(s.water.lastRemindTs, 0);
  assert.equal(s.pomodoro.workMin, 25);
  assert.equal(s.dnd.enabled, false);
  assert.equal(s.dnd.start, '22:00');
  assert.equal(s.dnd.end, '08:00');
  assert.equal(s.stats.intimacy, 0);
  assert.equal(s.stats.waterDone, 0);
  assert.equal(s.stats.pomodoroDone, 0);
  assert.equal(s.petPos, null);
});

test('合法字段保留，非法事件被过滤', () => {
  const s = normalizeState({
    form: 'cat',
    theme: 'dark',
    meetings: [
      { id: 'm1', title: '周会', ts: 100 },
      { id: 'bad', title: '', ts: 200 },
      { id: 'bad2', title: 'NaN', ts: 'x' },
      'garbage',
      { id: 'm2', title: '复盘', ts: 50 }
    ],
    ddls: [{ id: 'd1', title: '交周报', ts: 300 }]
  });
  assert.equal(s.form, 'cat');
  assert.equal(s.theme, 'dark');
  assert.deepEqual(s.meetings.map((m) => m.id), ['m2', 'm1']);
  assert.equal(s.ddls.length, 1);
});

test('旧版按天饭点去重迁移到 lunch/dinner', () => {
  const s = normalizeState({
    feed: { waterRequest: true, lastMealRequestDate: '2026-10-20', lastMealFedDate: '2026-10-19' }
  });
  assert.equal(s.feed.waterRequest, true);
  assert.equal(s.feed.lastMealRequest.lunch, '2026-10-20');
  assert.equal(s.feed.lastMealRequest.dinner, '2026-10-20');
  assert.equal(s.feed.lastMealFed.lunch, '2026-10-19');
  assert.equal(s.feed.lastMealFed.dinner, '2026-10-19');
});

test('提醒标记数组有上限', () => {
  const marks = Array.from({ length: 900 }, (_, i) => `m:${i}`);
  const s = normalizeState({ notifiedMeetings: marks, notifiedDdls: [1, 'ok', null, 'ok2'] });
  assert.equal(s.notifiedMeetings.length, 500);
  assert.deepEqual(s.notifiedDdls, ['ok', 'ok2']);
});

test('损坏 JSON：备份原文件并回退默认值', () => {
  const f = tmpFile('{ broken json');
  const res = readState(f);
  assert.ok(res.corruptionBackup, '应生成备份路径');
  assert.ok(fs.existsSync(res.corruptionBackup), '备份文件存在');
  assert.equal(fs.readFileSync(res.corruptionBackup, 'utf-8'), '{ broken json');
  assert.deepEqual(res.state, normalizeState(null));
});

test('文件缺失：返回默认值且 missing=true', () => {
  const f = tmpFile(undefined);
  const res = readState(f);
  assert.equal(res.missing, true);
  assert.deepEqual(res.state, normalizeState(null));
});

test('合法 JSON null 文件：回退默认值且不误报损坏', () => {
  const f = tmpFile('null');
  const res = readState(f);
  assert.equal(res.corruptionBackup, null);
  assert.deepEqual(res.state, normalizeState(null));
});

test('默认值对象不被 normalize 结果共享引用污染', () => {
  const a = normalizeState(null);
  a.water.intervalMin = 99;
  a.stats.intimacy = 123;
  assert.equal(DEFAULT_STATE.water.intervalMin, 45);
  assert.equal(DEFAULT_STATE.stats.intimacy, 0);
});
