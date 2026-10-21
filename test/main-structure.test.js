// 结构性回归：防止 IPC 注册代码被误插进普通函数（曾导致 petSay 每次调用重复注册而崩溃）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf-8');

function extractFunctionBody(name) {
  const start = SRC.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const brace = SRC.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') {
      depth--;
      if (depth === 0) return SRC.slice(brace, i + 1);
    }
  }
  throw new Error('unbalanced braces in ' + name);
}

test('petSay / notify 内不得包含 IPC 注册调用', () => {
  for (const name of ['petSay', 'notify']) {
    const body = extractFunctionBody(name);
    assert.equal(/handle\s*\(|(^|[^.\w])on\s*\(\s*['"]/.test(body), false, `${name} 内不应出现 handle()/on() 注册`);
  }
});

test('每个 IPC channel 只注册一次', () => {
  const channels = [...SRC.matchAll(/^(?:handle|on)\(\s*'([^']+)'/gm)].map((m) => m[1]);
  const seen = new Map();
  for (const ch of channels) seen.set(ch, (seen.get(ch) || 0) + 1);
  const dup = [...seen.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(dup, [], '发现重复注册的 channel');
  assert.ok(channels.length >= 20, '应注册了全部 IPC 通道');
});

test('关键通道存在', () => {
  for (const ch of ['record-rps', 'set-meal-menu', 'feed-water', 'feed-food', 'get-state', 'upload-custom-image']) {
    assert.match(SRC, new RegExp(`^(?:handle|on)\\('${ch}'`, 'm'), `缺少通道 ${ch}`);
  }
});

test('退出路径保留番茄快照（不得调用 stopPomodoro 清空）', () => {
  const idx = SRC.indexOf("app.on('will-quit'");
  assert.ok(idx > 0);
  const block = SRC.slice(idx, idx + 500);
  assert.equal(/stopPomodoro\s*\(/.test(block), false, 'will-quit 内不应调用 stopPomodoro');
  assert.match(block, /clearInterval\(pomo\.timer\)/);
});

test('回归：上传入口不得引用未定义的 refs/常量', () => {
  assert.equal(/RIG_PARTS_BODY|RIG_PARTS_HEAD|RIG_PARTS_TAIL/.test(SRC), false, '内置骨骼常量引用已修复');
  const idx = SRC.indexOf("handle('upload-custom-image'");
  assert.ok(idx > 0);
  const block = SRC.slice(idx, idx + 2200);
  assert.match(block, /planUploadCopies\(files/, '上传入口使用 planUploadCopies');
  assert.match(block, /const refs = plan\.map/, 'refs 有定义后再使用');
});

test('回归：骨骼渲染路径必须真正调用头部网格 warp（曾为死代码）', () => {
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf-8');
  const start = pet.indexOf('function drawRig(');
  assert.ok(start >= 0, 'drawRig not found');
  const brace = pet.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < pet.length; i++) {
    if (pet[i] === '{') depth++;
    else if (pet[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = pet.slice(brace, i + 1);
        // 头部绘制处必须调用 drawHeadWarped + bandOffsets，而不是裸 drawImage(pickHead)
        assert.match(body, /drawHeadWarped\(pickHead\(t\)/, 'drawRig 内必须调用 drawHeadWarped(pickHead(t))');
        assert.match(body, /WarpMath\.bandOffsets\(gaze\.x, gaze\.y\)/, '头部 warp 必须使用 bandOffsets');
        assert.equal(/drawImage\(pickHead\(t\)/.test(body), false, '头部不得再走裸 drawImage');
        return;
      }
    }
  }
  throw new Error('unbalanced braces in drawRig');
});

test('回归：眨眼/压耳部件必须真正加载进 rig（曾只加载身/头/尾）', () => {
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf-8');
  const start = pet.indexOf('function loadRig(');
  assert.ok(start >= 0, 'loadRig not found');
  const brace = pet.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < pet.length; i++) {
    if (pet[i] === '{') depth++;
    else if (pet[i] === '}') {
      depth--;
      if (depth === 0) {
        const body = pet.slice(brace, i + 1);
        assert.match(body, /load\(res\.parts\.blink\)/, 'loadRig 必须加载 parts.blink');
        assert.match(body, /load\(res\.parts\.ears\)/, 'loadRig 必须加载 parts.ears');
        assert.match(body, /blink: blink \|\| null, ears: ears \|\| null/, 'rig 对象必须写入 blink/ears');
        return;
      }
    }
  }
  throw new Error('unbalanced braces in loadRig');
});

test('回归：上传必须支持 HEIC（解码转 JPEG 后落盘）与大图缩放', () => {
  const idx = SRC.indexOf("async function processUploadFiles");
  assert.ok(idx > 0, 'processUploadFiles 应为 async（内部等待解码）');
  const block = SRC.slice(idx, idx + 2600);
  assert.match(block, /convertViaThumbnail\(c\.src\)/, 'HEIC 走系统缩略图解码');
  assert.match(block, /c\.dest = c\.dest\.replace\(\/\\\.heic\?\$\/i, '\.jpg'\)/, 'HEIC 快照改存 .jpg');
  assert.match(block, /resizeViaThumbnail\(c\.src, 1536\)/, '大图缩到 1536 长边');
  assert.match(block, /heic_unsupported/, '解码失败返回可读错误');
  assert.match(SRC, /createThumbnailFromPath/, '使用系统缩略图通道（原生 EXIF 方向）');
  assert.match(SRC, /extensions: \['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'\]/, '文件选择框允许 HEIC');
});

test('回归：HEIC 缩略图解码必须用安全宽度（≥1536 会返回空白占位图）', () => {
  const idx = SRC.indexOf('THUMB_SAFE_WIDTH');
  assert.ok(idx > 0, '应定义 THUMB_SAFE_WIDTH');
  assert.match(SRC, /const THUMB_SAFE_WIDTH = 800;/, '安全宽度用 800');
  const fn = SRC.indexOf('async function resizeViaThumbnail');
  const block = SRC.slice(fn, fn + 900);
  assert.match(block, /width: THUMB_SAFE_WIDTH/, '解码请求使用安全宽度');
  assert.equal(/width: maxEdge/.test(block), false, '不得直接用目标宽度请求缩略图');
});

test('回归：占位图检测（返回 1024 方形且与请求不符视为解码失败）', () => {
  const fn = SRC.indexOf('async function resizeViaThumbnail');
  const block = SRC.slice(fn, fn + 1100);
  assert.match(block, /size\.width === 1024 && size\.height === 1024/, '检测 1024×1024 占位图');
  assert.match(block, /return null;/, '占位图按失败处理');
});
