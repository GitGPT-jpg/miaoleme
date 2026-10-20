// 番茄钟恢复策略（纯函数）：可解释、不虚构完成次数
// saved: { active, phase: 'work'|'break', endTs } | null
// 返回：{ action:'idle' } | { action:'resume', phase, remainMs } | { action:'expired', phase }
function restorePomodoro(saved, now) {
  if (!saved || saved.active !== true) return { action: 'idle' };
  if (saved.phase !== 'work' && saved.phase !== 'break') return { action: 'idle' };
  if (!Number.isFinite(saved.endTs) || saved.endTs <= 0) return { action: 'idle' };
  if (now >= saved.endTs) return { action: 'expired', phase: saved.phase };
  return { action: 'resume', phase: saved.phase, remainMs: saved.endTs - now };
}

function pomoSnapshot(pomo) {
  if (!pomo || !pomo.active) return null;
  return { active: true, phase: pomo.phase, endTs: pomo.endTs };
}

module.exports = { restorePomodoro, pomoSnapshot };
