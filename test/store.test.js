const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normalizeState, readState, DEFAULT_STATE, ACTION_KEYS } = require('../lib/store');

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

test('自定义吃饭菜单：过滤非法项并保留合法菜单', () => {
  const s = normalizeState({
    mealMenus: { lunch: ['黄焖鸡', '', 3, '麻辣烫', '沙拉'], dinner: ['只有一个'] }
  });
  assert.deepEqual(s.mealMenus.lunch, ['黄焖鸡', '麻辣烫', '沙拉']);
  assert.equal(s.mealMenus.dinner, null, '少于 2 项视为未设置');
  const empty = normalizeState({});
  assert.deepEqual(empty.mealMenus, { lunch: null, dinner: null });
});

test('自定义吃饭菜单：数量上限 12 项，单项 20 字', () => {
  const many = Array.from({ length: 20 }, (_, i) => `菜品${i}`.repeat(10));
  const s = normalizeState({ mealMenus: { lunch: many } });
  assert.equal(s.mealMenus.lunch.length, 12);
  assert.ok(s.mealMenus.lunch.every((x) => x.length <= 20));
});

test('小游戏战绩：非法值归零、合法值保留', () => {
  const s = normalizeState({ games: { rps: { win: 3, lose: -1, draw: 'x' } } });
  assert.deepEqual(s.games.rps, { win: 3, lose: 0, draw: 0 });
  const empty = normalizeState({});
  assert.deepEqual(empty.games.rps, { win: 0, lose: 0, draw: 0 });
});

test('饭点请求日期与稍后提醒时间：归一化', () => {
  const s = normalizeState({ feed: { mealRequestDate: '2026-10-21', mealSnoozeUntil: 12345, mealSlot: 'dinner' } });
  assert.equal(s.feed.mealRequestDate, '2026-10-21');
  assert.equal(s.feed.mealSnoozeUntil, 12345);
  assert.equal(s.feed.mealSlot, 'dinner');
  const bad = normalizeState({ feed: { mealRequestDate: 5, mealSnoozeUntil: 'x', mealSlot: 'tea' } });
  assert.equal(bad.feed.mealRequestDate, '');
  assert.equal(bad.feed.mealSnoozeUntil, 0);
  assert.equal(bad.feed.mealSlot, null);
});

test('奔跑序列：默认空、合法路径保留、缺帧留 null、上限 8 帧', () => {
  assert.deepEqual(normalizeState({}).customGenRunSeq, []);
  const paths = Array.from({ length: 8 }, (_, i) => `/tmp/pet-gen-run-${i + 1}.png`);
  assert.deepEqual(normalizeState({ customGenRunSeq: paths }).customGenRunSeq, paths);
  assert.deepEqual(
    normalizeState({ customGenRunSeq: paths.concat(['/tmp/extra.png']) }).customGenRunSeq,
    paths,
    '超出 8 帧的部分被截断'
  );
  const holes = normalizeState({ customGenRunSeq: ['/tmp/a.png', 5, null, '/tmp/d.png'] }).customGenRunSeq;
  assert.deepEqual(holes, ['/tmp/a.png', null, null, '/tmp/d.png'], '非法项留 null，保持槽位对应');
});

test('奔跑序列：非数组与全空输入收敛为空数组', () => {
  for (const bad of [null, 'x', 5, {}, [], [null, null], ['', 0]]) {
    assert.deepEqual(normalizeState({ customGenRunSeq: bad }).customGenRunSeq, []);
  }
  assert.deepEqual(
    normalizeState({ customGenRunSeq: ['/tmp/a.png', null, null] }).customGenRunSeq,
    ['/tmp/a.png'],
    '尾部空槽收敛掉'
  );
});

test('动作帧白名单：只接受已知动作键', () => {
  const s = normalizeState({ customGenActions: { roll: '/tmp/r.png', run: '/tmp/x.png', fly: '/tmp/f.png' } });
  assert.deepEqual(s.customGenActions, { roll: '/tmp/r.png' }, '奔跑帧不走 actions，走 customGenRunSeq');
  assert.deepEqual(ACTION_KEYS, ['roll', 'groom', 'eat', 'sleep', 'drink', 'stretch']);
});

test('未知顶层字段原样保留（同一 userData 可能被别的分支构建读写）', () => {
  const s = normalizeState({
    form: 'dragon',                                  // 已知字段照旧纠正
    health: { hp: 7, lastFed: 123 },
    hunt: { wins: 2, nested: { deep: [1, 2, 3] } },
    futureFlag: true
  });
  assert.equal(s.form, 'custom');
  assert.deepEqual(s.health, { hp: 7, lastFed: 123 }, '别的分支的字段不得被抹掉');
  assert.deepEqual(s.hunt, { wins: 2, nested: { deep: [1, 2, 3] } });
  assert.equal(s.futureFlag, true);
  const again = normalizeState(s);
  assert.deepEqual(again.health, s.health, '多轮读写保持稳定');
});

test('未知字段有上限：数量、体积、不可序列化值', () => {
  const many = {};
  for (let i = 0; i < 40; i++) many['x' + i] = i;
  const kept = Object.keys(normalizeState(many)).filter((k) => /^x\d+$/.test(k));
  assert.equal(kept.length, 24, '最多保留 24 个未知字段');

  const big = normalizeState({ blob: 'a'.repeat(70 * 1024) });
  assert.equal('blob' in big, false, '超过 64KB 的未知字段丢弃');

  const cyclic = { ring: {} };
  cyclic.ring.self = cyclic.ring;
  assert.equal('ring' in normalizeState(cyclic), false, '含循环引用的字段跳过，不抛异常');

  assert.equal('fn' in normalizeState({ fn: () => 1 }), false, '函数不可序列化，跳过');
  assert.equal(normalizeState({ customGenRunSeq: ['/a.png'] }).customGenRunSeq.length, 1, '已知字段不受影响');
});
