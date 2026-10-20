const pet = document.getElementById('pet');
const face = pet.querySelector('.pet-face');
const photo = document.getElementById('pet-photo');
const bubble = document.getElementById('bubble');
const menu = document.getElementById('menu');

const FORMS = {
  cat:   { emoji: '🐱', name: '喵喵' },
  robot: { emoji: '🤖', name: '小铁' },
  slime: { emoji: '🟢', name: '咕叽' },
  custom:{ emoji: '🐱', name: '宝贝' }
};

// 不同心情下的脸
const MOOD_FACE = {
  cat:   { normal: '🐱', happy: '😸', alert: '🙀' },
  robot: { normal: '🤖', happy: '🤖', alert: '⚠️' },
  slime: { normal: '🟢', happy: '😄', alert: '🟠' }
};

let currentForm = 'custom';
let bubbleTimer = null;

function applyForm(form) {
  currentForm = form;
  pet.className = `form-${form} mood-normal`;
  if (form === 'custom') {
    loadCustomImage();
  } else if (MOOD_FACE[form]) {
    face.textContent = MOOD_FACE[form].normal;
  }
}

let customIdleUrl = null;
let customWalkUrl = null;
let customActions = {};   // { roll, groom, eat, sleep } -> dataURL

function loadCustomImage() {
  window.api.getCustomFrames().then((frames) => {
    if (!frames) return;
    customIdleUrl = frames.idle;
    customWalkUrl = frames.walk || frames.idle;
    customActions = frames.actions || {};
    if (customIdleUrl) photo.src = customIdleUrl;
  });
}

function setMood(mood) {
  pet.classList.remove('mood-normal', 'mood-happy', 'mood-alert');
  pet.classList.add(`mood-${mood}`);
  if (currentForm !== 'custom') {
    face.textContent = (MOOD_FACE[currentForm] && MOOD_FACE[currentForm][mood]) || (FORMS[currentForm] && FORMS[currentForm].emoji) || '🐱';
  }
}

function say(text, mood = 'normal') {
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  setMood(mood);
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubble.classList.add('hidden');
    setMood('normal');
  }, 4000);
}

// 随机闲聊
const IDLE_LINES = [
  '今天也要加油鸭~',
  '摸摸我会开心哦',
  '记得按时喝水哦 💧',
  '要不要玩个小游戏？',
  '工作再忙也要休息一下~',
  '我一直在陪着你呢'
];
function idleChat() {
  if (Math.random() < 0.5) say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 'happy');
}
setInterval(idleChat, 60 * 1000);

// ---------- 鼠标穿透 + 拖拽 ----------
// 初始穿透，forward:true 让渲染层仍能收到 mousemove 以检测悬停
window.api.setIgnoreMouse(true);
let ignoring = true;
let dragging = false;
let dragStart = null;   // { mx, my, wx, wy }
let moved = false;

function overInteractive(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  return el.closest('#pet') || el.closest('#menu') || el.closest('#bubble');
}

function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  window.api.setIgnoreMouse(v);
}

document.addEventListener('mousemove', (e) => {
  if (dragging) {
    moved = true;
    const nx = dragStart.wx + (e.screenX - dragStart.mx);
    const ny = dragStart.wy + (e.screenY - dragStart.my);
    window.api.setWinPos(nx, ny);
    return;
  }
  // 悬停检测：在宠物/菜单/气泡上时允许交互，否则穿透
  setIgnore(!overInteractive(e.clientX, e.clientY));
});

pet.addEventListener('mousedown', async (e) => {
  if (e.button !== 0) return;
  dragging = true;
  moved = false;
  pet.classList.add('dragging');
  const pos = await window.api.getWinPos();
  dragStart = { mx: e.screenX, my: e.screenY, wx: pos.x, wy: pos.y };
  e.preventDefault();
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove('dragging');
  if (moved) {
    // 记忆位置
    window.api.getWinPos().then((p) => window.api.saveWinPos(p.x, p.y));
  } else {
    // 没有拖动 = 点击互动
    const lines = ['嘿嘿~', '在的在的！', '需要我做点什么吗？', '最喜欢你啦~', '戳我干嘛呀 >_<'];
    say(lines[Math.floor(Math.random() * lines.length)], 'happy');
  }
});

// ---------- 悬浮显示快捷菜单 ----------
pet.addEventListener('mouseenter', () => menu.classList.remove('hidden'));
document.getElementById('stage').addEventListener('mouseleave', () => {
  if (!dragging) menu.classList.add('hidden');
});

// 快捷菜单按钮
menu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'water') {
    window.api.feedWater();
  } else if (act === 'food') {
    window.api.feedFood();
  } else if (act === 'game') {
    window.api.openPanel();
    window.api.petSay({ text: '去控制台找「小游戏」吧~', mood: 'happy' });
  } else if (act === 'panel') {
    window.api.openPanel();
  }
});

