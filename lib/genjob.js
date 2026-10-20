// 生成任务编排（可注入依赖，单测覆盖隔离/取消/部分成功/截止）
const { runPool, deriveJobStatus } = require('./gen');

function createGenJob(opts) {
  const {
    jobId, sourceId, tasks,
    genFrame, applyFrame, onUpdate = () => {}, isCurrent = () => true,
    now = Date.now, concurrency = 2, deadlineMs = 10 * 60 * 1000
  } = opts;

  const job = {
    jobId,
    sourceId,
    status: 'running',
    total: tasks.length,
    succeeded: 0,
    failed: 0,
    activePose: null,
    errorCode: null,
    cancelled: false,
    startedAt: now(),
    updatedAt: now()
  };

  function snapshot() {
    return {
      jobId: job.jobId, sourceId: job.sourceId, status: job.status,
      total: job.total, succeeded: job.succeeded, failed: job.failed,
      activePose: job.activePose, errorCode: job.errorCode,
      startedAt: job.startedAt, updatedAt: job.updatedAt
    };
  }

  const changed = () => { job.updatedAt = now(); onUpdate(snapshot()); };
  const alive = () => !job.cancelled && isCurrent();

  async function runOne(task) {
    if (!alive()) return;
    if (now() > job.startedAt + deadlineMs) {
      if (!job.errorCode) job.errorCode = 'deadline';
      return;
    }
    job.activePose = task.label || task.key;
    changed();
    let res;
    try {
      res = await genFrame(task);
    } catch (e) {
      res = { ok: false, error: 'unknown' };
    }
    if (!alive()) return; // 过期结果不写回
    if (res && res.ok) {
      applyFrame(task.key, res.path);
      job.succeeded += 1;
    } else {
      job.failed += 1;
      if (!job.errorCode) job.errorCode = (res && res.error) || 'unknown';
    }
    job.activePose = null;
    changed();
  }

  async function run() {
    const priority = tasks.filter((t) => t.priority);
    const rest = tasks.filter((t) => !t.priority);
    for (const t of priority) await runOne(t);       // 站立优先
    await runPool(rest, concurrency, runOne);         // 其余并发
    if (!alive()) return snapshot();
    const attempted = job.succeeded + job.failed;
    if (attempted < job.total) {
      job.failed += job.total - attempted;            // 截止/跳过项如实计为失败
      if (!job.errorCode) job.errorCode = 'deadline';
    }
    job.activePose = null;
    job.status = deriveJobStatus({ succeeded: job.succeeded, failed: job.failed, cancelled: job.cancelled });
    changed();
    return snapshot();
  }

  function cancel() {
    if (job.status !== 'running') return snapshot();
    job.cancelled = true;
    job.status = 'cancelled';
    job.activePose = null;
    changed();
    return snapshot();
  }

  return { job, run, cancel, snapshot };
}

module.exports = { createGenJob };
