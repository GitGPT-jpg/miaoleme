const test = require('node:test');
const assert = require('node:assert');
const {FOODS, findFood, projection, summarize, toneOf, signed} = require('../lib/lifebite');

test('食物库：条目齐全且字段完整', () => {
  assert.ok(FOODS.length >= 15);
  const ids = new Set();
  FOODS.forEach((f) => {
    assert.ok(f.id && !ids.has(f.id), 'id 唯一：' + f.id);
    ids.add(f.id);
    assert.ok(f.name && f.emo && f.desc);
    assert.ok(Number.isFinite(f.life));
    assert.equal(f.macro.length, 4);
    assert.ok(f.nutri.length >= 4);
    assert.ok(f.pills.length >= 2);
    assert.ok(f.verdict && f.explain);
  });
});

test('findFood：命中与未命中', () => {
  assert.equal(findFood('avocado').name, '牛油果');
  assert.equal(findFood('nope'), null);
  assert.equal(findFood(undefined), null);
});

test('projection：分钟/小时/天三档格式化与符号', () => {
  assert.deepEqual(projection(10, 1), {minutes: 10, text: '+10 分钟', sign: 'good'});
  assert.deepEqual(projection(-14, 52), {minutes: -728, text: '-12.1 小时', sign: 'bad'});
  assert.deepEqual(projection(26, 365), {minutes: 9490, text: '+6.6 天', sign: 'good'});
  assert.deepEqual(projection(0, 365), {minutes: 0, text: '+0 分钟', sign: 'good'});
});

test('projection：四舍五入到整分钟', () => {
  assert.equal(projection(4, 3.5).minutes, 14);
  assert.equal(projection(-4, 3.5).minutes, -14);
});

test('summarize：累加、好坏计数与整体色调', () => {
  const s = summarize(['avocado', 'bacon', 'salmon']);
  assert.equal(s.count, 3);
  assert.equal(s.minutes, 23 - 28 + 16);
  assert.equal(s.good, 2);
  assert.equal(s.bad, 1);
  assert.equal(s.tone, 'good');
  const t = summarize(['bacon']);
  assert.equal(t.tone, 'bad');
});

test('summarize：忽略未知 id 与空输入', () => {
  assert.deepEqual(summarize(['ghost']), {minutes: 0, good: 0, bad: 0, count: 0, tone: 'good'});
  assert.equal(summarize(null).count, 0);
  assert.equal(summarize(undefined).count, 0);
});

test('toneOf / signed：符号展示', () => {
  assert.equal(toneOf(0), 'good');
  assert.equal(toneOf(-1), 'bad');
  assert.equal(signed(23), '+23');
  assert.equal(signed(-3), '-3');
});
