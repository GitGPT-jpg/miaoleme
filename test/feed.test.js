const test = require('node:test');
const assert = require('node:assert');
const { feedWater, feedFood, drinkCheckin } = require('../lib/feed');
const { normalizeState } = require('../lib/store');

const at = (h, m = 0) => new Date(2026, 9, 21, h, m, 0, 0).getTime();
const fresh = () => normalizeState(null);

test('喂水：仅回应讨水才加亲密度，连点不能刷分/刷水数', () => {
  const s = fresh();
  const base = s.stats.intimacy;
  const r1 = feedWater(s, at(10));
  assert.equal(r1.hadRequest, false);
  assert.equal(s.stats.intimacy, base, '无请求不加分');
  assert.equal(s.stats.waterDone, 1);
  const r2 = feedWater(s, at(10, 1));
  assert.equal(s.stats.intimacy, base, '连点仍不加分');
  assert.equal(s.stats.waterDone, 1, '5 分钟内连点不重复计数');

  s.feed.waterRequest = true;
  const r3 = feedWater(s, at(10, 2));
  assert.equal(r3.hadRequest, true);
  assert.equal(s.stats.intimacy, base + 1);
  assert.equal(s.feed.waterRequest, false);
});

test('喂饭：只标记当前餐次，非饭点不记账不弹假完成', () => {
  const s = fresh();
  // 上午 9 点，无请求
  const r1 = feedFood(s, at(9));
  assert.equal(r1.fed, false);
  assert.equal(s.feed.lastMealFed.lunch, '', '不吞掉午餐');
  assert.equal(s.stats.intimacy, 0);

  // 午餐窗口
  const r2 = feedFood(s, at(12, 10));
  assert.equal(r2.fed, true);
  assert.equal(r2.slot, 'lunch');
  assert.equal(s.feed.lastMealFed.lunch, '2026-10-21');
  assert.equal(s.feed.lastMealFed.dinner, '', '晚餐仍待喂');
  assert.equal(s.stats.intimacy, 0, '无请求不加分');

  // 晚餐讨粮后喂
  s.feed.mealRequest = true; s.feed.mealSlot = 'dinner'; s.feed.mealRequestDate = '2026-10-21';
  const r3 = feedFood(s, at(18, 10));
  assert.equal(r3.fed, true);
  assert.equal(r3.slot, 'dinner');
  assert.equal(s.stats.intimacy, 2);
  assert.equal(s.feed.mealRequest, false);
});

test('喝水打卡清待喂但不加亲密度', () => {
  const s = fresh();
  s.feed.waterRequest = true;
  s.feed.waterNagTs = 123;
  drinkCheckin(s, at(11));
  assert.equal(s.feed.waterRequest, false);
  assert.equal(s.feed.waterNagTs, 0);
  assert.equal(s.stats.waterDone, 1);
  assert.equal(s.stats.intimacy, 0);
});

test('过期 mealSlot 不产生假成功', () => {
  const s = fresh();
  s.feed.mealSlot = 'lunch';
  s.feed.mealRequest = true;
  s.feed.mealRequestDate = '2026-10-20'; // 昨天的请求
  const r = feedFood(s, new Date(2026, 9, 21, 9, 0).getTime()); // 今天 9 点
  assert.equal(r.fed, false, '过期请求 + 非饭点不应喂成功');
  assert.equal(s.feed.lastMealFed.lunch, '');
});

test('喝水打卡 5 分钟内重复点击不计数', () => {
  const s = fresh();
  drinkCheckin(s, at(10));
  drinkCheckin(s, at(10, 2));
  assert.equal(s.stats.waterDone, 1);
  drinkCheckin(s, at(10, 6));
  assert.equal(s.stats.waterDone, 2);
});
