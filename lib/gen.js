// 生成任务的纯逻辑：错误分类、图片校验、并发池、状态推导（可单测）
const IMG_MAX_BYTES = 20 * 1024 * 1024;

function classifyGenError(err) {
  const msg = String((err && err.message) || err || '');
  if (/HTTP 401|HTTP 403|login-name|unauthorized|forbidden/i.test(msg)) return 'auth';
  if (/HTTP 429|HTTP 5\d\d|timeout|ECONNRESET|ETIMEDOUT|socket|network/i.test(msg)) return 'transient';
  if (/HTTP 4\d\d|bad_request|invalid/i.test(msg)) return 'bad_request';
  if (/url_unsupported/.test(msg)) return 'url_unsupported';
  if (/no_image|bad_json|bad_image|empty|too_large/.test(msg)) return 'bad_response';
  return 'unknown';
}

// 校验图片确实可解码（PNG/JPEG 魔数 + 体积上限）
function validateImageBuffer(buf) {
  if (!buf || buf.length < 8) return { ok: false, error: 'empty' };
  if (buf.length > IMG_MAX_BYTES) return { ok: false, error: 'too_large' };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ok: true, ext: '.png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ok: true, ext: '.jpg' };
  return { ok: false, error: 'bad_image' };
}

// 并发池：最多 limit 个任务同时执行，全部完成后返回
async function runPool(items, limit, worker) {
  const list = Array.isArray(items) ? items : [];
  const n = Math.max(1, Math.min(limit || 1, list.length || 1));
  let idx = 0;
  const runners = Array.from({ length: n }, async () => {
    while (idx < list.length) {
      const item = list[idx++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// 任务最终状态：全成功=completed，部分=partial，全失败=failed，取消=cancelled
function deriveJobStatus({ succeeded = 0, failed = 0, cancelled = false } = {}) {
  if (cancelled) return 'cancelled';
  if (succeeded === 0) return 'failed';
  if (failed > 0) return 'partial';
  return 'completed';
}

// 云端返回 → base64 抽取（只认已验证结构；URL 形态明确标记不支持）
function extractImageBase64(resp) {
  let j;
  try { j = JSON.parse(resp); } catch (e) { return { error: 'bad_json' }; }
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  for (const p of parts) {
    const d = (p.inlineData || p.inline_data || {}).data;
    if (d) return { b64: d };
  }
  for (const it of (j.data || [])) {
    if (it.b64_image) return { b64: it.b64_image };
    if (it.url) return { error: 'url_unsupported' };
  }
  return { error: 'no_image' };
}

module.exports = { IMG_MAX_BYTES, classifyGenError, validateImageBuffer, runPool, deriveJobStatus, extractImageBase64 };
