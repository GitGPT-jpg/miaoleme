const pet = document.getElementById('pet');
const face = pet.querySelector('.pet-face');
const photoA = document.getElementById('pet-photo');
const photoB = document.getElementById('pet-photo-b');
const bubble = document.getElementById('bubble');
const menu = document.getElementById('menu');
const stage = document.getElementById('stage');
const feedBadge = document.getElementById('feed-badge');

const FORMS = {
  cat:   { emoji: '🐱', name: '喵喵' },
  robot: { emoji: '🤖', name: '小铁' },
  slime: { emoji: '🟢', name: '咕叽' },
  custom:{ emoji: '🐱', name: '宝贝' }
};

const MOOD_FACE = {
  cat:   { normal: '🐱', happy: '😸', alert: '🙀' },
  robot: { normal: '🤖', happy: '🤖', alert: '⚠️' },
  slime: { normal: '🟢', happy: '😄', alert: '🟠' }
};

const ACTIONS = {
  roll:  { label: '打个滚~ 看我肚皮！', ms: 3600 },
  groom: { label: '舔舔毛，保持美丽~', ms: 4000 },
  eat:   { label: '干饭时间到！🍚', ms: 4500 },
  sleep: { label: '有点困了…睡会儿 💤', ms: 7000 },
  drink: { label: '咕噜咕噜~ 好喝！', ms: 3300 },
  stretch: { label: '伸个懒腰~', ms: 3200 }
};
const ACT_CLASSES = ['act-roll', 'act-groom', 'act-eat', 'act-sleep', 'act-drink', 'act-stretch'];

// ---------- 行为状态（单一所有权：drag > act > walk > idle） ----------
// mode 是唯一的移动/动作控制权；session 用于让过期的异步回调失效
let currentForm = 'custom';
let mode = 'idle';
let session = 0;
let bubbleTimer = null;
let wanderTimer = null;
let actTimer = null;
let sleepCycleTimer = null;
let walkTimer = null;
let rafId = null;

function bumpSession() { session += 1; return session; }

