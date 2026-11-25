const test = require('node:test');
const assert = require('node:assert');
const A = require('../lib/attention');

test('first key turns one ear immediately without raising the eyes', () => {
  const a = A.createAttention();
  const r = a.onKeys(1, 1000);
  assert.strictEqual(r.level, 'ear');
  assert.strictEqual(r.started, true);
  assert.strictEqual(r.raised, false);
});

test('a lone tap fades back on its own and asks to resume', () => {
  const a = A.createAttention();
  a.onKeys(1, 0);
  assert.strictEqual(a.tick(800).level, 'ear');
  const r = a.tick(1200);
  assert.strictEqual(r.level, 'none');
  assert.strictEqual(r.resumed, true);
});

test('a burst raises the eyes; later keys keep it looking', () => {
  const a = A.createAttention();
  a.onKeys(1, 0);
  a.onKeys(1, 150);
  const r = a.onKeys(1, 300);
  assert.strictEqual(r.level, 'look');
  assert.strictEqual(r.raised, true);
  const r2 = a.onKeys(1, 2000);
  assert.strictEqual(r2.level, 'look');
  assert.strictEqual(r2.raised, false);
});

test('an aggregated count from the poller counts as a burst', () => {
  const a = A.createAttention();
  assert.strictEqual(a.onKeys(4, 0).level, 'look');
});

test('dense typing merges into rate-limited flicks', () => {
  const a = A.createAttention({ flickMs: 280 });
  let flicks = 0;
  for (let t = 0; t <= 2000; t += 40) if (a.onKeys(1, t).flick) flicks++;
  assert.ok(flicks >= 5 && flicks <= 8, `flicks=${flicks}`);
});

test('after typing stops it lingers a beat, then resumes', () => {
  const a = A.createAttention({ settleMs: 2600, lingerMs: 500 });
  [0, 100, 200, 300].forEach((t) => a.onKeys(1, t));
  assert.strictEqual(a.tick(2000).phase, 'hold');
  const l = a.tick(2950);
  assert.strictEqual(l.level, 'look');
  assert.strictEqual(l.phase, 'linger');
  const r = a.tick(3450);
  assert.strictEqual(r.level, 'none');
  assert.strictEqual(r.resumed, true);
  assert.strictEqual(a.tick(5000).resumed, false);
});

test('a key during the linger keeps it attentive', () => {
  const a = A.createAttention();
  [0, 100, 200].forEach((t) => a.onKeys(1, t));
  a.tick(2900);
  a.onKeys(1, 3000);
  assert.strictEqual(a.tick(3500).phase, 'hold');
});

test('reset drops attention (drag, menu, form switch)', () => {
  const a = A.createAttention();
  a.onKeys(5, 0);
  a.reset();
  assert.strictEqual(a.level, 'none');
  assert.strictEqual(a.tick(10).resumed, false);
  assert.strictEqual(a.onKeys(1, 20).started, true);
});

test('aggregator emits the first key at once and batches the rest', async () => {
  const out = [];
  const agg = A.createKeyAggregator(40, (n) => out.push(n));
  agg.add(1);
  assert.deepStrictEqual(out, [1]);
  agg.add(1); agg.add(2);
  assert.deepStrictEqual(out, [1]);
  await new Promise((r) => setTimeout(r, 70));
  assert.deepStrictEqual(out, [1, 3]);
  agg.dispose();
});

test('tease needs back-and-forth near the paws; passing by is ignored', () => {
  const pass = A.createTease();
  let t = 0, teased = false;
  for (let x = -200; x <= 200; x += 20) teased = pass.feed(x, 40, (t += 100)).teased || teased;
  assert.strictEqual(teased, false);

  const tease = A.createTease();
  const xs = [-40, 0, 40, 0, -40, 0, 40, 0, -40];
  t = 0; teased = false;
  for (const x of xs) teased = tease.feed(x, 40, (t += 100)).teased || teased;
  assert.strictEqual(teased, true);
});

test('tease outside the paw zone (above the head) does nothing', () => {
  const tz = A.createTease();
  const xs = [-40, 40, -40, 40, -40, 40];
  let t = 0, teased = false;
  for (const x of xs) teased = tz.feed(x, -80, (t += 100)).teased || teased;
  assert.strictEqual(teased, false);
});
