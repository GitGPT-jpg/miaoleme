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

test('奔跑序列：8 帧任务进入 GEN_REST，并带站立帧参考', () => {
  assert.equal(require('../lib/run').RUN_FRAMES, 8);
  assert.match(SRC, /const GEN_RUN_POSES = \[/, '应有 8 个姿势提示词');
  const poses = SRC.slice(SRC.indexOf('const GEN_RUN_POSES = ['), SRC.indexOf('const RUN_KEYS'));
  for (const tag of ['CONTACT-A', 'DOWN-A', 'PASSING-A', 'FLIGHT-A', 'CONTACT-B', 'DOWN-B', 'PASSING-B', 'FLIGHT-B']) {
    assert.ok(poses.includes(tag), `缺少姿势 ${tag}`);
  }
  assert.match(SRC, /STRICT SIDE VIEW facing RIGHT/, '公共前缀必须锁死侧视朝右');
  assert.match(SRC, /body axis is perfectly HORIZONTAL/, '身体必须水平');
  assert.match(SRC, /FULLY TRANSPARENT background/, '透明底');
  assert.match(SRC, /\.concat\(GEN_RUN_TASKS\)/, 'GEN_REST 必须包含奔跑任务');
  assert.match(SRC, /useIdleRef: true/, '奔跑帧需带站立帧做身份参考');
});

test('奔跑帧写入序列槽位，不得混进动作帧', () => {
  const body = extractFunctionBody('applyFrameToState');
  assert.match(body, /runIndexOfKey\(key\) >= 0/, '必须识别 run-N 键');
  assert.match(body, /state\.customGenRunSeq = seq/, '写入 customGenRunSeq');
  const runBranch = body.indexOf('runIndexOfKey(key) >= 0');
  const actionBranch = body.indexOf('customGenActions = Object.assign');
  assert.ok(runBranch < actionBranch, '奔跑分支必须在 actions 兜底分支之前');
});

test('生成帧必须下发 runSeq，且奔跑帧不走逐帧高度归一化', () => {
  const frames = extractFunctionBody('customFrames');
  assert.match(frames, /runSeq: customRunSeq\(\)/, '用户生成帧返回 runSeq');
  const run = extractFunctionBody('customRunSeq');
  assert.match(run, /frames\.length >= 4/, '少于 4 帧凑不出步态，视为无序列');
  assert.match(run, /frameMs: RUN_FRAME_MS/);
  const gen = extractFunctionBody('genAvatarFrame');
  assert.match(gen, /if \(!isRun\) normalizePoseFrame\(outPath\)/, '奔跑帧不得逐帧按高度归一化');
  assert.match(gen, /\(poseName === 'idle' \|\| isRun\) \? null : poseRefBox/, '奔跑帧不套站立帧比例门');
  assert.match(SRC, /normalizeRunSequence\(\) > 0/, '任务结束后整组归一化并刷新');
});

test('清理不得删掉刚生成的奔跑帧', () => {
  const body = extractFunctionBody('cleanupOldGenFiles');
  assert.match(body, /\.concat\(state\.customGenRunSeq \|\| \[\]\)/, 'keep 集合必须含奔跑序列');
});

test('奔跑序列按整组重做：缺一帧就全部重生成', () => {
  const start = extractFunctionBody('startGenJob');
  assert.match(start, /const runSeqComplete = RUN_KEYS\.every/, '整组完整性判定');
  assert.match(start, /if \(runIndexOfKey\(k\) >= 0\) return runSeqComplete/, '缺帧时所有奔跑帧都算缺');
  assert.match(start, /state\.customGenRunSeq = \[\]/, '重做前清空旧槽位，避免新旧比例混播');
  const retry = extractFunctionBody('retryMissingFrames');
  assert.match(retry, /RUN_KEYS\.some\(\(k\) => only\.includes\(k\)\)/, '重试时奔跑序列整组入列');
  assert.match(retry, /const fixed = normalizeRunSequence\(\)/, '无缺帧时也重做归一化与播放顺序（不调生成服务）');
});

test('播放顺序由实测体长决定，不信提示词标号', () => {
  const body = extractFunctionBody('normalizeRunSequence');
  assert.match(body, /orderRunCycle\(plan\.items\.map\(\(it\) => it\.w\)\)/, '按归一化后的帧宽排序');
  assert.match(body, /state\.customGenRunSeq = order\.map/, '把播放顺序写回槽位');
  assert.match(SRC, /orderRunCycle/, 'main.js 必须引入 orderRunCycle');
});

test('渲染层：奔跑用硬切轮播 + dt 位移，不得 crossfade', () => {
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf-8');
  const start = pet.indexOf('function setRunFrame(');
  assert.ok(start >= 0, 'setRunFrame not found');
  const block = pet.slice(start, pet.indexOf('function runTargetX('));
  assert.match(block, /RunMath\.pickRunFrames\(F\.runSeq/, '真帧优先选帧');
  assert.match(block, /hardCutTo\(/, '必须硬切');
  assert.equal(/crossfadeTo\(/.test(block), false, '奔跑帧间隔太短，不得交叉淡化');
  assert.match(block, /classList\.toggle\('run-seq', real\)/, '真帧时标记 run-seq 以关闭 CSS 缩放步态');
  const step = pet.slice(pet.indexOf('function stepRun('), pet.indexOf('function stopRun('));
  assert.match(step, /RunMath\.runStep\(dt\)/, '位移必须按 dt 推进（90 px/s）');
});

test('喂水有画面：自定义形象也生成喝水帧', () => {
  assert.match(SRC, /key: 'drink', prompt: GEN_ACTION_PROMPTS\.drink, label: '喝水'/, 'GEN_REST 必须包含喝水帧');
  assert.match(SRC, /drink: 'Turn the subject in this photo[^']*water bowl/, '喝水提示词存在');
  // 喂水会给桌宠发 action:'drink'，没有这一帧时 playAction 直接 return（只有气泡没动作）
  assert.match(SRC, /send\('pet-say', \{ action: 'drink'/);
});

test('渲染层：位移一律按 dt 推进，骨骼模式奔跑也要迈步', () => {
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf-8');
  const step = pet.slice(pet.indexOf('const WALK_SPEED'), pet.indexOf('function stopWander('));
  assert.match(step, /RunMath\.runStep\(dt, WALK_SPEED\)/, '走路必须按 dt 推进（每帧固定像素会随刷新率变速）');
  assert.equal(/const speed = 1\.6/.test(pet), false, '不得保留每帧固定像素的走路速度');
  const rig = pet.slice(pet.indexOf('const running = mode'), pet.indexOf('// 尾巴'));
  assert.match(rig, /const walking = mode === 'walk' \|\| running/, '骨骼模式下奔跑也走迈步分支');
  assert.match(rig, /const gait = running \? 1\.8 : 1/, '奔跑步频更快');
});

test('渲染层：冲刺目标夹在可见工作区内，隐藏时收尾', () => {
  const pet = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.js'), 'utf-8');
  const target = pet.slice(pet.indexOf('function runTargetX('), pet.indexOf('function startRunDash('));
  assert.match(target, /Math\.max\(left, Math\.min\(right, target\)\)/, '落点必须夹进可见区，否则贴边原地踏步');
  assert.match(target, /sc\.availLeft/, '多屏要用 availLeft 定位当前屏幕');
  const vis = pet.slice(pet.indexOf("document.addEventListener('visibilitychange'"), pet.indexOf("pet.addEventListener('mouseenter'"));
  assert.match(vis, /if \(mode === 'run'\) stopRun\(\)/, '窗口隐藏时结束奔跑，避免再露面时定格在跑步帧');
});

test('渲染层：真帧序列下 CSS 不叠加缩放步态', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'pet.css'), 'utf-8');
  assert.match(css, /#pet\.form-custom\.running \.pet-photo-img \{[^}]*animation: none/, '奔跑时关闭浮动/摇摆动画');
  assert.match(css, /running\.run-seq \.pet-photo-img \{[^}]*width: 200px/, '真帧用加宽的展示框装横向画布');
  assert.match(css, /running:not\(\.run-seq\) \.pet-photo-img \{\s*animation: runGallop/, 'runGallop 只用于无真帧的兜底');
  assert.match(css, /#pet\.form-custom\.running \.pet-shadow \{[^}]*shadowRun/, '保留影子节奏');
  assert.match(css, /#pet\.form-custom\.running\.face-left \.pet-photo-img \{ transform: scaleX\(-1\); \}/, '向左跑用 scaleX(-1)');
});
