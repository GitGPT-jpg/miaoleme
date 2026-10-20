const test = require('node:test');
const assert = require('node:assert');
const { createGenJob } = require('../lib/genjob');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function makeTasks(n = 3) {
  return Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `任务${i}` }));
}

test('正常完成：priority 先跑，其余并发不超过 2，状态 completed', async () => {
  const order = [];
  let running = 0;
  let peak = 0;
  const applied = [];
  const job = createGenJob({
    jobId: 'j1', sourceId: 's1',
    tasks: [{ key: 'idle', label: '站立', priority: true }].concat(makeTasks(4)),
    genFrame: async (t) => {
      running++; peak = Math.max(peak, running);
      order.push(t.key);
      await delay(5);
      running--;
      return { ok: true, path: `/tmp/${t.key}.png` };
    },
    applyFrame: (k, p) => applied.push([k, p])
  });
  const snap = await job.run();
  assert.equal(snap.status, 'completed');
  assert.equal(snap.succeeded, 5);
  assert.equal(snap.failed, 0);
  assert.equal(order[0], 'idle', '站立优先');
  assert.ok(peak <= 2, `并发不超过 2，实际 ${peak}`);
  assert.equal(applied.length, 5);
});

test('部分成功：status=partial 且计数正确', async () => {
  const applied = [];
  const job = createGenJob({
    jobId: 'j2', sourceId: 's2', tasks: makeTasks(4),
    genFrame: async (t) => (t.key === 'k1' ? { ok: false, error: 'transient' } : { ok: true, path: t.key }),
    applyFrame: (k) => applied.push(k)
  });
  const snap = await job.run();
  assert.equal(snap.status, 'partial');
  assert.equal(snap.succeeded, 3);
  assert.equal(snap.failed, 1);
  assert.equal(snap.errorCode, 'transient');
  assert.deepEqual(applied.sort(), ['k0', 'k2', 'k3']);
});

test('全部失败：status=failed', async () => {
  const job = createGenJob({
    jobId: 'j3', sourceId: 's3', tasks: makeTasks(2),
    genFrame: async () => ({ ok: false, error: 'auth' }),
    applyFrame: () => {}
  });
  const snap = await job.run();
  assert.equal(snap.status, 'failed');
  assert.equal(snap.succeeded, 0);
  assert.equal(snap.failed, 2);
});

test('任务隔离：旧任务（非当前）的结果不回写', async () => {
  let current = 'A';
  const appliedA = [];
  const jobA = createGenJob({
    jobId: 'A', sourceId: 'srcA', tasks: makeTasks(1),
    genFrame: async () => { await delay(20); return { ok: true, path: '/tmp/a.png' }; },
    applyFrame: (k, p) => appliedA.push(p),
    isCurrent: () => current === 'A'
  });
  const p = jobA.run();
  await delay(5);
  current = 'B'; // 新上传，A 失效
  await p;
  assert.deepEqual(appliedA, [], 'A 的迟到结果不得写入');
});

test('取消：status=cancelled，在途结果不应用', async () => {
  const applied = [];
  const job = createGenJob({
    jobId: 'j4', sourceId: 's4', tasks: makeTasks(3),
    genFrame: async (t) => { await delay(15); return { ok: true, path: t.key }; },
    applyFrame: (k) => applied.push(k)
  });
  const p = job.run();
  await delay(5);
  job.cancel();
  await p;
  assert.equal(job.snapshot().status, 'cancelled');
  assert.ok(applied.length <= 1, '取消后不再应用新结果');
});

test('截止：超时后未尝试项计入失败且 errorCode=deadline', async () => {
  let t = 0;
  const job = createGenJob({
    jobId: 'j5', sourceId: 's5', tasks: makeTasks(4),
    genFrame: async (task) => { t += 20 * 60 * 1000; return { ok: true, path: task.key }; },
    applyFrame: () => {},
    now: () => t,
    concurrency: 1,
    deadlineMs: 10 * 60 * 1000
  });
  const snap = await job.run();
  assert.equal(snap.succeeded, 1, '只有第一个任务在截止前执行');
  assert.equal(snap.failed, 3, '其余如实计为失败');
  assert.equal(snap.status, 'partial');
  assert.equal(snap.errorCode, 'deadline');
});

test('genFrame 抛错被捕获为失败而非中断', async () => {
  const job = createGenJob({
    jobId: 'j6', sourceId: 's6', tasks: makeTasks(2),
    genFrame: async () => { throw new Error('boom'); },
    applyFrame: () => {}
  });
  const snap = await job.run();
  assert.equal(snap.status, 'failed');
  assert.equal(snap.failed, 2);
});