function clearBehaviorTimers() {
  clearTimeout(wanderTimer); wanderTimer = null;
  clearTimeout(actTimer); actTimer = null;
  clearInterval(sleepCycleTimer); sleepCycleTimer = null;
  clearInterval(walkTimer); walkTimer = null;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function setIdle() {
  clearBehaviorTimers();
  mode = 'idle';
  pet.classList.remove('walking', 'acting', ...ACT_CLASSES);
}

function applyForm(form) {
  currentForm = form;
  bumpSession();
  clearBehaviorTimers();
  mode = 'idle';
  pet.className = `form-${form} mood-normal`;
  if (form === 'custom') {
    loadCustomImage();
  } else if (MOOD_FACE[form]) {
    face.textContent = MOOD_FACE[form].normal;
  }
}

// ---------- 帧集合与双层交叉淡化（最新目标必胜） ----------
let F = { idle: [], walk: [], happy: null, actions: {}, meta: {}, sequences: {}, walkSeq: null };
let visLayer = 'a';
let activeUrl = null;
let fading = false;
let fadeTarget = null;

function runFade(ms = 450) {
  const url = fadeTarget;
  if (!url) { fading = false; return; }
  if (url === activeUrl) { fading = false; return; }
  fading = true;
  const target = visLayer === 'a' ? photoB : photoA;
  const other = visLayer === 'a' ? photoA : photoB;
  const apply = () => {
    target.style.transition = `opacity ${ms}ms ease`;
    other.style.transition = `opacity ${ms}ms ease`;
    target.style.opacity = '1';
    other.style.opacity = '0';
    setTimeout(() => {
      visLayer = visLayer === 'a' ? 'b' : 'a';
      activeUrl = url;
      fading = false;
      target.style.transition = '';
      other.style.transition = '';
      // 追赶期间到达的最新目标（不再丢弃）
      if (fadeTarget && fadeTarget !== activeUrl) runFade(ms);
    }, ms + 20);
  };
  if (target.src && target.src === url) {
    apply();
  } else {
    target.onload = () => { target.onload = null; apply(); };
    target.onerror = () => { target.onerror = null; fading = false; };
    target.src = url;
  }
}

function crossfadeTo(url, ms = 450) {
  if (!url) return;
  fadeTarget = url;
  if (!fading) runFade(ms);
}

function loadCustomImage() {
  const mySession = session;
  window.api.getCustomFrames().then((frames) => {
    if (!frames || mySession !== session) return; // 形态/图片已切换，丢弃过期结果
    F = {
      idle: [frames.idle, frames.idleAlt || frames.idle],
      walk: [frames.walk || frames.idle, frames.walkAlt || frames.walk || frames.idle],
      happy: frames.happy || frames.idle,
      actions: frames.actions || {},
      meta: frames.meta || {},
      sequences: frames.sequences || {},
      walkSeq: frames.walkSeq || null
    };
    if (F.idle[0]) {
      photoA.src = F.idle[0];
      photoA.style.opacity = '1';
      photoB.style.opacity = '0';
      activeUrl = F.idle[0];
      visLayer = 'a';
      fading = false;
      fadeTarget = F.idle[0];
    }
    setIdle();
    scheduleWander();
  });
}

// 站立呼吸：在站立/坐姿之间缓缓交替（仅 idle 时）
let idleTick = 0;
setInterval(() => {
  if (currentForm !== 'custom' || mode !== 'idle' || F.idle.length < 2) return;
  idleTick = (idleTick + 1) % 2;
  crossfadeTo(F.idle[idleTick], 1200);
}, 4200);

function setMood(mood) {
  pet.classList.remove('mood-normal', 'mood-happy', 'mood-alert');
  pet.classList.add(`mood-${mood}`);
  if (currentForm !== 'custom') {
    face.textContent = (MOOD_FACE[currentForm] && MOOD_FACE[currentForm][mood]) || (FORMS[currentForm] && FORMS[currentForm].emoji) || '🐱';
    return;
  }
  if (mode !== 'idle') return;
  if (mood === 'happy' && F.happy) crossfadeTo(F.happy, 350);
  else if (mood === 'normal' && F.idle.length) crossfadeTo(F.idle[0], 350);
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

// 随机闲聊（不打断动作/拖拽）
const IDLE_LINES = [
  '今天也要加油鸭~',
  '摸摸我会开心哦',
  '记得按时喝水哦 💧',
  '要不要玩个小游戏？',
  '工作再忙也要休息一下~',
  '我一直在陪着你呢'
];
let quiet = false;
setInterval(() => {
  if (quiet || mode !== 'idle' || dragging()) return;
  if (Math.random() < 0.5) say(IDLE_LINES[Math.floor(Math.random() * IDLE_LINES.length)], 'happy');
}, 60 * 1000);

// ---------- 鼠标穿透 + 拖拽 ----------
window.api.setIgnoreMouse(true);
let ignoring = true;
let drag = null;   // { ready, moved, mx, my, wx, wy }
let cur = null;    // 最近的窗口坐标
let home = null;   // 游走锚点

function dragging() { return mode === 'drag'; }

function overInteractive(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  return el.closest('#pet') || el.closest('#menu') || el.closest('#bubble') || el.closest('#feed-badge');
}

function setIgnore(v) {
  if (v === ignoring) return;
  ignoring = v;
  window.api.setIgnoreMouse(v);
}

function beginDrag(e) {
  if (e.button !== 0 || drag) return;
  e.preventDefault();
  const mySession = session;
  drag = { ready: false, moved: false, mx: e.screenX, my: e.screenY, wx: 0, wy: 0 };
  mode = 'drag';
  clearBehaviorTimers();
  pet.classList.remove('walking');
  pet.classList.add('dragging');
  window.api.getWinPos().then((p) => {
    // 过期初始化：拖拽已结束或形态已切换 → 丢弃
    if (!drag || session !== mySession) return;
    drag.wx = p.x; drag.wy = p.y; drag.ready = true;
    cur = { x: p.x, y: p.y };
  });
}

function endDrag() {
  if (!drag) return;
  const d = drag;
  drag = null;
  pet.classList.remove('dragging');
  mode = 'idle';
  if (d.moved && d.ready) {
    window.api.getWinPos().then((p) => {
      cur = { x: p.x, y: p.y };
      home = { x: p.x, y: p.y };
      window.api.saveWinPos(p.x, p.y);
      scheduleWander();
    });
  } else {
    const lines = ['嘿嘿~', '在的在的！', '需要我做点什么吗？', '最喜欢你啦~', '戳我干嘛呀 >_<'];
    say(lines[Math.floor(Math.random() * lines.length)], 'happy');
    scheduleWander();
  }
}

pet.addEventListener('mousedown', beginDrag);
document.addEventListener('mousemove', (e) => {
  if (drag) {
    if (!drag.ready) return; // 锚点尚未就绪，等 ready 后一次性追上位移
    const nx = drag.wx + (e.screenX - drag.mx);
    const ny = drag.wy + (e.screenY - drag.my);
    if (Math.abs(nx - drag.wx) + Math.abs(ny - drag.wy) > 2) drag.moved = true;
    cur = { x: nx, y: ny };
    window.api.setWinPos(nx, ny);
    return;
  }
  setIgnore(!overInteractive(e.clientX, e.clientY));
});
window.addEventListener('mouseup', endDrag);
window.addEventListener('blur', endDrag);
document.addEventListener('visibilitychange', () => { if (document.hidden) endDrag(); });

// ---------- 悬浮菜单 / 徽标 ----------
pet.addEventListener('mouseenter', () => menu.classList.remove('hidden'));
stage.addEventListener('mouseleave', () => { if (!dragging()) menu.classList.add('hidden'); });

menu.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'water') window.api.feedWater();
  else if (act === 'food') window.api.feedFood();
  else if (act === 'game') {
    window.api.openPanel();
    window.api.petSay({ text: '去控制台找「小游戏」吧~', mood: 'happy' });
  } else if (act === 'panel') window.api.openPanel();
});

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

