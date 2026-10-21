const test = require('node:test');
const assert = require('node:assert');
const { sniffImageType, planUploadCopies } = require('../lib/upload');

test('图片类型嗅探：png/jpg/gif/webp/未知', () => {
  assert.equal(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])), 'png');
  assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(sniffImageType(Buffer.from('GIF89a......')), 'gif');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.equal(sniffImageType(webp), 'webp');
  assert.equal(sniffImageType(Buffer.from('not-an-image-data!')), null);
  assert.equal(sniffImageType(null), null);
});

test('上传规划：最多 6 张，独立快照命名，扩展名正确', () => {
  const files = ['/a/1.PNG', '/b/2.jpg', '/c/3.HEIC', '/d/4.jpeg'];
  const plan = planUploadCopies(files, '/data', 'job1');
  assert.equal(plan.length, 4);
  assert.equal(plan[0].dest, '/data/pet-ref-0-job1.png');   // 扩展名统一小写
  assert.equal(plan[1].dest, '/data/pet-ref-1-job1.jpg');
  assert.equal(plan[2].dest, '/data/pet-ref-2-job1.heic');
  const many = planUploadCopies(Array.from({ length: 9 }, (_, i) => `f${i}.jpg`), '/data', 'j2');
  assert.equal(many.length, 6, '最多 6 张');
});
