const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ---------- 数据持久化 ----------
const STORE_FILE = path.join(app.getPath('userData'), 'zerobreak-store.json');

const DEFAULT_STATE = {
  form: 'custom',         // cat | robot | slime | custom（自定义图片）
  customImage: null,      // 用户上传的原始图片绝对路径
  customGenIdle: null,    // 由原图在后台生成的 3D 站立帧路径
  customGenWalk: null,    // 由原图在后台生成的 3D 行走帧路径
  customGenActions: null, // 由原图生成的 3D 动作帧 { roll, groom, eat, sleep } 路径
  water: {
    enabled: true,
    intervalMin: 45,      // 每隔多少分钟提醒喝水
    lastRemindTs: 0
  },
  sit: {                  // 久坐提醒
    enabled: false,
    intervalMin: 60,
    lastRemindTs: 0
  },
  pomodoro: {             // 番茄钟配置
    workMin: 25,
    breakMin: 5
  },
  dnd: {                  // 免打扰时段
    enabled: false,
    start: '22:00',
    end: '08:00'
  },
  feed: {                 // 喂养玩法状态
    waterRequest: false,      // 猫口渴，等主人喂水
    waterNagTs: 0,            // 上次撒娇时间（没喂就隔几分钟再催）
    mealRequest: false,       // 到饭点，等主人喂猫粮
    mealNagTs: 0,
    lastMealRequestDate: '',  // 当天是否已发过饭点提醒
    lastMealFedDate: ''       // 当天是否已喂过猫粮
  },
  theme: 'light',         // light | dark
  autoLaunch: false,      // 开机自启
  stats: {                // 养成/成就
    intimacy: 0,
    waterDone: 0,
    pomodoroDone: 0
  },
  meetings: [],           // { id, title, ts }  ts=毫秒时间戳
  ddls: [],               // { id, title, ts }
  notifiedMeetings: [],   // 已提醒过的会议 id
  notifiedDdls: [],       // 已提醒过的 ddl id
  petPos: null            // 桌宠窗口位置 { x, y }
};

