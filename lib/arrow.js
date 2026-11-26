// 纸箭头：小猫扑中光标时藏起的道具（只是猫自己的贴图，真实光标始终归用户）。
// 规则：扑中一次只藏一枚；番茄休息开始或下次启动安顿好时归还；归还后不再重复。
const REASONS = ['pomo-break', 'startup'];

function normalize(pa) {
  const o = pa && typeof pa === 'object' ? pa : {};
  return { held: !!o.held, heldAt: Number(o.heldAt) || 0, returned: !!o.returned };
}

// 扑中：手里没有箭头才藏一枚；已藏的不覆盖时间戳
function markCaught(pa, now) {
  const cur = normalize(pa);
  if (cur.held) return cur;
  return { held: true, heldAt: now, returned: false };
}

// 是否该归还：必须正藏着、尚未归还、原因合法
function shouldReturn(pa, reason) {
  const cur = normalize(pa);
  return REASONS.includes(reason) && cur.held && !cur.returned;
}

// 渲染层演完「推回来」后确认：清空手里的箭头，标记已归还
function markReturned(pa) {
  const cur = normalize(pa);
  if (!cur.held) return cur;
  return { held: false, heldAt: cur.heldAt, returned: true };
}

module.exports = { REASONS, normalize, markCaught, shouldReturn, markReturned };
