const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const genChildren = new Set();

// 单实例：避免双开导致两只桌宠、重复提醒与并发写状态
if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}
app.on('second-instance', () => { try { openPanel(); } catch (e) { /* not ready yet */ } });

// ---------- 数据持久化 ----------
// 改名迁移（零度突破 → 喵了么）：把旧应用数据目录的内容搬到新目录，保留用户的桌宠/设置
(function migrateLegacyUserData() {
  const current = app.getPath('userData');
  const legacyNames = ['zerobreak-desktop-pet', '零度突破'];
  for (const legacy of legacyNames) {
    const legacyDir = path.join(path.dirname(current), legacy);
    if (legacyDir === current || !fs.existsSync(legacyDir)) continue;
    if (fs.existsSync(path.join(current, 'zerobreak-store.json'))) continue; // 新目录已有数据，不覆盖
    try {
      fs.cpSync(legacyDir, current, { recursive: true });
      console.log('[migrate] copied legacy userData from', legacy);
    } catch (e) {
      console.error('[migrate] failed', e && e.message);
    }
  }
})();

const STORE_FILE = path.join(app.getPath('userData'), 'zerobreak-store.json');

const { normalizeState, readState } = require('./lib/store');
const { mealSlotAt, mealEligible, inDndWindow, meetingNotice, ddlNotice, clearMarks, dateKey } = require('./lib/schedule');
const { classifyGenError, validateImageBuffer, deriveJobStatus, extractImageBase64 } = require('./lib/gen');
const { createGenJob } = require('./lib/genjob');
const { clampToArea, isInsideAnyDisplay } = require('./lib/geometry');
const { restorePomodoro, pomoSnapshot } = require('./lib/pomodoro');

function loadState() {
  const res = readState(STORE_FILE);
  if (res.corruptionBackup) {
    console.error('[store] 状态文件损坏，已备份到', res.corruptionBackup);
  }
  return res.state;
}

function saveState() {
  try {
    // 原子写入：先写临时文件再重命名，避免写一半导致存储损坏
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, STORE_FILE);
  } catch (e) {
    console.error('保存失败', e);
  }
}

let state = loadState();

// ---------- 自定义图片 ----------
const BUNDLED_IDLE = path.join(__dirname, 'assets', 'cat-3d-idle.png');
const BUNDLED_WALK = path.join(__dirname, 'assets', 'cat-3d-walk.png');
const BUNDLED_SIT = path.join(__dirname, 'assets', 'cat-3d-sit.png');
const BUNDLED_WALK2 = path.join(__dirname, 'assets', 'cat-3d-walk2.png');
const BUNDLED_HAPPY = path.join(__dirname, 'assets', 'cat-3d-happy.png');
const BUNDLED_ACTIONS = {
  roll:  path.join(__dirname, 'assets', 'cat-3d-roll.png'),
  groom: path.join(__dirname, 'assets', 'cat-3d-groom.png'),
  eat:   path.join(__dirname, 'assets', 'cat-3d-eat.png'),
  sleep: path.join(__dirname, 'assets', 'cat-3d-sleep.png'),
  sleep2:path.join(__dirname, 'assets', 'cat-3d-sleep2.png'),
  drink: path.join(__dirname, 'assets', 'cat-3d-drink.png')
};

