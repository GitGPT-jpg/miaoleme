const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const B = require('../landing/cat-brain.js');

function run(s, from, to, step = 16) { let r; for (let t = from; t <= to; t += step) r = B.tick(s, t); return r; }
const nearPaw = (dx = 0) => ({ x: B.T.paw.x + dx, y: B.T.paw.y - 0.05 });

test('主页猫：开场在洗脸，单键只转耳且洗脸阶段不变', () => {
  const s = B.createBrain(0);
  assert.strictEqual(B.tick(s, 10).frame, 'wash-1');
  const r = B.key(s, 100);
  assert.strictEqual(r.frame, 'wash-1-ear');
  assert.strictEqual(r.act, 'wash');
  const later = run(s, 116, 700);
  assert.ok(!later.frame.endsWith('-ear'), '耳朵应回正');
  assert.ok(later.frame.startsWith('wash-'));
});

test('主页猫：连打抬眼，停手多看半拍后接着洗同一侧', () => {
  const s = B.createBrain(0);
  run(s, 0, 700);                       // 进入 wash-2：爪在脸颊
  assert.strictEqual(s.phase, 1);
  for (let i = 0; i < 4; i++) B.key(s, 720 + i * 120);
  assert.strictEqual(B.tick(s, 1100).frame, 'wash-look');
  const lastKey = 720 + 3 * 120;
  assert.strictEqual(run(s, 1116, lastKey + B.T.quietMs + B.T.halfBeat - 20).frame, 'wash-look', '停手后仍要多看半拍');
  const r = run(s, lastKey + B.T.quietMs + B.T.halfBeat - 4, lastKey + B.T.quietMs + B.T.halfBeat + 30);
  assert.strictEqual(r.frame, 'wash-2', '回到刚才那一侧，从爪在脸颊处接着洗');
});

test('主页猫：持续输入逐渐习惯，只动耳朵、继续洗脸', () => {
  const s = B.createBrain(0);
  let t = 0, looks = 0, ears = 0;
  for (let i = 0; i < 160; i++) { t += 110; const r = B.key(s, t); if (r.frame === 'wash-look') looks++; if (i > 140 && r.frame.endsWith('-ear')) ears++; }
  assert.ok(looks > 0, '一开始会抬眼');
  assert.ok(s.habit >= B.T.habitCalm);
  assert.ok(ears > 0, '习惯后改为只转耳');
  assert.ok(B.tick(s, t + 5).frame.startsWith('wash-'));
});

test('主页猫：光标第一次经过只目送，绕回爪边才压低', () => {
  const s = B.createBrain(0);
  B.pointer(s, { x: 0.1, y: 0.4 }, 100);
  let r = B.pointer(s, nearPaw(), 200);
  assert.ok(r.act === 'wash' && r.frame.startsWith('watch-'), '第一次只目送');
  B.pointer(s, { x: 1.2, y: 0.3 }, 400);
  r = B.pointer(s, nearPaw(-0.05), 700);
  assert.strictEqual(r.act, 'hunt');
  assert.ok(r.frame.startsWith('crouch'));
});

test('主页猫：光标突然消失，盯着最后看见的位置，再探头找', () => {
  const s = B.createBrain(0);
  B.pointer(s, nearPaw(), 100); B.pointer(s, { x: 1.3, y: 0.2 }, 200);
  B.pointer(s, nearPaw(0.2), 300);
  assert.strictEqual(s.act, 'hunt');
  const seen = { ...s.lastSeen };
  let r = B.pointer(s, null, 320);
  assert.strictEqual(r.frame, 'crouch-r', '盯着光标最后在的右侧');
  assert.deepStrictEqual(s.lastSeen, seen);
  r = run(s, 336, 320 + B.T.stareMs + 40);
  assert.strictEqual(r.frame, 'search');
  r = run(s, 320 + B.T.stareMs + 56, 320 + B.T.stareMs + B.T.searchMs + 120);
  assert.strictEqual(r.act, 'wash');
});

