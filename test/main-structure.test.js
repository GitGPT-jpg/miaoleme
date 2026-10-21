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
