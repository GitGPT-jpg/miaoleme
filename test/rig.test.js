const test = require('node:test');
const assert = require('node:assert');
const { RIG_PARTS, rigFilePath, coreRigPresent, optionalRigPresent } = require('../lib/rig');

test('骨骼部件清单：5 个部件且文件名唯一', () => {
  assert.equal(RIG_PARTS.length, 5);
  const files = RIG_PARTS.map((p) => p.file);
  assert.equal(new Set(files).size, 5);
  assert.deepEqual(files.sort(), [
    'pet-rig-body.png', 'pet-rig-head-blink.png', 'pet-rig-head-ears.png',
    'pet-rig-head.png', 'pet-rig-tail.png'
  ].sort());
});

test('路径映射', () => {
  assert.equal(rigFilePath('/u', 'rig-body'), '/u/pet-rig-body.png');
  assert.equal(rigFilePath('/u', 'nope'), null);
});

test('核心/可选部件判定', () => {
  const hasAll = () => true;
  const hasNone = () => false;
  assert.equal(coreRigPresent('/u', hasAll), true);
  assert.equal(coreRigPresent('/u', hasNone), false);
  const opt = optionalRigPresent('/u', (f) => f.endsWith('blink.png'));
  assert.deepEqual(opt, { blink: true, ears: false });
});
