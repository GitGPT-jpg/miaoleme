const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------- 数据持久化 ----------
const STORE_FILE = path.join(app.getPath('userData'), 'zerobreak-store.json');

const DEFAULT_STATE = {
  form: 'cat',            // cat | robot | slime
  water: {
    enabled: true,
    intervalMin: 45,      // 每隔多少分钟提醒喝水
    lastRemindTs: 0
  },
  meetings: [],           // { id, title, ts }  ts=毫秒时间戳
  ddls: [],               // { id, title, ts }
  notifiedMeetings: [],   // 已提醒过的会议 id
  notifiedDdls: [],       // 已提醒过的 ddl id
  petPos: null            // 桌宠窗口位置 { x, y }
};

function loadState() {
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    return Object.assign({}, DEFAULT_STATE, JSON.parse(raw));
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (e) {
    console.error('保存失败', e);
  }
}

let state = loadState();

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
  const pos = (state.petPos && typeof state.petPos.x === 'number')
    ? state.petPos
    : { x: width - winW - 20, y: height - winH - 20 };
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
  const formLabel = { cat: '🐱 猫', robot: '🤖 机器人', slime: '🟢 史莱姆' };
  const menu = Menu.buildFromTemplate([
    { label: '打开控制台', click: openPanel },
    { type: 'separator' },
    {
      label: '切换形态',
      submenu: ['cat', 'robot', 'slime'].map((f) => ({
        label: formLabel[f],
        type: 'radio',
        checked: state.form === f,
        click: () => setForm(f)
      }))
    },
    { label: '喂它喝水 💧', click: () => petSay('咕噜咕噜~ 谢谢主人！', 'happy') },
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
  if (petWin) petWin.webContents.send('form-changed', form);
  if (panelWin) panelWin.webContents.send('state-updated', publicState());
}

function petSay(text, mood = 'normal') {
  if (petWin) petWin.webContents.send('pet-say', { text, mood });
}

function notify(title, body) {
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

// ---------- 对外状态（给面板用） ----------
function publicState() {
  return {
    form: state.form,
    water: state.water,
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
  if (petWin) petWin.setPosition(Math.round(x), Math.round(y));
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
});

app.on('window-all-closed', (e) => {
  // 保持常驻，不随窗口关闭退出
});

app.on('before-quit', () => { app.isQuitting = true; });

