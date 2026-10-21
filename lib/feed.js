// 喂养状态迁移（纯函数，直接操作传入 state，便于单测）
const { mealSlotAt, dateKey, feedPlan } = require('./schedule');

const WATER_CHECKIN_MIN_GAP = 5 * 60 * 1000;

function feedWater(state, now) {
  const hadRequest = !!state.feed.waterRequest;
  const last = state.water.lastCheckinTs || 0;
  // 回应讨水，或距上次打卡超过 5 分钟才计数；连点不刷水数/等级
  const counted = hadRequest || now - last >= WATER_CHECKIN_MIN_GAP;
  state.feed.waterRequest = false;
  state.feed.waterNagTs = 0;
  state.water.lastRemindTs = now;
  if (counted) {
    state.stats.waterDone += 1;
    state.water.lastCheckinTs = now;
  }
  if (hadRequest) state.stats.intimacy += 1;
  return { hadRequest, counted, awarded: hadRequest };
}

function feedFood(state, now) {
  const plan = feedPlan(state.feed, now);
  state.feed.mealRequest = false;
  state.feed.mealNagTs = 0;
  state.feed.mealSlot = null;
  state.feed.mealRequestDate = '';
  if (plan.markFed) {
    state.feed.lastMealFed[plan.slot] = dateKey(now);
    if (plan.awardIntimacy) state.stats.intimacy += 2;
  }
  return { fed: !!plan.markFed, slot: plan.markFed ? plan.slot : null, awarded: plan.markFed && plan.awardIntimacy };
}

function drinkCheckin(state, now) {
  const last = state.water.lastCheckinTs || 0;
  if (now - last >= WATER_CHECKIN_MIN_GAP) {
    state.stats.waterDone += 1;
    state.water.lastCheckinTs = now;
  }
  state.water.lastRemindTs = now;
  state.feed.waterRequest = false;
  state.feed.waterNagTs = 0;
  return { cleared: true };
}

module.exports = { feedWater, feedFood, drinkCheckin, WATER_CHECKIN_MIN_GAP };
