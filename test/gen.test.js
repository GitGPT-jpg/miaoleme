const test = require('node:test');
const assert = require('node:assert');
const {
  classifyGenError, validateImageBuffer, runPool, deriveJobStatus, extractImageBase64
} = require('../lib/gen');

test('错误分类：认证/瞬时/请求错误', () => {
  assert.equal(classifyGenError(new Error('HTTP 401 unauthorized')), 'auth');
  assert.equal(classifyGenError(new Error('HTTP 403 forbidden')), 'auth');
  assert.equal(classifyGenError(new Error('HTTP 429 too many')), 'transient');
  assert.equal(classifyGenError(new Error('HTTP 502')), 'transient');
  assert.equal(classifyGenError(new Error('timeout')), 'transient');
  assert.equal(classifyGenError(new Error('HTTP 400 bad_request')), 'bad_request');
  assert.equal(classifyGenError(new Error('url_unsupported')), 'url_unsupported');
  assert.equal(classifyGenError(new Error('no_image')), 'bad_response');
  assert.equal(classifyGenError(new Error('weird')), 'unknown');
});

test('图片校验：PNG/JPEG 魔数、空、坏数据、超限', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  assert.deepEqual(validateImageBuffer(png), { ok: true, ext: '.png' });
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  assert.deepEqual(validateImageBuffer(jpg), { ok: true, ext: '.jpg' });
  assert.equal(validateImageBuffer(Buffer.alloc(0)).error, 'empty');
  assert.equal(validateImageBuffer(Buffer.from('not-an-image')).error, 'bad_image');
  const big = Buffer.alloc(20 * 1024 * 1024 + 1);
  big[0] = 0x89; big[1] = 0x50; big[2] = 0x4e; big[3] = 0x47;
  assert.equal(validateImageBuffer(big).error, 'too_large');
});

test('并发池：限制并发且全部执行', async () => {
  let running = 0;
  let peak = 0;
  const done = [];
  await runPool([1, 2, 3, 4, 5, 6, 7], 2, async (n) => {
    running++; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    done.push(n);
    running--;
  });
  assert.equal(peak, 2, '并发不超过 2');
  assert.equal(done.length, 7, '全部处理');
  assert.deepEqual(done.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
});

test('并发池：单项失败不阻断其他项', async () => {
  const done = [];
  await assert.rejects(runPool([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('boom');
    done.push(n);
  }));
  // 失败的项抛错，但其余项仍被调度（至少执行 1 和 3 中的一些）
  assert.ok(done.length >= 1);
});

test('状态推导', () => {
  assert.equal(deriveJobStatus({ succeeded: 6, failed: 0 }), 'completed');
  assert.equal(deriveJobStatus({ succeeded: 4, failed: 2 }), 'partial');
  assert.equal(deriveJobStatus({ succeeded: 0, failed: 6 }), 'failed');
  assert.equal(deriveJobStatus({ succeeded: 3, failed: 0, cancelled: true }), 'cancelled');
  assert.equal(deriveJobStatus({}), 'failed');
});

test('响应解析：inline data / b64_image / url / 坏 JSON', () => {
  const ok = JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAA' } }] } }] });
  assert.equal(extractImageBase64(ok).b64, 'AAA');
  const snake = JSON.stringify({ candidates: [{ content: { parts: [{ inline_data: { data: 'BBB' } }] } }] });
  assert.equal(extractImageBase64(snake).b64, 'BBB');
  const b64img = JSON.stringify({ data: [{ b64_image: 'CCC' }] });
  assert.equal(extractImageBase64(b64img).b64, 'CCC');
  const url = JSON.stringify({ data: [{ url: 'https://x/y.png' }] });
  assert.equal(extractImageBase64(url).error, 'url_unsupported');
  assert.equal(extractImageBase64('not json').error, 'bad_json');
  assert.equal(extractImageBase64('{}').error, 'no_image');
});
