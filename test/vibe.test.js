const test = require('node:test');
const assert = require('node:assert');
const { createMeter, milestone, pickParticle, TOKENS } = require('../lib/vibe');

test('连续敲键累加连击，停顿超过间隔后连击归零并重新计数', () => {
  const m = createMeter({ comboGapMs: 1000 });
  for (let i = 0; i < 5; i++) m.hit(i * 200, 'key');
  assert.equal(m.combo(800), 5);
  assert.equal(m.combo(1900), 0, '停顿后显示归零');
  assert.equal(m.hit(3000, 'key'), 1, '停顿后重新从 1 开始');
});

test('鼠标移动只加热度，不计入连击和 KPM', () => {
  const m = createMeter();
  for (let i = 0; i < 10; i++) m.hit(i * 100, 'mouse');
  assert.equal(m.combo(1000), 0);
  assert.equal(m.kpm(1000), 0);
  assert.ok(m.intensity(1000) > 0);
  assert.ok(m.intensity(1000) < 0.2, '晃鼠标不应接近满热度');
});

test('KPM 按滑动窗口计算，首键不爆表，旧键滑出窗口', () => {
  const m = createMeter({ windowMs: 10000 });
  m.hit(0, 'key');
  assert.equal(m.kpm(0), 30, '首键按至少 2 秒折算');
  // 10 秒内均匀敲 50 下 → 约 300 KPM
  for (let i = 1; i < 50; i++) m.hit(i * 200, 'key');
  const v = m.kpm(10000);
  assert.ok(v >= 290 && v <= 310, `kpm=${v}`);
  assert.equal(m.level(10000), 'fire');
  assert.equal(m.kpm(30000), 0, '窗口外的键全部滑出');
  assert.equal(m.level(30000), 'calm');
});

test('热度随时间衰减且钳制在 0..1', () => {
  const m = createMeter({ decayMs: 1000 });
  for (let i = 0; i < 100; i++) m.hit(i * 10, 'key');
  assert.ok(m.intensity(990) > 0.99, "高频敲击接近满热度");
  assert.ok(m.intensity(4000) < 0.1);
  m.hit(NaN, 'key');
  assert.ok(m.intensity(4000) < 0.1, '非法时间戳被忽略');
});

test('里程碑只在跨越时触发，跨多个取最大', () => {
  assert.equal(milestone(9, 10), 10);
  assert.equal(milestone(10, 11), 0);
  assert.equal(milestone(5, 65), 60);
  assert.equal(milestone(0, 0), 0);
});

test('粒子文本总来自词表，异常随机数不越界', () => {
  assert.equal(pickParticle(() => 0), TOKENS[0]);
  assert.equal(pickParticle(() => 0.9999), TOKENS[TOKENS.length - 1]);
  assert.ok(TOKENS.includes(pickParticle(() => NaN)));
  assert.ok(TOKENS.includes(pickParticle(() => 1)));
});