const dataUrlCache = new Map(); // key: path|mtime|size -> dataURL
function fileToDataUrl(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const st = fs.statSync(p);
    const key = `${p}|${st.mtimeMs}|${st.size}`;
    if (dataUrlCache.has(key)) return dataUrlCache.get(key);
    if (dataUrlCache.size > 40) dataUrlCache.clear();
    const ext = path.extname(p).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';
    const url = `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
    dataUrlCache.set(key, url);
    return url;
  } catch (e) {
    return null;
  }
}

// customImagePath 供面板预览用：优先生成帧，其次原图，再退内置
function customImagePath() {
  if (state.customGenIdle && fs.existsSync(state.customGenIdle)) return state.customGenIdle;
  if (state.customImage && fs.existsSync(state.customImage)) return state.customImage;
  if (fs.existsSync(BUNDLED_IDLE)) return BUNDLED_IDLE;
  return null;
}

function customImageDataUrl() {
  return fileToDataUrl(customImagePath());
}

// 返回帧集合：{ idle, idleAlt, walk, walkAlt, happy, actions:{..., sleepAlt} }
// 内置 3D 猫返回多帧组（呼吸/迈步/睡姿成对，供丝滑循环）；用户自定义图返回单帧（成对帧退化为同一张）
function customFrames() {
  if (state.customGenIdle && fs.existsSync(state.customGenIdle)) {
    const idle = fileToDataUrl(state.customGenIdle);
    const walk = (state.customGenWalk && fs.existsSync(state.customGenWalk)) ? fileToDataUrl(state.customGenWalk) : idle;
    const actions = {};
    if (state.customGenActions) {
      Object.keys(state.customGenActions).forEach((k) => {
        const p = state.customGenActions[k];
        if (p && fs.existsSync(p)) { const u = fileToDataUrl(p); if (u) actions[k] = u; }
      });
    }
    return { idle, idleAlt: idle, walk, walkAlt: walk, happy: idle, actions };
  }
  if (state.customImage && fs.existsSync(state.customImage)) {
    const u = fileToDataUrl(state.customImage);
    return { idle: u, idleAlt: u, walk: u, walkAlt: u, happy: u, actions: {} };
  }
  const actions = {};
  Object.keys(BUNDLED_ACTIONS).forEach((k) => {
    const u = fileToDataUrl(BUNDLED_ACTIONS[k]);
    if (u) actions[k] = u;
  });
  const idle = fileToDataUrl(BUNDLED_IDLE);
  const walk = fileToDataUrl(BUNDLED_WALK) || idle;
  return {
    idle,
    idleAlt: fileToDataUrl(BUNDLED_SIT) || idle,
    walk,
    walkAlt: fileToDataUrl(BUNDLED_WALK2) || walk,
    happy: fileToDataUrl(BUNDLED_HAPPY) || idle,
    actions
  };
}

// ---------- 后台生成 3D 形象 ----------
const GEN_IDLE_PROMPT = 'Turn the person/pet/subject in this photo into an adorable chibi 3D mascot character, Pixar/Blender toy-figure style, big round head, large glossy expressive eyes, soft shading, keep the subject\'s key colors and recognizable features. Full body standing in a cute 3/4 front pose, soft studio lighting with subtle rim light, glossy clean render. Isolated on a FULLY TRANSPARENT background, PNG, subject centered, no ground, no baked shadow, high detail.';
const GEN_WALK_PROMPT = 'Turn the person/pet/subject in this photo into an adorable chibi 3D mascot character, Pixar/Blender toy-figure style, big round head, large glossy eyes, keep the subject\'s key colors and recognizable features. Full body in a cute MID-WALK stride pose seen from a side 3/4 angle, one foot/paw lifted forward, playful happy expression, soft studio lighting, glossy clean render. Isolated on a FULLY TRANSPARENT background, PNG, subject centered, no ground, no baked shadow, high detail.';

// 动作帧提示词（通用主体，保持同一画风与透明底）
const GEN_ACTION_PROMPTS = {
  roll:  'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: rolling on its back playfully, belly up, limbs up in the air, happy relaxed expression. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  groom: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: sitting and grooming itself, cute focused expression. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  eat:   'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: head lowered eating from a small round food bowl placed in front, happy eating expression. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.',
  sleep: 'Turn the subject in this photo into an adorable chibi 3D mascot, Pixar/Blender style, keep key colors and features. Pose: lying down curled up sleeping, eyes closed peacefully, small white Zzz symbols floating above head. Isolated on a FULLY TRANSPARENT background, PNG, centered, no ground, no baked shadow.'
};

function loadGenConfig() {
  // 优先读取用户数据目录（打包版可用），其次项目目录（开发版）
  const candidates = [
    path.join(app.getPath('userData'), 'generation.config.json'),
    path.join(__dirname, 'generation.config.json')
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (cfg && (cfg.comate || cfg.qianfan || cfg.skillScript)) return cfg;
    } catch (e) { /* try next */ }
  }
  return null;
}

function genAvailable() {
  const cfg = loadGenConfig();
  if (!cfg) return false;
  if (cfg.provider === 'comate') return !!(cfg.comate && cfg.comate.apiUrl);
  if (cfg.provider === 'qianfan') return !!(cfg.qianfan && cfg.qianfan.apiUrl && cfg.qianfan.apiKey);
  // 旧版兼容：skill 脚本
  return !!(cfg.skillScript && fs.existsSync(cfg.skillScript));
}

// 通用 HTTPS JSON POST
function httpsJson(url, headers, payload) {
  return new Promise((resolve, reject) => {
    const { request } = require('https');
    const body = JSON.stringify(payload);
    const req = request(url, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
    }, (res) => {
      let data = '';
      res.on('data', (d) => { data += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error('HTTP ' + res.statusCode + ' ' + data.slice(0, 200)));
      });
    });
    req.on('error', reject);
    req.setTimeout(180000, () => req.destroy(new Error('timeout')));
    req.write(body);
    req.end();
  });
}

function mimeOf(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// 调用图像生成服务，把 srcPath 按给定提示词转成一帧。
// 返回 { ok:true, path } 或 { ok:false, error }；瞬时错误最多额外重试 2 次（退避）。
async function genAvatarFrame(srcPath, poseName, prompt) {
  const cfg = loadGenConfig();
  if (!cfg) return { ok: false, error: 'unavailable' };

  const attemptOnce = async () => {
    let resp;
    if (cfg.provider === 'comate' && cfg.comate && cfg.comate.apiUrl) {
      const b64 = fs.readFileSync(srcPath).toString('base64');
      resp = await httpsJson(cfg.comate.apiUrl, { 'login-name': cfg.comate.loginName || '' }, {
        contents: [{ role: 'USER', parts: [
          { inline_data: { mime_type: mimeOf(srcPath), data: b64 } },
          { text: prompt }
        ] }],
        resolution: '2K',
        aspectRatio: '1:1'
      });
    } else if (cfg.provider === 'qianfan' && cfg.qianfan && cfg.qianfan.apiUrl && cfg.qianfan.apiKey) {
      const b64 = fs.readFileSync(srcPath).toString('base64');
      const dataUri = `data:${mimeOf(srcPath)};base64,${b64}`;
      resp = await httpsJson(cfg.qianfan.apiUrl, { 'Authorization': 'Bearer ' + cfg.qianfan.apiKey }, {
        model: cfg.qianfan.model || 'ernie-image-turbo',
        prompt: `${dataUri}\n${prompt}`,
        n: 1,
        size: cfg.qianfan.size || '1024x1024'
      });
    } else if (cfg.skillScript && fs.existsSync(cfg.skillScript)) {
      return genViaScript(cfg, srcPath, poseName, prompt);
    } else {
      return { ok: false, error: 'unavailable' };
    }
    const parsed = extractImageBase64(resp);
    if (parsed.error) return { ok: false, error: parsed.error };
    const buf = Buffer.from(parsed.b64, 'base64');
    const valid = validateImageBuffer(buf);
    if (!valid.ok) return { ok: false, error: valid.error };
    const outPath = path.join(app.getPath('userData'), `pet-gen-${poseName}-${Date.now()}${valid.ext}`);
    fs.writeFileSync(outPath, buf);
    return { ok: true, path: outPath };
  };

  let lastError = 'unknown';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await attemptOnce();
    } catch (e) {
      lastError = classifyGenError(e);
      if (!/transient|unknown/.test(lastError) || attempt === 2) {
        return { ok: false, error: lastError };
      }
      await sleepMs(attempt === 0 ? 1000 : 3000);
    }
  }
  return { ok: false, error: lastError };
}

// 旧版 skill 脚本通道：整体超时 + 有界输出缓存
function genViaScript(cfg, srcPath, poseName, prompt) {
  return new Promise((resolve) => {
    if (!cfg.skillScript || !/\.sh$/.test(cfg.skillScript)) return resolve({ ok: false, error: 'bad_request' });
    const out = `pet-gen-${poseName}-${Date.now()}.png`;
    const env = Object.assign({}, process.env, {
      COMATE_USERNAME_ENCRYPTED: cfg.comateUsernameEncrypted || process.env.COMATE_USERNAME_ENCRYPTED || ''
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (res) => { if (!settled) { settled = true; clearTimeout(timer); resolve(res); } };
    const child = spawn('bash', [cfg.skillScript, '--prompt', prompt, '--input', srcPath, '--output', out, '--aspect-ratio', '1:1', '--resolution', '2K'],
      { cwd: app.getPath('userData'), env });
    genChildren.add(child);
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (e) { /* already gone */ }
      finish({ ok: false, error: 'timeout' });
    }, 5 * 60 * 1000);
    child.stdout.on('data', (d) => { if (stdout.length < 100 * 1024) stdout += d.toString(); });
    child.stderr.on('data', (d) => { if (stderr.length < 100 * 1024) stderr += d.toString(); });
    child.on('close', (code) => {
      genChildren.delete(child);
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (code === 0 && line && fs.existsSync(line)) finish({ ok: true, path: line });
      else finish({ ok: false, error: code === 0 ? 'bad_response' : 'transient' });
    });
    child.on('error', () => finish({ ok: false, error: 'transient' }));
  });
}

// ---------- 生成任务：隔离、并发、重试、取消、可查询 ----------
let genJob = null;
let genSeq = 0;

const GEN_REST = [
  { key: 'walk',  prompt: GEN_WALK_PROMPT,          label: '行走' },
  { key: 'roll',  prompt: GEN_ACTION_PROMPTS.roll,  label: '打滚' },
  { key: 'groom', prompt: GEN_ACTION_PROMPTS.groom, label: '舔毛' },
  { key: 'eat',   prompt: GEN_ACTION_PROMPTS.eat,   label: '吃饭' },
  { key: 'sleep', prompt: GEN_ACTION_PROMPTS.sleep, label: '睡觉' }
];

function jobSnapshot(job) {
  if (!job) return null;
  return {
    jobId: job.jobId, sourceId: job.sourceId, status: job.status,
    total: job.total, succeeded: job.succeeded, failed: job.failed,
    activePose: job.activePose, errorCode: job.errorCode,
    startedAt: job.startedAt, updatedAt: job.updatedAt
  };
}

function sendGenStatus(job) {
  const snap = jobSnapshot(job);
  if (!snap) return;
  const map = { running: 'generating', completed: 'completed', partial: 'partial', failed: 'failed', cancelled: 'cancelled', unavailable: 'unavailable' };
  if (panelWin) panelWin.webContents.send('gen-status', Object.assign({ state: map[snap.status] || snap.status, done: snap.succeeded + snap.failed, label: snap.activePose }, snap));
}

function persistGenJob() {
  state.genJob = jobSnapshot(genJob);
  saveState();
}

function applyFrameToState(key, filePath) {
  if (key === 'idle') state.customGenIdle = filePath;
  else if (key === 'walk') state.customGenWalk = filePath;
  else state.customGenActions = Object.assign({}, state.customGenActions || {}, { [key]: filePath });
  saveState();
  broadcastCustomImage();
}

let genRunner = null;

function cancelGenJob() {
  if (genRunner && genRunner.job.status === 'running') genRunner.cancel();
}

function makeEmptySnapshot(jobId, sourceId, status, total, errorCode) {
  const now = Date.now();
  return {
    jobId, sourceId, status, total, succeeded: 0, failed: 0,
    activePose: null, errorCode: errorCode || null, startedAt: now, updatedAt: now
  };
}

// 启动生成任务。only 指定本次要补的姿势（重试失败项用）
function startGenJob(sourcePath, sourceId, only) {
  const want = (k) => !only || only.includes(k);
  const has = (k) => {
    if (k === 'idle') return !!(state.customGenIdle && fs.existsSync(state.customGenIdle));
    if (k === 'walk') return !!(state.customGenWalk && fs.existsSync(state.customGenWalk));
    return !!(state.customGenActions && state.customGenActions[k] && fs.existsSync(state.customGenActions[k]));
  };
  const tasks = [];
  if (want('idle') && !has('idle')) tasks.push({ key: 'idle', prompt: GEN_IDLE_PROMPT, label: '站立', priority: true });
  GEN_REST.forEach((t) => { if (want(t.key) && !has(t.key)) tasks.push(t); });

  const jobId = `gen-${Date.now()}-${++genSeq}`;
  const sid = sourceId || jobId;

  if (!genAvailable()) {
    genJob = makeEmptySnapshot(jobId, sid, 'unavailable', tasks.length, 'unavailable');
    persistGenJob();
    sendGenStatus(genJob);
    petSay('（未配置生成服务，先用原图啦）', 'normal');
    return jobSnapshot(genJob);
  }
  if (!tasks.length) {
    genJob = makeEmptySnapshot(jobId, sid, 'completed', 0);
    persistGenJob();
    sendGenStatus(genJob);
    return jobSnapshot(genJob);
  }

  let runner;
  runner = createGenJob({
    jobId,
    sourceId: sid,
    tasks,
    genFrame: (t) => genAvatarFrame(sourcePath, t.key, t.prompt),
    applyFrame: (key, filePath) => {
      if (genJob !== runner.job) return;   // 旧任务不得写状态
      applyFrameToState(key, filePath);
    },
    onUpdate: (snap) => {
      if (genJob !== runner.job) return;   // 过期任务不广播
      state.genJob = snap;
      saveState();
      sendGenStatus(snap);
    },
    isCurrent: () => genJob === runner.job
  });

  genRunner = runner;
  genJob = runner.job;
  persistGenJob();
  sendGenStatus(runner.snapshot());
  petSay(`正在把照片变成 3D 形象（${tasks.length} 个姿势），稍等~`, 'happy');

  runner.run().then((snap) => {
    if (genJob !== runner.job) return;
    if (snap.status === 'completed') petSay('全部姿势生成完成，喜欢吗~', 'happy');
    else if (snap.status === 'partial') petSay(`生成了 ${snap.succeeded}/${snap.total} 个姿势，失败的可以重试~`, 'normal');
    else if (snap.status === 'cancelled') petSay('生成已取消，继续用现在的形象~', 'normal');
    else petSay('3D 生成没成功，先用原图啦', 'normal');
    cleanupOldGenFiles();
  });

  return runner.snapshot();
}

// 只清理应用自己产生且当前未引用的生成文件；不删除用户原始照片
function cleanupOldGenFiles() {
  try {
    const keep = new Set(
      [state.customImage, state.customGenIdle, state.customGenWalk]
        .concat(Object.values(state.customGenActions || {}))
        .filter(Boolean)
    );
    const dir = app.getPath('userData');
    const files = fs.readdirSync(dir);
    const keepSourcePrefix = path.basename(state.customImage || '');
    for (const f of files) {
      const isOwnFrame = /^pet-gen-.*\.(png|jpg)$/.test(f);
      const isOldSource = /^pet-custom-.*\.(png|jpg|jpeg|gif|webp)$/.test(f) && f !== keepSourcePrefix;
      if (!isOwnFrame && !isOldSource) continue;
      const full = path.join(dir, f);
      if (keep.has(full)) continue;
      try { fs.unlinkSync(full); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
}

function broadcastCustomImage() {
  if (petWin) petWin.webContents.send('custom-image-changed', customImageDataUrl());
  if (panelWin) panelWin.webContents.send('state-updated', publicState());
}

function broadcastFeedState() {
  const f = state.feed || {};
  if (petWin) petWin.webContents.send('feed-state', { water: !!f.waterRequest, meal: !!f.mealRequest });
  if (panelWin) panelWin.webContents.send('state-updated', publicState());
}


// ---------- 窗口 ----------
let petWin = null;
let panelWin = null;
let tray = null;

// 安全加固：禁止导航到外部地址、禁止新开窗口、注入 CSP
function hardenWebContents(win) {
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e) => e.preventDefault());
  wc.session.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: Object.assign({}, details.responseHeaders, {
        'Content-Security-Policy': ["default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'"]
      })
    });
  });
}

// 输入校验工具
function safeTitle(s) {
  return String(s == null ? '' : s).slice(0, 120).trim();
}
function safeTs(ts) {
  const n = Number(ts);
  return Number.isFinite(n) ? n : 0;
}

function createPetWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winW = 220;
  const winH = 260;
  const defPos = { x: width - winW - 20, y: height - winH - 20 };
  const pos = isInsideAnyDisplay(state.petPos, winW, winH, screen.getAllDisplays())
    ? state.petPos
    : defPos;
  petWin = new BrowserWindow({
    width: winW,
    height: winH,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  petWin.setAlwaysOnTop(true, 'screen-saver');
  hardenWebContents(petWin);
  petWin.loadFile(path.join(__dirname, 'renderer', 'pet.html'));
  // 点击穿透由渲染进程根据鼠标是否悬停在宠物上动态控制
}

function createPanelWindow() {
  panelWin = new BrowserWindow({
    width: 460,
    height: 600,
    title: '喵了么 · 控制台',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  hardenWebContents(panelWin);
  panelWin.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  panelWin.on('close', (e) => {
    // 关闭时隐藏而非退出
    if (!app.isQuitting) {
      e.preventDefault();
      panelWin.hide();
    }
  });
}

function openPanel() {
  if (!panelWin) createPanelWindow();
  panelWin.show();
  panelWin.focus();
}

// ---------- 托盘 ----------
function buildTray() {
  // 状态栏小猫头图标（含 2x 高清版本）
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  const icon2x = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray@2x.png'));
  if (!icon2x.isEmpty()) icon.addRepresentation({ scaleFactor: 2, buffer: icon2x.toPNG() });
  if (icon.isEmpty()) icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  tray = new Tray(icon);
  tray.setToolTip('喵了么 · 桌宠小助手');
  refreshTrayMenu();
  tray.on('click', openPanel);
  tray.on('double-click', openPanel);
}

function refreshTrayMenu() {
  const formLabel = { cat: '🐱 猫', robot: '🤖 机器人', slime: '🟢 史莱姆', custom: '📷 自定义图片' };
  const menu = Menu.buildFromTemplate([
    { label: '打开控制台  (⌘/Ctrl+⇧+P)', click: openPanel },
    { type: 'separator' },
    {
      label: '切换形态',
      submenu: ['custom', 'cat', 'robot', 'slime'].map((f) => ({
        label: formLabel[f],
        type: 'radio',
        checked: state.form === f,
        click: () => setForm(f)
      }))
    },
    { label: '🍅 开始番茄钟', click: () => startPomodoro() },
    { label: '💧 喂水', click: () => feedWater() },
    { label: '🍚 喂猫粮', click: () => feedFood() },
    { label: '🐾 来个动作',
      submenu: [
        { label: '打滚露肚皮', click: () => petWin && petWin.webContents.send('pet-say', { action: 'roll' }) },
        { label: '舔毛', click: () => petWin && petWin.webContents.send('pet-say', { action: 'groom' }) },
        { label: '吃猫粮', click: () => petWin && petWin.webContents.send('pet-say', { action: 'eat' }) },
        { label: '躺着睡觉', click: () => petWin && petWin.webContents.send('pet-say', { action: 'sleep' }) }
      ]
    },
    { label: '💧 喝水打卡', click: () => { state.stats.waterDone += 1; state.water.lastRemindTs = Date.now(); saveState(); petSay('咕噜咕噜~ 谢谢主人！', 'happy'); } },
    {
      label: '😴 稍后提醒',
      submenu: [10, 20, 30].map((min) => ({
        label: `${min} 分钟`,
        click: () => snoozeAll(min)
      }))
    },
    {
      label: '🌙 免打扰',
      type: 'checkbox',
      checked: !!(state.dnd && state.dnd.enabled),
      click: () => {
        state.dnd.enabled = !state.dnd.enabled;
        saveState();
        refreshTrayMenu();
        if (panelWin) panelWin.webContents.send('state-updated', publicState());
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
}

// ---------- 桌宠交互 ----------
function setForm(form) {
  state.form = form;
  saveState();
  refreshTrayMenu();
  if (petWin) {
    petWin.webContents.send('form-changed', form);
    if (form === 'custom') petWin.webContents.send('custom-image-changed', customImageDataUrl());
  }
  if (panelWin) panelWin.webContents.send('state-updated', publicState());
}

function petSay(text, mood = 'normal', force = false) {
  if (state.quiet && !force) return;   // 安静模式：自动气泡静默，用户主动操作仍可反馈
  if (petWin) petWin.webContents.send('pet-say', { text, mood });
}

// 是否处于免打扰时段（纯逻辑在 lib/schedule.js，已单测）
function inDnd() {
  return inDndWindow(state.dnd, Date.now());
}

function notify(title, body) {
  if (state.quiet) return;         // 安静模式
  if (inDnd()) return;             // 免打扰时段静默
  if (Notification.isSupported()) {
    const n = new Notification({ title, body });
    n.on('click', () => openPanel());
    n.show();
  }
}

// ---------- 调度器：检查各类提醒 ----------
function checkReminders() {
  const now = Date.now();

  // 喝水提醒 → 猫咪撒娇：主人该喂水啦（喂水后重置周期）
  if (state.water.enabled) {
    const intervalMs = state.water.intervalMin * 60 * 1000;
    if (!state.water.lastRemindTs) state.water.lastRemindTs = now;
    if (now - state.water.lastRemindTs >= intervalMs && !state.feed.waterRequest) {
      state.feed.waterRequest = true;
      state.feed.waterNagTs = now;
      saveState();
      broadcastFeedState();
      notify('💧 猫咪口渴了', '猫咪想喝水啦，主人也一起喝一杯吧~（点桌宠的喂水按钮）');
      petSay('我口渴了…主人也喝点水吧，喂喂我~', 'alert');
    } else if (state.feed.waterRequest && now - state.feed.waterNagTs > 5 * 60 * 1000) {
      // 还没喂？过 5 分钟再撒娇一次
      state.feed.waterNagTs = now;
      saveState();
      petSay('还是好渴呀，主人~', 'alert');
    }
  }

  // 饭点提醒 → 到点讨猫粮：午餐/晚餐各自独立（日期+餐次去重），窗口内未喂会再催
  const slot = mealSlotAt(now);
  if (slot && !state.feed.mealRequest && mealEligible(state.feed, slot, now)) {
    state.feed.mealRequest = true;
    state.feed.mealSlot = slot;
    state.feed.mealNagTs = now;
    state.feed.lastMealRequest[slot] = dateKey(now);
    saveState();
    broadcastFeedState();
    const label = slot === 'lunch' ? '午饭时间到啦' : '晚饭时间到啦';
    notify('🍚 到饭点啦', `${label}~ 记得给猫咪喂猫粮，自己也好好吃饭！`);
    petSay(`${label}！主人先去吃饭，顺便喂我吃猫粮~`, 'happy');
  } else if (state.feed.mealRequest && slot && now - state.feed.mealNagTs > 10 * 60 * 1000) {
    state.feed.mealNagTs = now;
    saveState();
    petSay('肚子咕咕叫…还没吃饭吗，主人？', 'alert');
  }

  // 久坐提醒
  if (state.sit && state.sit.enabled) {
    const intervalMs = state.sit.intervalMin * 60 * 1000;
    if (!state.sit.lastRemindTs) state.sit.lastRemindTs = now;
    if (now - state.sit.lastRemindTs >= intervalMs) {
      state.sit.lastRemindTs = now;
      saveState();
      notify('🧍 久坐提醒', '已经坐很久啦，起来活动 2 分钟吧！');
      petSay('站起来伸展一下吧~', 'alert');
    }
  }

  // 会议提醒：临近/到点各一次；休眠跨窗只补发最有意义的一条（纯逻辑已单测）
  state.meetings.forEach((m) => {
    const notice = meetingNotice(m, now, state.notifiedMeetings);
    if (!notice) return;
    if (notice.markKeys && notice.markKeys.length) {
      notice.markKeys.forEach((k) => { if (!state.notifiedMeetings.includes(k)) state.notifiedMeetings.push(k); });
      saveState();
    }
    if (notice.title) {
      notify(notice.title, notice.body);
      if (notice.pet) petSay(notice.pet, 'alert');
    }
  });

  // DDL 提醒：提前 1 天/1 小时/到点；只补发最紧迫一条，避免休眠后补发一串
  state.ddls.forEach((d) => {
    const notice = ddlNotice(d, now, state.notifiedDdls);
    if (!notice) return;
    if (notice.markKeys && notice.markKeys.length) {
      notice.markKeys.forEach((k) => { if (!state.notifiedDdls.includes(k)) state.notifiedDdls.push(k); });
      saveState();
    }
    if (notice.title) {
      notify(notice.title, notice.body);
      if (notice.pet) petSay(notice.pet, 'alert');
    }
  });
}

// ---------- 番茄钟 ----------
let pomo = { active: false, phase: 'work', endTs: 0, timer: null };

function persistPomo() {
  state.pomo = pomoSnapshot(pomo);
  saveState();
}

function pomoBroadcast() {
  const remain = Math.max(0, Math.round((pomo.endTs - Date.now()) / 1000));
  const payload = { active: pomo.active, phase: pomo.phase, remain };
  if (panelWin) panelWin.webContents.send('pomodoro-tick', payload);
}

function startPomodoro() {
  stopPomodoro(true);
  pomo.active = true;
  pomo.phase = 'work';
  pomo.endTs = Date.now() + state.pomodoro.workMin * 60 * 1000;
  persistPomo();
  petSay(`开始专注 ${state.pomodoro.workMin} 分钟，加油！`, 'happy');
  pomo.timer = setInterval(() => {
    if (Date.now() >= pomo.endTs) {
      if (pomo.phase === 'work') {
        state.stats.pomodoroDone = (state.stats.pomodoroDone || 0) + 1;
        pomo.phase = 'break';
        pomo.endTs = Date.now() + state.pomodoro.breakMin * 60 * 1000;
        persistPomo();
        notify('🍅 专注完成', `休息 ${state.pomodoro.breakMin} 分钟吧~`);
        petSay('专注完成！休息一下~', 'happy');
      } else {
        notify('🍅 休息结束', '可以开始下一个番茄了！');
        petSay('休息结束，继续加油？', 'normal');
        stopPomodoro();
        return;
      }
    }
    pomoBroadcast();
  }, 1000);
  pomoBroadcast();
}

function stopPomodoro(silent) {
  if (pomo.timer) clearInterval(pomo.timer);
  pomo = { active: false, phase: 'work', endTs: 0, timer: null };
  persistPomo();
  if (!silent) pomoBroadcast();
}

// 启动时恢复番茄钟：未到期继续计时；已到期只提示，不虚构完成次数
function restorePomodoroOnStartup() {
  const r = restorePomodoro(state.pomo, Date.now());
  if (r.action === 'resume') {
    pomo = { active: true, phase: r.phase, endTs: Date.now() + r.remainMs, timer: null };
    pomo.timer = setInterval(() => {
      if (Date.now() >= pomo.endTs) {
        if (pomo.phase === 'work') {
          state.stats.pomodoroDone += 1;
          pomo.phase = 'break';
          pomo.endTs = Date.now() + state.pomodoro.breakMin * 60 * 1000;
          persistPomo();
          notify('🍅 专注完成', `休息 ${state.pomodoro.breakMin} 分钟吧~`);
          petSay('专注完成！休息一下~', 'happy');
        } else {
          notify('🍅 休息结束', '可以开始下一个番茄了！');
          petSay('休息结束，继续加油？', 'normal');
          stopPomodoro();
          return;
        }
      }
      pomoBroadcast();
    }, 1000);
    pomoBroadcast();
  } else if (r.action === 'expired') {
    state.pomo = null;
    saveState();
    pomoBroadcast();
    petSay(r.phase === 'work' ? '上次专注已经结束啦（未计入完成）' : '上次休息已经结束啦', 'normal');
  } else {
    pomoBroadcast();
  }
}

// ---------- IPC 安全包装：只信任本应用的两个窗口 ----------
function isTrustedSender(e) {
  const wc = e && e.sender;
  if (!wc) return false;
  return (petWin && wc === petWin.webContents) || (panelWin && wc === panelWin.webContents);
}
function handle(channel, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    if (!isTrustedSender(e)) throw new Error('untrusted sender');
    return fn(e, ...args);
  });
}
function on(channel, fn) {
  ipcMain.on(channel, (e, ...args) => {
    if (!isTrustedSender(e)) return;
    fn(e, ...args);
  });
}

// ---------- 对外状态（给面板用） ----------
function publicState() {
  return {
    form: state.form,
    hasCustomImage: !!customImagePath(),
    // UI 契约：布尔徽标状态（与 feed-state 事件形状一致）
    feed: { water: !!state.feed.waterRequest, meal: !!state.feed.mealRequest },
    water: state.water,
    sit: state.sit,
    pomodoro: state.pomodoro,
    dnd: state.dnd,
    theme: state.theme,
    autoLaunch: state.autoLaunch,
    quiet: state.quiet,
    stats: state.stats,
    meetings: state.meetings,
    ddls: state.ddls,
    genJob: jobSnapshot(genJob) || state.genJob
  };
}

// ---------- 喂养领域函数（托盘 / IPC / 面板统一入口） ----------
function feedWater() {
  const now = Date.now();
  state.feed.waterRequest = false;
  state.feed.waterNagTs = 0;
  state.water.lastRemindTs = now;
  state.stats.waterDone += 1;
  state.stats.intimacy += 1;
  saveState();
  broadcastFeedState();
  if (petWin) petWin.webContents.send('pet-say', { action: 'drink', text: '咕噜咕噜~ 猫咪喝饱啦，主人也喝水了吗？', mood: 'happy' });  // 用户主动操作，安静模式下也反馈
  notify('💧 喂水完成', '猫咪喝饱啦，主人也记得喝水~');
}

function feedFood() {
  const now = Date.now();
  state.feed.mealRequest = false;
  state.feed.mealNagTs = 0;
  state.feed.mealSlot = null;
  // 语义：一天只喂一次猫粮；两个餐次都记为已喂，避免当天重复讨粮
  state.feed.lastMealFed.lunch = dateKey(now);
  state.feed.lastMealFed.dinner = dateKey(now);
  state.stats.intimacy += 2;
  saveState();
  broadcastFeedState();
  if (petWin) petWin.webContents.send('pet-say', { action: 'eat', text: '猫粮好吃~ 主人也要好好吃饭哦！', mood: 'happy' });
  notify('🍚 喂饭完成', '猫咪吃饱啦，主人也别忘了自己的饭~');
}

function snoozeAll(minutes) {
  const mins = Math.min(120, Math.max(1, parseInt(minutes, 10) || 10));
  const now = Date.now();
  if (state.water.enabled) state.water.lastRemindTs = now + mins * 60000 - state.water.intervalMin * 60000;
  if (state.sit.enabled) state.sit.lastRemindTs = now + mins * 60000 - state.sit.intervalMin * 60000;
  state.feed.waterRequest = false;
  state.feed.waterNagTs = 0;
  state.feed.mealRequest = false;
  state.feed.mealNagTs = 0;
  state.feed.mealSlot = null;
  saveState();
  broadcastFeedState();
  petSay(`好的，${mins} 分钟后再提醒~`, 'normal');
  return mins;
}

// ---------- IPC ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

handle('get-state', () => publicState());

handle('set-form', (e, form) => {
  const allowed = ['cat', 'robot', 'slime', 'custom'];
  if (!allowed.includes(form)) return { ok: false, error: 'invalid form', state: publicState() };
  setForm(form);
  return publicState();
});

// 自定义图片：读取当前图片为 dataURL（受 CSP 限制，用 data: 而非 file://）
handle('get-custom-image', () => customImageDataUrl());
handle('get-custom-frames', () => customFrames());

// 上传自定义图片：打开文件选择框，复制到 userData 后记忆
handle('upload-custom-image', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择桌宠图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false };
  try {
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase() || '.png';
    try {
      const st = fs.statSync(src);
      if (st.size > 20 * 1024 * 1024) return { ok: false, error: 'image_too_large' };
      const head = Buffer.alloc(12);
      const fd = fs.openSync(src, 'r');
      try { fs.readSync(fd, head, 0, 12, 0); } finally { fs.closeSync(fd); }
      const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
      const isJpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const isGif = head.slice(0, 3).toString('ascii') === 'GIF';
      const isWebp = head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP';
      if (!isPng && !isJpg && !isGif && !isWebp) return { ok: false, error: 'invalid_image' };
    } catch (e) {
      return { ok: false, error: 'invalid_image' };
    }
    const jobId = `upload-${Date.now()}-${++genSeq}`;
    // 每次上传独立输入快照，避免被下一次上传覆盖
    const dest = path.join(app.getPath('userData'), `pet-custom-${jobId}${ext}`);
    fs.copyFileSync(src, dest);
    cancelGenJob();                 // 旧任务立即失效，不再回写
    state.customImage = dest;
    state.customGenIdle = null;     // 清除上一次生成的 3D 帧，待重新生成
    state.customGenWalk = null;
    state.customGenActions = null;
    state.form = 'custom';
    saveState();
    refreshTrayMenu();
    const url = customImageDataUrl();
    if (petWin) { petWin.webContents.send('form-changed', 'custom'); petWin.webContents.send('custom-image-changed', url); }
    if (panelWin) panelWin.webContents.send('state-updated', publicState());
    // 后台异步生成 3D 形象（不阻塞上传返回；先用原图占位，生成完自动替换）
    startGenJob(dest, jobId, null);
    return { ok: true, dataUrl: url, generating: genAvailable(), jobId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// 生成任务查询 / 取消 / 重试失败项
handle('get-gen-job', () => jobSnapshot(genJob) || state.genJob);
handle('cancel-gen', () => { cancelGenJob(); return jobSnapshot(genJob); });
handle('retry-gen', () => {
  const src = state.customImage;
  if (!src || !fs.existsSync(src)) return { ok: false, error: 'no_source' };
  const only = [];
  if (!(state.customGenIdle && fs.existsSync(state.customGenIdle))) only.push('idle');
  if (!(state.customGenWalk && fs.existsSync(state.customGenWalk))) only.push('walk');
  GEN_REST.forEach((t) => {
    const p = state.customGenActions && state.customGenActions[t.key];
    if (!(p && fs.existsSync(p))) only.push(t.key);
  });
  if (!only.length) return { ok: true, nothingToDo: true };
  const job = startGenJob(src, `retry-${Date.now()}`, only);
  return { ok: true, job: jobSnapshot(job) };
});

handle('set-water', (e, cfg) => {
  const c = cfg || {};
  state.water = Object.assign({}, state.water, {
    enabled: !!c.enabled,
    intervalMin: Math.min(240, Math.max(5, parseInt(c.intervalMin, 10) || 45))
  });
  state.water.lastRemindTs = Date.now();
  if (!state.water.enabled) {
    // 关闭提醒时清理待喂请求，避免徽标永久停留
    state.feed.waterRequest = false;
    state.feed.waterNagTs = 0;
    broadcastFeedState();
  }
  saveState();
  return publicState();
});

handle('add-meeting', (e, payload) => {
  const title = safeTitle(payload && payload.title);
  const ts = safeTs(payload && payload.ts);
  if (!title || !ts) return publicState();
  state.meetings.push({ id: uid(), title, ts });
  state.meetings.sort((a, b) => a.ts - b.ts);
  saveState();
  return publicState();
});

handle('remove-meeting', (e, id) => {
  state.meetings = state.meetings.filter((m) => m.id !== id);
  state.notifiedMeetings = clearMarks(state.notifiedMeetings, String(id));
  saveState();
  return publicState();
});

handle('add-ddl', (e, payload) => {
  const title = safeTitle(payload && payload.title);
  const ts = safeTs(payload && payload.ts);
  if (!title || !ts) return publicState();
  state.ddls.push({ id: uid(), title, ts });
  state.ddls.sort((a, b) => a.ts - b.ts);
  saveState();
  return publicState();
});

handle('remove-ddl', (e, id) => {
  state.ddls = state.ddls.filter((d) => d.id !== id);
  state.notifiedDdls = clearMarks(state.notifiedDdls, String(id));
  saveState();
  return publicState();
});

// 久坐
handle('set-sit', (e, cfg) => {
  const c = cfg || {};
  state.sit = Object.assign({}, state.sit, {
    enabled: !!c.enabled,
    intervalMin: Math.min(240, Math.max(10, parseInt(c.intervalMin, 10) || 60))
  });
  state.sit.lastRemindTs = Date.now();
  saveState();
  return publicState();
});

// 免打扰
handle('set-dnd', (e, cfg) => {
  const c = cfg || {};
  const okTime = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    return Number(m[1]) <= 23 && Number(m[2]) <= 59;
  };
  state.dnd = {
    enabled: !!c.enabled,
    start: okTime(c.start) ? c.start : state.dnd.start,
    end: okTime(c.end) ? c.end : state.dnd.end
  };
  saveState();
  return publicState();
});

// 番茄钟配置 + 控制
handle('set-pomodoro', (e, cfg) => {
  const c = cfg || {};
  state.pomodoro = {
    workMin: Math.min(120, Math.max(1, parseInt(c.workMin, 10) || 25)),
    breakMin: Math.min(60, Math.max(1, parseInt(c.breakMin, 10) || 5))
  };
  saveState();
  return publicState();
});
on('pomodoro-start', () => startPomodoro());
on('pomodoro-stop', () => stopPomodoro());

// 主题
handle('set-theme', (e, theme) => {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  saveState();
  return publicState();
});

// 开机自启
handle('set-autolaunch', (e, enabled) => {
  state.autoLaunch = !!enabled;
  try {
    app.setLoginItemSettings({ openAtLogin: state.autoLaunch, openAsHidden: true });
  } catch (err) { /* 某些平台/环境不支持 */ }
  saveState();
  return publicState();
});

// 亲密度 +1（桌宠被抚摸/互动）
handle('add-intimacy', (e, n) => {
  const delta = Math.min(10, Math.max(1, parseInt(n, 10) || 1));
  state.stats.intimacy += delta;
  saveState();
  return state.stats;
});

// 喝水打卡（不计亲密度，仅统计）
handle('drink-water', () => {
  state.stats.waterDone += 1;
  state.water.lastRemindTs = Date.now(); // 顺延下次提醒
  saveState();
  return state.stats;
});

// 喂水 / 喂猫粮 / 稍后提醒：统一走领域函数
handle('feed-water', () => { feedWater(); return publicState(); });
handle('feed-food', () => { feedFood(); return publicState(); });
on('snooze', (e, minutes) => { snoozeAll(minutes); });

// 安静模式
handle('set-quiet', (e, enabled) => {
  state.quiet = !!enabled;
  saveState();
  return publicState();
});

// 桌宠点击穿透控制：鼠标在宠物上时可交互，否则穿透
on('set-ignore-mouse', (e, ignore) => {
  if (petWin) petWin.setIgnoreMouseEvents(ignore, { forward: true });
});

// 手动拖拽桌宠窗口（比 -webkit-app-region 更可靠，且不受穿透影响）
handle('get-win-pos', () => {
  if (!petWin) return { x: 0, y: 0 };
  const [x, y] = petWin.getPosition();
  return { x, y };
});
on('set-win-pos', (e, x, y) => {
  if (!petWin || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const [w, h] = petWin.getSize();
  const disp = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const p = clampToArea(x, y, w, h, disp.workArea);
  petWin.setPosition(p.x, p.y);
});
on('save-win-pos', (e, x, y) => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  state.petPos = { x: Math.round(x), y: Math.round(y) };
  saveState();
});

on('pet-say', (e, msg) => petSay(msg.text, msg.mood, true));
on('trigger-action', (e, name) => {
  const allowed = ['roll', 'groom', 'eat', 'sleep', 'drink'];
  if (!allowed.includes(name)) return;
  if (petWin) petWin.webContents.send('pet-say', { action: name });
});
on('open-panel', openPanel);

// ---------- 生命周期 ----------
let reminderTimer = null;
app.whenReady().then(() => {
  createPetWindow();
  createPanelWindow();
  buildTray();
  let openedAsHidden = false;
  try { openedAsHidden = !!(app.getLoginItemSettings && app.getLoginItemSettings().wasOpenedAsHidden); } catch (err) { /* ignore */ }
  if (!openedAsHidden) openPanel(); // 手动启动展示面板；开机静默启动不打扰
  checkReminders();
  reminderTimer = setInterval(checkReminders, 20 * 1000); // 每 20 秒检查一次
  restorePomodoroOnStartup();

  // 上次退出时仍在运行的任务：标记为中断，避免面板显示虚假“生成中”
  if (state.genJob && state.genJob.status === 'running') {
    state.genJob = Object.assign({}, state.genJob, { status: 'failed', errorCode: 'interrupted', activePose: null, updatedAt: Date.now() });
    saveState();
  }

  // 同步开机自启设置
  try {
    app.setLoginItemSettings({ openAtLogin: !!state.autoLaunch, openAsHidden: true });
  } catch (err) { /* ignore */ }

  // 全局快捷键：Cmd/Ctrl+Shift+P 打开/隐藏控制台
  try {
    globalShortcut.register('CommandOrControl+Shift+P', () => {
      if (panelWin && panelWin.isVisible()) panelWin.hide();
      else openPanel();
    });
  } catch (err) { /* ignore */ }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (reminderTimer) clearInterval(reminderTimer);
  stopPomodoro(true);
  for (const child of genChildren) { try { child.kill('SIGKILL'); } catch (e) { /* already gone */ } }
  genChildren.clear();
});

app.on('activate', () => { openPanel(); });

app.on('window-all-closed', (e) => {
  // 保持常驻，不随窗口关闭退出
});

app.on('before-quit', () => { app.isQuitting = true; });

