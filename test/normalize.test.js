const test = require('node:test');
const assert = require('node:assert');
const { UPLOAD_MAX_EDGE, shouldNormalize, normalizeUploadFiles } = require('../lib/normalize');

test('shouldNormalize：HEIC 必转、超大图转、小图直通', () => {
  assert.equal(shouldNormalize('/a/IMG_1.HEIC', null), true);
  assert.equal(shouldNormalize('/a/1.jpg', { width: 4032, height: 3024 }), true);
  assert.equal(shouldNormalize('/a/1.jpg', { width: 1280, height: 900 }), false);
  assert.equal(shouldNormalize('/a/1.jpg', null), false, '探不到尺寸又不是 HEIC → 原样');
});

test('normalizeUploadFiles：decode 成功换路径，失败原样并标错', async () => {
  const decoded = await normalizeUploadFiles(['/a/x.HEIC', '/a/small.jpg'], {
    probe: async () => null,
    decode: async (src) => (src.endsWith('.HEIC') ? { path: '/tmp/x.jpg' } : null)
  });
  assert.deepEqual(decoded, [
    { src: '/tmp/x.jpg', converted: true },
    { src: '/a/small.jpg', converted: false }
  ]);

  const failed = await normalizeUploadFiles(['/a/y.heic'], {
    probe: async () => null,
    decode: async () => { throw new Error('nope'); }
  });
  assert.equal(failed[0].src, '/a/y.heic');
  assert.equal(failed[0].error, 'decode_failed');
});
