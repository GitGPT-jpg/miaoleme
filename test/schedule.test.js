const test = require('node:test');
const assert = require('node:assert');
const {
  dateKey, mealSlotAt, mealEligible, inDndWindow, meetingNotice, ddlNotice, ddlLabel, clearMarks
} = require('../lib/schedule');

const at = (h, m = 0, day = 20) => new Date(2026, 9, day, h, m, 0, 0).getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test('餐次窗口边界：11:30 / 13:00 / 13:01 / 17:30 / 19:00', () => {
  assert.equal(mealSlotAt(at(11, 29)), null);
  assert.equal(mealSlotAt(at(11, 30)), 'lunch');
  assert.equal(mealSlotAt(at(13, 0)), 'lunch');
  assert.equal(mealSlotAt(at(13, 1)), null);
  assert.equal(mealSlotAt(at(17, 30)), 'dinner');
  assert.equal(mealSlotAt(at(19, 0)), 'dinner');
  assert.equal(mealSlotAt(at(19, 1)), null);
});

test('午餐请求不吞晚餐：日期+餐次独立去重', () => {
  const today = dateKey(at(12));
  const feed = {
    lastMealRequest: { lunch: today, dinner: '' },
    lastMealFed: { lunch: '', dinner: '' }
  };
  assert.equal(mealEligible(feed, 'lunch', at(17, 40)), false, '午餐已提醒过');
  assert.equal(mealEligible(feed, 'dinner', at(17, 40)), true, '晚餐仍应触发');
  assert.equal(mealEligible(feed, null, at(17, 40)), false);
  const fedLunch = { lastMealRequest: {}, lastMealFed: { lunch: today, dinner: '' } };
  assert.equal(mealEligible(fedLunch, 'lunch', at(12, 30)), false, '当天已喂过午餐');
});

test('跨午夜免打扰与普通时段边界', () => {
  const dnd = { enabled: true, start: '22:00', end: '08:00' };
  assert.equal(inDndWindow(dnd, at(22, 0)), true);
  assert.equal(inDndWindow(dnd, at(23, 30)), true);
  assert.equal(inDndWindow(dnd, at(7, 59)), true);
  assert.equal(inDndWindow(dnd, at(8, 0)), false);
  assert.equal(inDndWindow(dnd, at(12, 0)), false);
  const work = { enabled: true, start: '09:00', end: '18:00' };
  assert.equal(inDndWindow(work, at(9, 0)), true);
  assert.equal(inDndWindow(work, at(17, 59)), true);
  assert.equal(inDndWindow(work, at(18, 0)), false);
  assert.equal(inDndWindow({ enabled: false, start: '00:00', end: '23:59' }, at(12)), false);
  assert.equal(inDndWindow({ enabled: true, start: '12:00', end: '12:00' }, at(12)), false, 'start=end 视为关闭');
  assert.equal(inDndWindow({ enabled: true, start: '25:00', end: '08:00' }, at(23)), false, '非法时间不生效');
});

test('会议提醒文案使用真实剩余时间', () => {
  const now = at(10);
  const m = { id: 'm1', title: '周会', ts: now + 5 * MIN - 10 * 1000 };
  const notice = meetingNotice(m, now, []);
  assert.equal(notice.title, '📅 会议即将开始');
  assert.match(notice.body, /还有 5 分钟/);
  assert.deepEqual(notice.markKeys, ['m1:5']);

  const far = meetingNotice({ id: 'm2', title: 'x', ts: now + 6 * MIN }, now, []);
  assert.equal(far, null, '超过 5 分钟不提醒');

  const started = meetingNotice({ id: 'm3', title: '评审', ts: now - 3 * MIN }, now, []);
  assert.match(started.body, /已经开始 3 分钟/);
  assert.deepEqual(started.markKeys, ['m3:5', 'm3:0']);
});

test('会议休眠补偿：超过 10 分钟只补标记不打扰', () => {
  const now = at(12);
  const notice = meetingNotice({ id: 'm4', title: '晨会', ts: now - 2 * HOUR }, now, []);
  assert.equal(notice.title, null);
  assert.deepEqual(notice.markKeys.sort(), ['m4:0', 'm4:5']);
  const again = meetingNotice({ id: 'm4', title: '晨会', ts: now - 2 * HOUR }, now, ['m4:5', 'm4:0']);
  assert.equal(again, null);
});

test('DDL 只补发最紧迫一条并合并标记', () => {
  const now = at(12);
  const due = { id: 'd1', title: '交周报', ts: now + 30 * MIN };
  const n = ddlNotice(due, now, []);
  assert.match(n.body, /30 分钟后截止/);
  assert.deepEqual(n.markKeys.sort(), ['d1:d', 'd1:h']);
  assert.equal(ddlNotice(due, now, ['d1:d', 'd1:h']), null);

  const overdue = ddlNotice({ id: 'd2', title: 'x', ts: now - 5 * MIN }, now, []);
  assert.match(overdue.body, /已过截止时间 5 分钟/);
  assert.deepEqual(overdue.markKeys.sort(), ['d2:0', 'd2:d', 'd2:h']);
});

test('DDL 过期超过一天只标记不通知', () => {
  const now = at(12);
  const n = ddlNotice({ id: 'd3', title: 'x', ts: now - 2 * DAY }, now, []);
  assert.equal(n.title, null);
  assert.deepEqual(n.markKeys.sort(), ['d3:0', 'd3:d', 'd3:h']);
});

test('时间文案', () => {
  assert.match(ddlLabel(25 * HOUR), /1 天后截止/);
  assert.match(ddlLabel(5 * HOUR), /5 小时后截止/);
  assert.match(ddlLabel(9 * MIN), /9 分钟后截止/);
  assert.match(ddlLabel(-90 * 1000), /已过截止时间 2 分钟/);
});

test('删除事件清理提醒标记', () => {
  assert.deepEqual(clearMarks(['a:5', 'a:0', 'b:5'], 'a'), ['b:5']);
  assert.deepEqual(clearMarks(null, 'a'), []);
});

test('稍后提醒期间不触发，到期后恢复', () => {
  const now = at(12);
  const feed = { lastMealRequest: {}, lastMealFed: {} };
  assert.equal(mealEligible(feed, 'lunch', now, now + 10 * 60 * 1000), false);
  assert.equal(mealEligible(feed, 'lunch', now + 11 * 60 * 1000, now + 10 * 60 * 1000), true);
  assert.equal(mealEligible(feed, 'lunch', now, 0), true);
});
