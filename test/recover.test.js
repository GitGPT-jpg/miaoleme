const test = require('node:test');
const assert = require('node:assert');
const { pickOrphanFrames, planRecovery, shouldRestoreRunSeq, frameTs } = require('../lib/recover');
const { needsKeying, keyOutBackground } = require('../lib/frameNorm');

const runFiles = (ts) => Array.from({ length: 8 }, (_, i) => `pet-gen-run-${i + 1}-${ts + i}.png`);

test('孤儿帧：每个槽位取最新的一张，早于当前站立帧的旧猫不要', () => {
  const files = runFiles(2000).concat(runFiles(3000), [
    'pet-gen-groom-1500.png', 'pet-gen-groom-2500.png', 'pet-gen-stretch-900.png', 'other.txt'
  ]);
  const p = pickOrphanFrames(files, 1000);
  assert.deepStrictEqual(p.run, runFiles(3000));
  assert.strictEqual(p.actions.groom, 'pet-gen-groom-2500.png');
  assert.strictEqual(p.actions.stretch, undefined, '换图前的旧猫帧不能拼进新猫');
  assert.strictEqual(frameTs('pet-gen-idle-1792639570951.png'), 1792639570951);
});

test('找回：run 序列缺帧才整组填入，半组不填，已有引用不覆盖', () => {
  const picked = { run: runFiles(10), actions: { groom: 'g2', stretch: 's1' } };
  const r = planRecovery({ customGenRunSeq: [], customGenActions: { groom: 'g1' } }, picked);
  assert.deepStrictEqual(r.state.customGenRunSeq, runFiles(10));
  assert.strictEqual(r.state.customGenActions.groom, 'g1');
  assert.strictEqual(r.state.customGenActions.stretch, 's1');
  assert.deepStrictEqual(r.changed.sort(), ['run', 'stretch']);

  const half = { run: runFiles(10).map((f, i) => (i < 5 ? f : null)), actions: {} };
  assert.deepStrictEqual(planRecovery({ customGenRunSeq: [] }, half).changed, []);

  const full = planRecovery({ customGenRunSeq: runFiles(50) }, picked, () => true);
  assert.ok(!full.changed.includes('run'), '完整的现有序列不被替换');
});

test('重做跑步没凑齐 8 帧时还原旧序列', () => {
  const prev = runFiles(1);
  assert.ok(shouldRestoreRunSeq([], prev));
  assert.ok(shouldRestoreRunSeq(runFiles(9).slice(0, 3), prev));
  assert.ok(!shouldRestoreRunSeq(runFiles(9), prev), '新的一组齐了就用新的');
  assert.ok(!shouldRestoreRunSeq([], prev, (f) => f !== prev[0]), '旧的一组也残缺时不还原');
});

function bitmap(w, h, fill) {
  const b = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) { const c = fill(p % w, Math.floor(p / w)); b.set(c, p * 4); }
  return b;
}

test('浅色底帧：边缘连通的背景抠透明，猫身里的白毛保留', () => {
  const w = 20, h = 20;
  // 浅灰底，中间一块深色猫身，猫身中心有一点白毛
  const b = bitmap(w, h, (x, y) => {
    if (x >= 5 && x < 15 && y >= 5 && y < 15) return (x === 10 && y === 10) ? [250, 250, 250, 255] : [120, 80, 40, 255];
    return [235, 235, 232, 255];
  });
  assert.ok(needsKeying(b, w, h));
  const n = keyOutBackground(b, w, h);
  assert.strictEqual(n, w * h - 100);
  assert.strictEqual(b[(10 * w + 10) * 4 + 3], 255, '不连通边缘的白毛不能被挖掉');
  assert.strictEqual(b[3], 0);
  assert.ok(!needsKeying(b, w, h), '已透明的帧不再处理');
  const colored = bitmap(w, h, () => [40, 160, 220, 255]);
  assert.ok(!needsKeying(colored, w, h), '彩色底不是生成服务的浅色底，不动');
});
