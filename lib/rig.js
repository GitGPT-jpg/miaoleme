// 骨骼部件计划（纯函数，可单测）
// 每个上传形象生成 5 个部件：身体/头/尾/闭眼头/压耳头
const RIG_PARTS = [
  { key: 'rig-body', file: 'pet-rig-body.png', label: '骨骼-身体' },
  { key: 'rig-head', file: 'pet-rig-head.png', label: '骨骼-头' },
  { key: 'rig-tail', file: 'pet-rig-tail.png', label: '骨骼-尾巴' },
  { key: 'rig-head-blink', file: 'pet-rig-head-blink.png', label: '骨骼-闭眼' },
  { key: 'rig-head-ears', file: 'pet-rig-head-ears.png', label: '骨骼-压耳' }
];

function rigFilePath(dir, key) {
  const meta = RIG_PARTS.find((p) => p.key === key);
  return meta ? `${dir}/${meta.file}` : null;
}

// 必需部件（身体/头/尾）齐全才能启用骨骼；闭眼/压耳可选
function coreRigPresent(dir, exists) {
  return ['pet-rig-body.png', 'pet-rig-head.png', 'pet-rig-tail.png']
    .every((f) => exists(`${dir}/${f}`));
}

function optionalRigPresent(dir, exists) {
  return {
    blink: exists(`${dir}/pet-rig-head-blink.png`),
    ears: exists(`${dir}/pet-rig-head-ears.png`)
  };
}

module.exports = { RIG_PARTS, rigFilePath, coreRigPresent, optionalRigPresent };
