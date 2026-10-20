const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- 数据持久化 ----------
const STORE_FILE = path.join(app.getPath('userData'), 'zerobreak-store.json');

const DEFAULT_STATE = {
  form: 'custom',         // cat | robot | slime | custom（自定义图片）
  customImage: null,      // 用户上传的自定义图片绝对路径（为空则用内置猫咪）
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

function customImagePath() {
  if (state.customImage && fs.existsSync(state.customImage)) return state.customImage;
  if (fs.existsSync(BUNDLED_IDLE)) return BUNDLED_IDLE;
  return null;
}

function customImageDataUrl() {
  return fileToDataUrl(customImagePath());
}

// 返回 { idle, walk } 两帧：用户自定义单图时 walk=idle；默认内置 3D 猫有独立行走帧
function customFrames() {
  if (state.customImage && fs.existsSync(state.customImage)) {
    const u = fileToDataUrl(state.customImage);
    return { idle: u, walk: u };
  }
  return { idle: fileToDataUrl(BUNDLED_IDLE), walk: fileToDataUrl(BUNDLED_WALK) || fileToDataUrl(BUNDLED_IDLE) };
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
  // 使用真实图标，否则菜单栏看不到、无法点击
  let icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
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

  // 喝水提醒
  if (state.water.enabled) {
    const intervalMs = state.water.intervalMin * 60 * 1000;
    if (!state.water.lastRemindTs) state.water.lastRemindTs = now;
    if (now - state.water.lastRemindTs >= intervalMs) {
      state.water.lastRemindTs = now;
      saveState();
      notify('💧 该喝水啦', '起来动一动，补充点水分吧~');
      petSay('该喝水啦，咕噜咕噜~', 'happy');
    }
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
    state.form = 'custom';
    saveState();
    refreshTrayMenu();
    const url = customImageDataUrl();
    if (petWin) { petWin.webContents.send('form-changed', 'custom'); petWin.webContents.send('custom-image-changed', url); }
    if (panelWin) panelWin.webContents.send('state-updated', publicState());
    return { ok: true, dataUrl: url };
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

// 贪睡：把所有周期提醒顺延 N 分钟
ipcMain.on('snooze', (e, minutes) => {
  const ms = (parseInt(minutes, 10) || 10) * 60 * 1000;
  const now = Date.now();
  if (state.water.enabled) state.water.lastRemindTs = now + ms - state.water.intervalMin * 60 * 1000;
  if (state.sit.enabled) state.sit.lastRemindTs = now + ms - state.sit.intervalMin * 60 * 1000;
  saveState();
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