// ---------- 动作 / 走路 / 游走 ----------
async function ensurePos() {
  const p = await window.api.getWinPos();
  if (!home) home = { x: p.x, y: p.y };
  cur = { x: p.x, y: p.y };
}

function setWalkFrame(on) {
  clearInterval(walkTimer);
  walkTimer = null;
  if (on) {
    pet.classList.add('walking');
    const seq = (F.walkSeq && F.walkSeq.frames && F.walkSeq.frames.length > 1) ? F.walkSeq.frames : F.walk;
    const frameMs = (F.walkSeq && F.walkSeq.frameMs) || 260;
    const fadeMs = (F.walkSeq && F.walkSeq.fadeMs) || 140;
    let tick = 0;
    if (seq.length) crossfadeTo(seq[0], fadeMs);
    walkTimer = setInterval(() => {
      if (seq.length < 2) return;
      tick = (tick + 1) % seq.length;
      crossfadeTo(seq[tick], fadeMs);
    }, frameMs);
  } else {
    pet.classList.remove('walking');
  }
}

function playAction(name) {
  const act = ACTIONS[name];
  const seq = F.sequences && F.sequences[name];
  const url = (F.actions && F.actions[name]) || (seq && seq.frames && seq.frames[0]);
  if (!act || !url || currentForm !== 'custom' || mode === 'drag') return;
  const mySession = bumpSession();   // 任何新动作使旧的结束回调失效
  clearBehaviorTimers();
  mode = 'act';
  pet.classList.remove('walking', 'face-left', ...ACT_CLASSES);
  pet.classList.add('acting', 'act-' + name);
  if (seq && seq.frames && seq.frames.length > 1) {
    let tick = 0;
    crossfadeTo(seq.frames[0], seq.fadeMs || 220);
    sleepCycleTimer = setInterval(() => {
      tick = (tick + 1) % seq.frames.length;
      crossfadeTo(seq.frames[tick], seq.fadeMs || 220);
    }, seq.frameMs || 700);
  } else {
    crossfadeTo(url, 400);
  }
  say(act.label, name === 'sleep' ? 'normal' : 'happy');
  actTimer = setTimeout(() => {
    if (session !== mySession) return;   // 已被新动作/形态切换取代
    setIdle();
    if (F.idle.length) crossfadeTo(F.idle[0], 450);
    scheduleWander();
  }, act.ms);
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(startWander, 3500 + Math.random() * 5000);
}

async function startWander() {
  if (currentForm !== 'custom' || mode !== 'idle') { scheduleWander(); return; }
  const names = Object.keys(ACTIONS).filter((n) => (F.sequences && F.sequences[n]) || (F.actions && F.actions[n]));
  if (names.length && Math.random() < 0.5) {
    playAction(names[Math.floor(Math.random() * names.length)]);
    return;
  }
  const mySession = session;
  await ensurePos();
  if (session !== mySession || mode !== 'idle') return;  // 等待期间被拖拽/动作打断
  const target = {
    x: home.x + Math.round((Math.random() * 2 - 1) * 90),
    y: home.y + Math.round((Math.random() * 2 - 1) * 36)
  };
  const dx = target.x - cur.x;
  if (Math.abs(dx) < 6 && Math.abs(target.y - cur.y) < 6) { scheduleWander(); return; }
  pet.classList.toggle('face-left', dx < 0);
  mode = 'walk';
  setWalkFrame(true);
  stepTo(target);
}

let lastMoveAt = 0;
function stepTo(target) {
  if (mode !== 'walk' || drag) { stopWander(); return; }
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) { stopWander(); return; }
  const speed = 1.6;
  cur.x += (dx / dist) * Math.min(speed, dist);
  cur.y += (dy / dist) * Math.min(speed, dist);
  // 位置 IPC 限流到 ~30Hz：视觉依旧平滑，跨进程调用减半
  const t = performance.now();
  if (t - lastMoveAt >= 33) {
    lastMoveAt = t;
    window.api.setWinPos(Math.round(cur.x), Math.round(cur.y));
  }
  rafId = requestAnimationFrame(() => stepTo(target));
}

function stopWander() {
  if (mode === 'walk') mode = 'idle';
  clearInterval(walkTimer); walkTimer = null;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  pet.classList.remove('walking');
  if (currentForm === 'custom' && F.idle.length) crossfadeTo(F.idle[0], 350);
  scheduleWander();
}

// ---------- 来自主进程的事件 ----------
window.api.onFormChanged((form) => applyForm(form));
window.api.onPetSay((msg) => {
  if (!msg) return;
  if (typeof msg.action === 'string') playAction(msg.action);
  if (msg.text) say(msg.text, msg.mood || 'normal');
});
window.api.onCustomImageChanged(() => {
  bumpSession();
  setIdle();
  loadCustomImage();
});
window.api.onFeedState((fs) => renderFeedBadge(fs));

// 初始化
window.api.getState().then((s) => {
  quiet = !!s.quiet;
  applyForm(s.form || 'custom');
  renderFeedBadge(s.feed);
});
window.api.onStateUpdated((s) => { quiet = !!s.quiet; });
scheduleWander();