test('主页猫：爪边晃够了就扑，扑空悬爪、洗脸、偷瞄，逗几次失去兴趣', () => {
  const s = B.createBrain(0);
  let t = 0;
  const tease = () => {
    B.pointer(s, nearPaw(), t += 50); B.pointer(s, { x: 1.3, y: 0.2 }, t += 50);
    for (let i = 0; i < 40 && s.act !== 'play'; i++) B.pointer(s, nearPaw(i % 2 ? 0.06 : -0.06), t += 60);
    return s.act;
  };
  assert.strictEqual(tease(), 'play');
  const seen = [];
  for (let k = 0; k < 260; k++) { const f = B.tick(s, t += 16).frame; if (seen[seen.length - 1] !== f) seen.push(f); }
  assert.deepStrictEqual(seen.slice(0, 5), ['swipe', 'hover', 'wash-2', 'wash-3', 'wash-peek']);
  B.pointer(s, { x: 1.4, y: 0.1 }, t += 10); run(s, t, t += 4000);
  tease(); run(s, t, t += 4000); B.pointer(s, { x: 1.4, y: 0.1 }, t += 10);
  tease(); run(s, t, t += 4000); B.pointer(s, { x: 1.4, y: 0.1 }, t += 10);
  assert.strictEqual(s.interest, 0);
  B.pointer(s, nearPaw(), t += 50); B.pointer(s, { x: 1.3, y: 0.2 }, t += 50);
  const r = B.pointer(s, nearPaw(), t += 50);
  assert.strictEqual(r.frame, 'bored', '不想玩了');
});

test('主页猫：没人理时洗完脸，先弯前腿，揣一只爪再收另一只，安静呼吸', () => {
  const s = B.createBrain(0);
  const seen = [];
  for (let t = 0; t < 22000; t += 16) { const r = B.tick(s, t); if (seen[seen.length - 1] !== r.frame) seen.push(r.frame); }
  const i = seen.indexOf('lie-1');
  assert.ok(i > 0 && seen.lastIndexOf('wash-4', i) >= 0, '先把脸洗完');
  assert.deepStrictEqual(seen.slice(i, i + 4), ['lie-1', 'lie-2', 'lie-3', 'loaf']);
  assert.ok(seen.indexOf('sit-tag') < i, '吊牌先晃完再趴');
  assert.strictEqual(s.act, 'loaf');
  assert.ok(B.tick(s, 22016).breathe);
  assert.strictEqual(B.key(s, 22100).frame, 'loaf-ear', '趴着时敲键只动耳朵');
});

test('主页猫：摸脸颊眯眼蹭手，下半身区域不响应', () => {
  const s = B.createBrain(0);
  assert.strictEqual(B.touch(s, { x: 0.35, y: 0.4 }, 100).frame, 'rub-l');
  assert.strictEqual(B.touch(s, { x: 0.6, y: 0.4 }, 200).frame, 'rub-r');
  assert.ok(run(s, 216, 1200).frame.startsWith('wash-'));
  assert.ok(B.touch(s, { x: 0.5, y: 0.9 }, 1300).frame.startsWith('wash-'));
});

test('主页：所有帧都有素材，首屏不再整张漂浮，监听器不拦截默认行为', () => {
  const dir = path.join(__dirname, '..', 'landing');
  const js = fs.readFileSync(path.join(dir, 'cat.js'), 'utf8');
  const names = new Set(['sit', ...B.WASH, ...B.WASH.map((w) => w + '-ear')]);
  for (const list of Object.values(B.SEQ)) for (const [n] of list) names.add(n);
  for (const n of js.match(/'([a-z0-9-]+)'/g).map((x) => x.slice(1, -1))) if (fs.existsSync(path.join(dir, 'assets', 'cat-' + n + '.webp'))) names.add(n);
  for (const n of names) assert.ok(fs.existsSync(path.join(dir, 'assets', 'cat-' + n + '.webp')), n);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(!/@keyframes float/.test(html));
  assert.ok(!/preventDefault/.test(js));
  assert.ok(/touch-action: pan-y/.test(fs.readFileSync(path.join(dir, 'cat.css'), 'utf8')));
});