function loadState() {
  let parsed = {};
  try {
    parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch (e) {
    parsed = {};
  }
  // 深合并一层，确保新增的嵌套默认项补齐（也兼容旧存储/损坏存储）
  const merged = JSON.parse(JSON.stringify(DEFAULT_STATE));
  Object.keys(parsed).forEach((k) => {
    const v = parsed[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object') {
      merged[k] = Object.assign({}, merged[k], v);
    } else if (v !== undefined) {
      merged[k] = v;
    }
  });
  return merged;
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

function fileToDataUrl(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    const ext = path.extname(p).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png'
      : ext === 'gif' ? 'image/gif'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
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

// 从候选结果里抽 base64 图片（兼容多种响应结构）
function extractImageBase64(resp) {
  try {
    const j = JSON.parse(resp);
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    for (const p of parts) {
      const d = (p.inlineData || p.inline_data || {}).data;
      if (d) return d;
    }
    for (const it of (j.data || [])) {
      if (it.b64_image) return it.b64_image;
      if (it.url) return null; // 需要二次下载，暂不支持
    }
  } catch (e) { /* fallthrough */ }
  return null;
}

// 调用图像生成服务，把 srcPath 按给定提示词转成一帧；成功返回输出文件绝对路径，失败返回 null
function genAvatarFrame(srcPath, poseName, prompt) {
  return new Promise(async (resolve) => {
    const cfg = loadGenConfig();
    if (!cfg) return resolve(null);
    const outPath = path.join(app.getPath('userData'), `pet-gen-${poseName}-${Date.now()}.png`);
    try {
      let base64 = null;
      if (cfg.provider === 'comate' && cfg.comate && cfg.comate.apiUrl) {
        // Comate Nano Banana Pro：Gemini 风格 contents + login-name 头
        const b64 = fs.readFileSync(srcPath).toString('base64');
        const payload = {
          contents: [{ role: 'USER', parts: [
            { inline_data: { mime_type: mimeOf(srcPath), data: b64 } },
            { text: prompt }
          ] }],
          resolution: '2K',
          aspectRatio: '1:1'
        };
        const resp = await httpsJson(cfg.comate.apiUrl, { 'login-name': cfg.comate.loginName || '' }, payload);
        base64 = extractImageBase64(resp);
      } else if (cfg.provider === 'qianfan' && cfg.qianfan && cfg.qianfan.apiUrl && cfg.qianfan.apiKey) {
        // 百度千帆通用图像生成（OpenAI 兼容）：Bearer API Key
        const b64 = fs.readFileSync(srcPath).toString('base64');
        const dataUri = `data:${mimeOf(srcPath)};base64,${b64}`;
        const payload = {
          model: cfg.qianfan.model || 'ernie-image-turbo',
          prompt: `${dataUri}\n${prompt}`,
          n: 1,
          size: cfg.qianfan.size || '1024x1024'
        };
        const resp = await httpsJson(cfg.qianfan.apiUrl, { 'Authorization': 'Bearer ' + cfg.qianfan.apiKey }, payload);
        base64 = extractImageBase64(resp);
      } else if (cfg.skillScript && fs.existsSync(cfg.skillScript)) {
        // 旧版兼容：调用 skill 脚本
        return resolve(await genViaScript(cfg, srcPath, poseName, prompt, outPath));
      } else {
        return resolve(null);
      }
      if (!base64) return resolve(null);
      fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
      return resolve(outPath);
    } catch (e) {
      console.error('[gen] error', e && e.message);
      return resolve(null);
    }
  });
}

// 旧版 skill 脚本通道
function genViaScript(cfg, srcPath, poseName, prompt, outPath) {
  return new Promise((resolve) => {
    const out = `pet-gen-${poseName}-${Date.now()}.png`;
    const env = Object.assign({}, process.env, {
      COMATE_USERNAME_ENCRYPTED: cfg.comateUsernameEncrypted || process.env.COMATE_USERNAME_ENCRYPTED || ''
    });
    let stdout = '';
    let stderr = '';
    const child = spawn('bash', [cfg.skillScript, '--prompt', prompt, '--input', srcPath, '--output', out, '--aspect-ratio', '1:1', '--resolution', '2K'],
      { cwd: app.getPath('userData'), env });
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      const line = stdout.trim().split('\n').filter(Boolean).pop();
      if (code === 0 && line && fs.existsSync(line)) resolve(line);
      else { console.error('[gen] script failed', code, stderr.slice(-300)); resolve(null); }
    });
    child.on('error', (err) => { console.error('[gen] spawn error', err); resolve(null); });
  });
}

let generating = false;
function sendGenStatus(status) {
  if (panelWin) panelWin.webContents.send('gen-status', status);
}

// 上传后触发：先单独优先生成「站立」，其余 5 帧并行生成，带进度
async function generate3DFromUpload(srcPath) {
  if (!genAvailable()) {
    sendGenStatus({ state: 'unavailable' });
    petSay('（未配置生成服务，先用原图啦）', 'normal');
    return;
  }
  if (generating) return;
  generating = true;

  const total = 6;
  let done = 0;
  let okCount = 0;

  const bump = (label) => { done++; sendGenStatus({ state: 'generating', done, total, label }); };

  petSay('正在把你的照片变成 3D 立体形象，共 6 个姿势，稍等~', 'happy');
  sendGenStatus({ state: 'generating', done: 0, total, label: '站立(优先)' });

  try {
    // 1) 站立帧优先，单独先出，立即应用
    const idle = await genAvatarFrame(srcPath, 'idle', GEN_IDLE_PROMPT);
    if (idle) { state.customGenIdle = idle; okCount++; saveState(); broadcastCustomImage(); }
    bump('站立');

    // 2) 其余 5 帧并行生成，谁先好谁先应用
    const rest = [
      { key: 'walk',  prompt: GEN_WALK_PROMPT,          label: '行走' },
      { key: 'roll',  prompt: GEN_ACTION_PROMPTS.roll,  label: '打滚' },
      { key: 'groom', prompt: GEN_ACTION_PROMPTS.groom, label: '舔毛' },
      { key: 'eat',   prompt: GEN_ACTION_PROMPTS.eat,   label: '吃饭' },
      { key: 'sleep', prompt: GEN_ACTION_PROMPTS.sleep, label: '睡觉' }
    ];
    await Promise.all(rest.map(async (s) => {
      const out = await genAvatarFrame(srcPath, s.key, s.prompt);
      if (out) {
        okCount++;
        if (s.key === 'walk') state.customGenWalk = out;
        else state.customGenActions = Object.assign({}, state.customGenActions || {}, { [s.key]: out });
        saveState();
        broadcastCustomImage();   // 每出一帧即时应用
      }
      bump(s.label);
    }));

    if (okCount > 0) { sendGenStatus({ state: 'done', done: total, total }); petSay('全部姿势生成完成，喜欢吗~', 'happy'); }
    else { sendGenStatus({ state: 'failed' }); petSay('3D 生成没成功，先用原图啦', 'normal'); }
  } catch (e) {
    sendGenStatus({ state: 'failed' });
  } finally {
    generating = false;
  }
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
  let pos = defPos;
  if (state.petPos && typeof state.petPos.x === 'number') {
    // 校验保存的位置是否仍落在某个显示器内（防止拔掉外接屏后桌宠跑到屏幕外）
    const p = state.petPos;
    const onScreen = screen.getAllDisplays().some((d) => {
      const b = d.bounds;
      return p.x + winW > b.x && p.x < b.x + b.width && p.y + winH > b.y && p.y < b.y + b.height;
    });
    pos = onScreen ? p : defPos;
  }
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
    title: '零度突破 · 控制台',
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
  tray.setToolTip('零度突破 · 桌宠小助手');
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
    { label: '💧 喂水', click: () => {
        const f = state.feed;
        f.waterRequest = false; f.waterNagTs = 0;
        state.water.lastRemindTs = Date.now();
        state.stats.waterDone = (state.stats.waterDone || 0) + 1;
        state.stats.intimacy = (state.stats.intimacy || 0) + 1;
        saveState();
        broadcastFeedState();
        if (petWin) petWin.webContents.send('pet-say', { action: 'drink', text: '咕噜咕噜~ 喝饱啦！', mood: 'happy' });
      } },
    { label: '🍚 喂猫粮', click: () => {
        const f = state.feed;
        const d = new Date();
        f.mealRequest = false; f.mealNagTs = 0;
        f.lastMealFedDate = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        state.stats.intimacy = (state.stats.intimacy || 0) + 2;
        saveState();
        broadcastFeedState();
        if (petWin) petWin.webContents.send('pet-say', { action: 'eat', text: '猫粮好吃~ 主人也要吃饭哦！', mood: 'happy' });
      } },
    { label: '🐾 来个动作',
      submenu: [
        { label: '打滚露肚皮', click: () => petWin && petWin.webContents.send('pet-say', { action: 'roll' }) },
        { label: '舔毛', click: () => petWin && petWin.webContents.send('pet-say', { action: 'groom' }) },
        { label: '吃猫粮', click: () => petWin && petWin.webContents.send('pet-say', { action: 'eat' }) },
        { label: '躺着睡觉', click: () => petWin && petWin.webContents.send('pet-say', { action: 'sleep' }) }
      ]
    },
    { label: '💧 喝水打卡', click: () => { state.stats.waterDone = (state.stats.waterDone || 0) + 1; state.water.lastRemindTs = Date.now(); saveState(); petSay('咕噜咕噜~ 谢谢主人！', 'happy'); } },
    {
      label: '😴 稍后提醒',
      submenu: [10, 20, 30].map((min) => ({
        label: `${min} 分钟`,
        click: () => {
          const now = Date.now();
          if (state.water.enabled) state.water.lastRemindTs = now + min * 60000 - state.water.intervalMin * 60000;
          if (state.sit.enabled) state.sit.lastRemindTs = now + min * 60000 - state.sit.intervalMin * 60000;
          saveState();
          petSay(`好的，${min} 分钟后再提醒~`, 'normal');
        }
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

function petSay(text, mood = 'normal') {
  if (petWin) petWin.webContents.send('pet-say', { text, mood });
}

// 是否处于免打扰时段
function inDnd() {
  if (!state.dnd || !state.dnd.enabled) return false;
  const parse = (s) => {
    const [h, m] = String(s).split(':').map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = parse(state.dnd.start);
  const end = parse(state.dnd.end);
  if (start === end) return false;
  // 跨午夜（如 22:00 - 08:00）
  if (start > end) return cur >= start || cur < end;
  return cur >= start && cur < end;
}

function notify(title, body) {
  if (inDnd()) return;             // 免打扰时段静默
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
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

  // 饭点提醒 → 到点讨猫粮：中午 11:30-13:00、晚上 17:30-19:00，各提醒一次（没喂的话窗口内再催）
  const d = new Date();
  const hm = d.getHours() * 60 + d.getMinutes();
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const inLunch = hm >= 11 * 60 + 30 && hm <= 13 * 60;
  const inDinner = hm >= 17 * 60 + 30 && hm <= 19 * 60;
  if ((inLunch || inDinner) && state.feed.lastMealRequestDate !== today && state.feed.lastMealFedDate !== today) {
    state.feed.mealRequest = true;
    state.feed.mealNagTs = now;
    state.feed.lastMealRequestDate = today;
    saveState();
    broadcastFeedState();
    notify('🍚 到饭点啦', '该吃饭了~ 记得给猫咪喂猫粮，自己也好好吃饭！');
    petSay('到饭点啦！主人先去吃饭，顺便喂我吃猫粮~', 'happy');
  } else if (state.feed.mealRequest && (inLunch || inDinner) && now - state.feed.mealNagTs > 10 * 60 * 1000) {
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

  // 会议提醒：提前 5 分钟 + 到点
  state.meetings.forEach((m) => {
    const diff = m.ts - now;
    const key5 = m.id + ':5';
    const key0 = m.id + ':0';
    if (diff <= 5 * 60 * 1000 && diff > 0 && !state.notifiedMeetings.includes(key5)) {
      state.notifiedMeetings.push(key5);
      saveState();
      notify('📅 会议即将开始', `「${m.title}」还有约 5 分钟开始`);
      petSay(`「${m.title}」快开会啦！`, 'alert');
    }
    if (diff <= 0 && diff > -60 * 1000 && !state.notifiedMeetings.includes(key0)) {
      state.notifiedMeetings.push(key0);
      saveState();
      notify('📅 会议开始', `「${m.title}」现在开始`);
      petSay(`开会时间到：「${m.title}」`, 'alert');
    }
  });

  // DDL 提醒：提前 1 天、1 小时、到点
  state.ddls.forEach((d) => {
    const diff = d.ts - now;
    const checks = [
      { k: 'd', ms: 24 * 60 * 60 * 1000, label: '还有 1 天' },
      { k: 'h', ms: 60 * 60 * 1000, label: '还有 1 小时' },
      { k: '0', ms: 0, label: '已到截止时间' }
    ];
    checks.forEach((c) => {
      const key = d.id + ':' + c.k;
      const hit = c.k === '0'
        ? (diff <= 0 && diff > -60 * 1000)
        : (diff <= c.ms && diff > c.ms - 60 * 1000);
      if (hit && !state.notifiedDdls.includes(key)) {
        state.notifiedDdls.push(key);
        saveState();
        notify('⏰ DDL 提醒', `「${d.title}」${c.label}`);
        petSay(`DDL：「${d.title}」${c.label}！`, 'alert');
      }
    });
  });
}

// ---------- 番茄钟 ----------
let pomo = { active: false, phase: 'work', endTs: 0, timer: null };

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
  petSay(`开始专注 ${state.pomodoro.workMin} 分钟，加油！`, 'happy');
  pomo.timer = setInterval(() => {
    if (Date.now() >= pomo.endTs) {
      if (pomo.phase === 'work') {
        state.stats.pomodoroDone = (state.stats.pomodoroDone || 0) + 1;
        saveState();
        pomo.phase = 'break';
        pomo.endTs = Date.now() + state.pomodoro.breakMin * 60 * 1000;
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
  if (!silent) pomoBroadcast();
}

// ---------- 对外状态（给面板用） ----------
function publicState() {
  return {
    form: state.form,
    hasCustomImage: !!customImagePath(),
    feed: state.feed,
    water: state.water,
    sit: state.sit,
    pomodoro: state.pomodoro,
    dnd: state.dnd,
    theme: state.theme,
    autoLaunch: state.autoLaunch,
    stats: state.stats,
    meetings: state.meetings,
    ddls: state.ddls
  };
}

// ---------- IPC ----------
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

ipcMain.handle('get-state', () => publicState());

ipcMain.handle('set-form', (e, form) => { setForm(form); return publicState(); });

// 自定义图片：读取当前图片为 dataURL（受 CSP 限制，用 data: 而非 file://）
ipcMain.handle('get-custom-image', () => customImageDataUrl());
ipcMain.handle('get-custom-frames', () => customFrames());

// 上传自定义图片：打开文件选择框，复制到 userData 后记忆
ipcMain.handle('upload-custom-image', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择桌宠图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false };
  try {
    const src = res.filePaths[0];
    const ext = path.extname(src).toLowerCase() || '.png';
    const dest = path.join(app.getPath('userData'), 'pet-custom' + ext);
    fs.copyFileSync(src, dest);
    state.customImage = dest;
    state.customGenIdle = null;   // 清除上一次生成的 3D 帧，待重新生成
    state.customGenWalk = null;
    state.customGenActions = null;
    state.form = 'custom';
    saveState();
    refreshTrayMenu();
    const url = customImageDataUrl();
    if (petWin) { petWin.webContents.send('form-changed', 'custom'); petWin.webContents.send('custom-image-changed', url); }
    if (panelWin) panelWin.webContents.send('state-updated', publicState());
    // 后台异步生成 3D 形象（不阻塞上传返回；先用原图占位，生成完自动替换）
    generate3DFromUpload(dest);
    return { ok: true, dataUrl: url, generating: genAvailable() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('set-water', (e, cfg) => {
  const c = cfg || {};
  state.water = Object.assign({}, state.water, {
    enabled: !!c.enabled,
    intervalMin: Math.min(240, Math.max(5, parseInt(c.intervalMin, 10) || 45))
  });
  state.water.lastRemindTs = Date.now();
  saveState();
  return publicState();
});

ipcMain.handle('add-meeting', (e, payload) => {
  const title = safeTitle(payload && payload.title);
  const ts = safeTs(payload && payload.ts);
  if (!title || !ts) return publicState();
  state.meetings.push({ id: uid(), title, ts });
  state.meetings.sort((a, b) => a.ts - b.ts);
  saveState();
  return publicState();
});

ipcMain.handle('remove-meeting', (e, id) => {
  state.meetings = state.meetings.filter((m) => m.id !== id);
  saveState();
  return publicState();
});

ipcMain.handle('add-ddl', (e, payload) => {
  const title = safeTitle(payload && payload.title);
  const ts = safeTs(payload && payload.ts);
  if (!title || !ts) return publicState();
  state.ddls.push({ id: uid(), title, ts });
  state.ddls.sort((a, b) => a.ts - b.ts);
  saveState();
  return publicState();
});

ipcMain.handle('remove-ddl', (e, id) => {
  state.ddls = state.ddls.filter((d) => d.id !== id);
  saveState();
  return publicState();
});

// 久坐
ipcMain.handle('set-sit', (e, cfg) => {
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
ipcMain.handle('set-dnd', (e, cfg) => {
  const c = cfg || {};
  const okTime = (s) => /^\d{1,2}:\d{2}$/.test(String(s));
  state.dnd = {
    enabled: !!c.enabled,
    start: okTime(c.start) ? c.start : state.dnd.start,
    end: okTime(c.end) ? c.end : state.dnd.end
  };
  saveState();
  return publicState();
});

// 番茄钟配置 + 控制
ipcMain.handle('set-pomodoro', (e, cfg) => {
  const c = cfg || {};
  state.pomodoro = {
    workMin: Math.min(120, Math.max(1, parseInt(c.workMin, 10) || 25)),
    breakMin: Math.min(60, Math.max(1, parseInt(c.breakMin, 10) || 5))
  };
  saveState();
  return publicState();
});
ipcMain.on('pomodoro-start', () => startPomodoro());
ipcMain.on('pomodoro-stop', () => stopPomodoro());

// 主题
ipcMain.handle('set-theme', (e, theme) => {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  saveState();
  return publicState();
});

// 开机自启
ipcMain.handle('set-autolaunch', (e, enabled) => {
  state.autoLaunch = !!enabled;
  try {
    app.setLoginItemSettings({ openAtLogin: state.autoLaunch, openAsHidden: true });
  } catch (err) { /* 某些平台/环境不支持 */ }
  saveState();
  return publicState();
});

// 亲密度 +1（桌宠被抚摸/互动）
ipcMain.handle('add-intimacy', (e, n) => {
  state.stats.intimacy = (state.stats.intimacy || 0) + (parseInt(n, 10) || 1);
  saveState();
  return state.stats;
});

// 喝水打卡
ipcMain.handle('drink-water', () => {
  state.stats.waterDone = (state.stats.waterDone || 0) + 1;
  state.water.lastRemindTs = Date.now(); // 顺延下次提醒
  saveState();
  return state.stats;
});

// 喂水：清除讨水状态，桌宠播喝水动作
ipcMain.handle('feed-water', () => {
  const f = state.feed;
  f.waterRequest = false;
  f.waterNagTs = 0;
  state.water.lastRemindTs = Date.now();   // 下一轮喝水周期重新计算
  state.stats.waterDone = (state.stats.waterDone || 0) + 1;
  state.stats.intimacy = (state.stats.intimacy || 0) + 1;
  saveState();
  broadcastFeedState();
  if (petWin) petWin.webContents.send('pet-say', { action: 'drink', text: '咕噜咕噜~ 猫咪喝饱啦，主人也喝水了吗？', mood: 'happy' });
  notify('💧 喂水完成', '猫咪喝饱啦，主人也记得喝水~');
  return publicState();
});

// 喂猫粮：清除讨粮状态，桌宠播吃饭动作
ipcMain.handle('feed-food', () => {
  const f = state.feed;
  const d = new Date();
  const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  f.mealRequest = false;
  f.mealNagTs = 0;
  f.lastMealFedDate = today;
  state.stats.intimacy = (state.stats.intimacy || 0) + 2;
  saveState();
  broadcastFeedState();
  if (petWin) petWin.webContents.send('pet-say', { action: 'eat', text: '猫粮好吃~ 主人也要好好吃饭哦！', mood: 'happy' });
  notify('🍚 喂饭完成', '猫咪吃饱啦，主人也别忘了自己的饭~');
  return publicState();
});

// 贪睡：把所有周期提醒顺延 N 分钟
ipcMain.on('snooze', (e, minutes) => {
  const ms = (parseInt(minutes, 10) || 10) * 60 * 1000;
  const now = Date.now();
  if (state.water.enabled) state.water.lastRemindTs = now + ms - state.water.intervalMin * 60 * 1000;
  if (state.sit.enabled) state.sit.lastRemindTs = now + ms - state.sit.intervalMin * 60 * 1000;
  if (state.feed) { state.feed.waterRequest = false; state.feed.mealRequest = false; }
  saveState();
  broadcastFeedState();
  petSay(`好的，${parseInt(minutes, 10) || 10} 分钟后再提醒~`, 'normal');
});

// 桌宠点击穿透控制：鼠标在宠物上时可交互，否则穿透
ipcMain.on('set-ignore-mouse', (e, ignore) => {
  if (petWin) petWin.setIgnoreMouseEvents(ignore, { forward: true });
});

// 手动拖拽桌宠窗口（比 -webkit-app-region 更可靠，且不受穿透影响）
ipcMain.handle('get-win-pos', () => {
  if (!petWin) return { x: 0, y: 0 };
  const [x, y] = petWin.getPosition();
  return { x, y };
});
ipcMain.on('set-win-pos', (e, x, y) => {
  if (!petWin) return;
  const [w, h] = petWin.getSize();
  const disp = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const b = disp.workArea;
  const cx = Math.max(b.x, Math.min(Math.round(x), b.x + b.width - w));
  const cy = Math.max(b.y, Math.min(Math.round(y), b.y + b.height - h));
  petWin.setPosition(cx, cy);
});
ipcMain.on('save-win-pos', (e, x, y) => {
  state.petPos = { x: Math.round(x), y: Math.round(y) };
  saveState();
});

ipcMain.on('pet-say', (e, msg) => petSay(msg.text, msg.mood));
ipcMain.on('trigger-action', (e, name) => {
  if (petWin) petWin.webContents.send('pet-say', { action: String(name || '') });
});
ipcMain.on('open-panel', openPanel);

// ---------- 生命周期 ----------
app.whenReady().then(() => {
  createPetWindow();
  createPanelWindow();
  buildTray();
  openPanel(); // 首次启动直接展示功能面板，避免用户找不到入口
  checkReminders();
  setInterval(checkReminders, 20 * 1000); // 每 20 秒检查一次

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

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', (e) => {
  // 保持常驻，不随窗口关闭退出
});

app.on('before-quit', () => { app.isQuitting = true; });