// ---------- 喂食请求徽标 ----------
const feedBadge = document.getElementById('feed-badge');
function renderFeedBadge(fs) {
  if (!fs) return;
  const waterBtn = feedBadge.querySelector('[data-feed="water"]');
  const foodBtn = feedBadge.querySelector('[data-feed="food"]');
  waterBtn.classList.toggle('hidden', !fs.water);
  foodBtn.classList.toggle('hidden', !fs.meal);
  feedBadge.classList.toggle('hidden', !fs.water && !fs.meal);
}
feedBadge.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.feed === 'water') window.api.feedWater();
  else if (btn.dataset.feed === 'food') window.api.feedFood();
});

// ---------- 来自主进程的事件 ----------
window.api.onFormChanged((form) => applyForm(form));
window.api.onPetSay((msg) => {
  if (!msg) return;
  if (typeof msg.action === 'string') playAction(msg.action);
  if (msg.text) say(msg.text, msg.mood || 'normal');
});
window.api.onCustomImageChanged(() => loadCustomImage());
window.api.onFeedState((fs) => renderFeedBadge(fs));

// 初始化
window.api.getState().then((s) => {
  applyForm(s.form || 'custom');
  renderFeedBadge(s.feed);
});

// ---------- 小范围跑动 + 动作（仅自定义形态） ----------
let home = null;        // 游走的锚点（屏幕坐标）
let cur = null;         // 当前窗口坐标（本地缓存）
let wandering = false;
let acting = false;     // 正在播放动作（打滚/舔毛/吃饭/睡觉）
let wanderTimer = null;
let actTimer = null;

const ACTIONS = {
  roll:  { label: '打个滚~ 看我肚皮！', ms: 3600 },
  groom: { label: '舔舔毛，保持美丽~', ms: 4000 },
  eat:   { label: '干饭时间到！🍚', ms: 4500 },
  sleep: { label: '有点困了…睡会儿 💤', ms: 7000 },
  drink: { label: '咕噜咕噜~ 好喝！', ms: 3200 }
};

async function ensurePos() {
  const p = await window.api.getWinPos();
  if (!home) home = { x: p.x, y: p.y };
  cur = { x: p.x, y: p.y };
}

function setWalkFrame(on) {
  if (on) {
    pet.classList.add('walking');
    if (customWalkUrl) photo.src = customWalkUrl;
  } else {
    pet.classList.remove('walking');
    if (!acting && customIdleUrl) photo.src = customIdleUrl;
  }
}

// 播放一个动作：定格到对应姿势帧 + 冒泡文字 + 维持数秒后回到站立
function playAction(name) {
  const act = ACTIONS[name];
  const url = customActions && customActions[name];
  if (!act || !url || currentForm !== 'custom') return;
  clearTimeout(actTimer);
  wandering = false;
  acting = true;
  pet.classList.remove('walking', 'face-left');
  pet.classList.add('acting', 'act-' + name);
  photo.src = url;
  say(act.label, name === 'sleep' ? 'normal' : 'happy');
  actTimer = setTimeout(() => {
    acting = false;
    pet.classList.remove('acting', 'act-roll', 'act-groom', 'act-eat', 'act-sleep');
    if (customIdleUrl) photo.src = customIdleUrl;
    scheduleWander();
  }, act.ms);
}
// 动作触发统一走上面的 onPetSay 通道（支持 action + text 组合）

function scheduleWander() {
  clearTimeout(wanderTimer);
  const delay = 3500 + Math.random() * 5000;
  wanderTimer = setTimeout(startWander, delay);
}

async function startWander() {
  if (currentForm !== 'custom' || dragging || acting) { scheduleWander(); return; }
  // 一定概率随机做个动作，否则小范围走动
  const names = Object.keys(customActions || {});
  if (names.length && Math.random() < 0.5) {
    playAction(names[Math.floor(Math.random() * names.length)]);
    return;
  }
  await ensurePos();
  // 在锚点附近的小范围内选一个目标
  const target = {
    x: home.x + Math.round((Math.random() * 2 - 1) * 90),
    y: home.y + Math.round((Math.random() * 2 - 1) * 36)
  };
  const dx = target.x - cur.x;
  if (Math.abs(dx) < 6 && Math.abs(target.y - cur.y) < 6) { scheduleWander(); return; }
  pet.classList.toggle('face-left', dx < 0);
  wandering = true;
  setWalkFrame(true);
  stepTo(target);
}

function stepTo(target) {
  if (dragging || currentForm !== 'custom' || acting) { stopWander(); return; }
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) { stopWander(); return; }
  const speed = 1.6;
  cur.x += dx / dist * Math.min(speed, dist);
  cur.y += dy / dist * Math.min(speed, dist);
  window.api.setWinPos(cur.x, cur.y);
  requestAnimationFrame(() => stepTo(target));
}

function stopWander() {
  wandering = false;
  setWalkFrame(false);
  scheduleWander();
}

// 拖拽结束后把锚点更新为新位置，并重新计划游走
window.addEventListener('mouseup', () => {
  setTimeout(async () => {
    const p = await window.api.getWinPos();
    home = { x: p.x, y: p.y };
    cur = { x: p.x, y: p.y };
  }, 60);
});

scheduleWander();
