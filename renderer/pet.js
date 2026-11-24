const pet = document.getElementById('pet');
const face = pet.querySelector('.pet-face');
const photoA = document.getElementById('pet-photo');
const photoB = document.getElementById('pet-photo-b');
const bubble = document.getElementById('bubble');
const menu = document.getElementById('menu');
const stage = document.getElementById('stage');

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

// ---------- 行为状态（单一所有权：drag > act > run > walk > idle） ----------
// mode 是唯一的移动/动作控制权；session 用于让过期的异步回调失效
let currentForm = 'custom';
let displayMode = 'photo';
let mode = 'idle';
let session = 0;
let bubbleTimer = null;
let wanderTimer = null;
let actTimer = null;
let sleepCycleTimer = null;
let walkTimer = null;
let runTimer = null;
let moveLast = 0;        // 上一帧位移时间戳（走路/奔跑共用，两者互斥）
let rafId = null;
let rigCanvas = document.getElementById('rig-canvas');
let rctx = rigCanvas.getContext('2d');
let rig = null;
let rigOn = false;
let rigRAF = null;

function bumpSession() { session += 1; return session; }

function clearBehaviorTimers() {
  clearTimeout(wanderTimer); wanderTimer = null;
  clearTimeout(actTimer); actTimer = null;
  clearInterval(sleepCycleTimer); sleepCycleTimer = null;
  clearInterval(walkTimer); walkTimer = null;
  clearInterval(runTimer); runTimer = null;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function setIdle() {
  clearBehaviorTimers();
  mode = 'idle';
  pet.classList.remove('walking', 'running', 'run-seq', 'acting', ...ACT_CLASSES);
}

function applyForm(form) {
  currentForm = form;
  disableRig();
  bumpSession();
  clearBehaviorTimers();
  mode = 'idle';
  pet.className = `form-${form} mood-normal`;
  if (form === 'custom') {
    loadCustomImage();
    if (displayMode === 'rig') loadRig();
    else { disableRig(); pet.classList.add('photo-real'); }
  } else if (MOOD_FACE[form]) {
    face.textContent = MOOD_FACE[form].normal;
  }
}

// ---------- 帧集合与双层交叉淡化（最新目标必胜） ----------
let F = { idle: [], walk: [], happy: null, actions: {}, meta: {}, sequences: {}, walkSeq: null, runSeq: null };
let visLayer = 'a';
let activeUrl = null;
let fading = false;
let fadeTarget = null;
// 淡化代数：每次开始淡化或硬切都自增，未完成的淡化回调据此作废。
// 没有它的话，「停跑（开始淡化回站立）→ 立刻又起跑」会让那次旧淡化的定时器
// 在几百毫秒后仍翻转图层，并把 fadeTarget（跑步帧）当成新目标再拉一次 320ms 淡化
// —— 跑动中画面被糊一层，甚至短暂退回站立帧。
let fadeGen = 0;

function runFade(ms = 450) {
  const url = fadeTarget;
  if (!url) { fading = false; return; }
  if (url === activeUrl) { fading = false; return; }
  fading = true;
  const gen = ++fadeGen;
  const target = visLayer === 'a' ? photoB : photoA;
  const other = visLayer === 'a' ? photoA : photoB;
  const apply = () => {
    if (gen !== fadeGen) return;        // 期间被硬切/新淡化取代
    target.style.transition = `opacity ${ms}ms ease`;
    other.style.transition = `opacity ${ms}ms ease`;
    target.style.opacity = '1';
    other.style.opacity = '0';
    setTimeout(() => {
      if (gen !== fadeGen) return;      // 淡化途中被硬切：图层归属不再由这次淡化决定
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

// 硬切：奔跑帧间隔只有 70–90ms，交叉淡化会糊成一团，直接换可见层的图
function hardCutTo(url) {
  if (!url) return;
  fadeGen++;                       // 作废所有未完成的淡化（否则它们几百毫秒后会把画面拉回旧目标）
  photoA.onload = null; photoA.onerror = null;
  photoB.onload = null; photoB.onerror = null;
  const vis = visLayer === 'a' ? photoA : photoB;
  const other = visLayer === 'a' ? photoB : photoA;
  vis.style.transition = 'none';
  other.style.transition = 'none';
  vis.style.opacity = '1';
  other.style.opacity = '0';
  if (vis.src !== url) vis.src = url;
  activeUrl = url;
  fadeTarget = url;
  fading = false;
}

// 奔跑帧预解码：首个循环不闪白（data URL 已在内存，解码一次即可）
let preloadedRun = [];
function preloadRunFrames(seq) {
  preloadedRun = [];
  if (!seq || !Array.isArray(seq.frames)) return;
  seq.frames.forEach((u) => {
    if (!u) return;
    const im = new Image();
    im.src = u;
    preloadedRun.push(im);
  });
}

function loadCustomImage() {
  const mySession = session;
  window.api.getCustomFrames().then((frames) => {
    if (!frames || mySession !== session) return; // 形态/图片已切换，丢弃过期结果
    pet.classList.toggle('raw-photo', !frames.generated);
    F = {
      idle: [frames.idle, frames.idleAlt || frames.idle],
      walk: [frames.walk || frames.idle, frames.walkAlt || frames.walk || frames.idle],
      happy: frames.happy || frames.idle,
      actions: frames.actions || {},
      meta: frames.meta || {},
      sequences: frames.sequences || {},
      walkSeq: frames.walkSeq || null,
      runSeq: frames.runSeq || null
    };
    preloadRunFrames(F.runSeq);
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
  if (rigOn || currentForm !== 'custom' || mode !== 'idle' || F.idle.length < 2) return;
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
  if (rigOn || mode !== 'idle') return;
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
  const lines = vibeOn ? VIBE_LINES : IDLE_LINES;
  if (Math.random() < 0.5) say(lines[Math.floor(Math.random() * lines.length)], 'happy');
}, 60 * 1000);

// ---------- 2D 骨骼（内置猫：尾→身→头 层级变换，持续动画） ----------
function loadRig() {
  window.api.getRigParts().then((res) => {
    if (!res || !res.usable) { disableRig(); return; }
    const load = (u) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = u;
    });
    Promise.all([load(res.parts.body), load(res.parts.head), load(res.parts.tail), load(res.parts.blink), load(res.parts.ears)]).then(([b, h, t, blink, ears]) => {
      if (!b || !h || !t) { disableRig(); return; }
      rig = { body: b, head: h, tail: t, blink: blink || null, ears: ears || null };
      enableRig();
    });
  });
}

function enableRig() {
  if (displayMode === 'photo') return;
  console.log('[rig] enabled');
  rigOn = true;
  pet.classList.add('rig-on');
  startRig();
}

function disableRig() {
  console.log('[rig] disabled');
  rigOn = false;
  pet.classList.remove('rig-on');
  if (rigRAF) { cancelAnimationFrame(rigRAF); rigRAF = null; }
}

let rigLastDraw = 0;
function startRig() {
  if (rigRAF) cancelAnimationFrame(rigRAF);
  const loop = (now) => {
    if (!rigOn || !rig) return;
    // 限流 ~30fps：桌宠尺寸小，30fps 视觉足够，省电
    if (now - rigLastDraw >= 32) {
      rigLastDraw = now;
      drawRig(now / 1000);
    }
    rigRAF = requestAnimationFrame(loop);
  };
  rigRAF = requestAnimationFrame(loop);
}

// 参数为可调常量：先用近似值，再按截图微调
const RIG = {
  body: { cx: 222, cy: 300, w: 330, h: 205 },
  head: { nx: 336, ny: 196, w: 190, h: 190 },
  tail: { rx: 132, ry: 296, w: 150, h: 170, base: 0.32 }
};

let gaze = { x: 0, y: 0 };
let lastRigT = 0;
let tailSpring = { x: 0.32, v: 0 };
let saccade = { until: 0, nextAt: 0, dx: 0, dy: 0 };
let gazeTarget = { x: 0, y: 0 };

window.api.onDisplayModeChanged((m) => {
  displayMode = m === 'rig' ? 'rig' : 'photo';
  if (displayMode === 'rig') {
    pet.classList.remove('photo-real');
    loadRig();
  } else {
    disableRig();
    pet.classList.add('photo-real');
  }
});

window.api.onCursor((p) => {
  gazeTarget = GazeMath.gazeFromOffset(p.x, p.y, 600);
});

let nextBlinkAt = 0;
let blinkUntil = 0;
let nextEarAt = 0;
let earUntil = 0;

function pickHead(t) {
  if (t > nextBlinkAt) {
    blinkUntil = t + 0.14;
    nextBlinkAt = t + 3 + Math.random() * 3;
  }
  if (t > nextEarAt) {
    earUntil = t + 0.8;
    nextEarAt = t + 8 + Math.random() * 7;
  }
  if (rig.blink && t < blinkUntil) return rig.blink;
  if (rig.ears && t < earUntil) return rig.ears;
  return rig.head;
}

function drawHeadWarped(img, cx, cy, w, h, rot, offsets) {
  const bands = offsets.length;
  const srcH = img.height / bands;
  const dstH = h / bands;
  rctx.save();
  rctx.translate(cx, cy);
  rctx.rotate(rot);
  for (let i = 0; i < bands; i++) {
    const o = offsets[i];
    const sy = i * srcH;
    const sh = Math.min(srcH + 2, img.height - sy);
    rctx.save();
    rctx.translate(o.x, o.y);
    rctx.drawImage(img, 0, sy, img.width, sh, -w / 2, -h + i * dstH, w, dstH + 2);
    rctx.restore();
  }
  rctx.restore();
}

function drawRig(t) {
  const W = rigCanvas.width, H = rigCanvas.height;
  rctx.clearRect(0, 0, W, H);
  // 视线跟随（指数平滑，避免瞬移）
  gaze.x = GazeMath.smooth(gaze.x, gazeTarget.x, 0.07);
  gaze.y = GazeMath.smooth(gaze.y, gazeTarget.y, 0.07);
  const dt = lastRigT ? Math.min(0.05, Math.max(0.008, t - lastRigT)) : 0.016;
  lastRigT = t;
  // 瞳孔微动（saccade）：随机小幅跳跃
  if (t > saccade.nextAt) saccade = WarpMath.nextSaccade(t);
  const sacc = t < saccade.until ? saccade : { dx: 0, dy: 0 };
  const running = mode === 'run';
  const walking = mode === 'walk' || running;   // 奔跑也是迈步，只是更快
  const acting = mode === 'act';
  const gait = running ? 1.8 : 1;               // 奔跑：步频与起伏都更大
  const bobHz = walking ? 5.5 * gait : 1.3;
  const bobAmp = walking ? (running ? 9 : 7) : 3;
  const bob = Math.sin(t * bobHz) * bobAmp;
  const breath = 1 + (Math.sin(t * 1.15) * 0.014 + Math.sin(t * 0.43 + 1.2) * 0.008);
  const sway = Math.sin(t * (walking ? 4.2 * gait : 0.8)) * (walking ? 2.4 : 1.1) + gaze.x * 2;

  // 尾巴（底层，绕根部摆动）
  const tailTarget = RIG.tail.base
    + Math.sin(t * (walking ? 4.8 * gait : 1.05)) * (walking ? 0.3 : 0.17)
    + gaze.x * 0.12;
  tailSpring = WarpMath.stepSpring(tailSpring, tailTarget, dt, walking ? 180 : 90, 14);
  rctx.save();
  rctx.translate(RIG.tail.rx, RIG.tail.ry);
  rctx.rotate(tailSpring.x);
  rctx.drawImage(rig.tail, -32, -RIG.tail.h + 24, RIG.tail.w, RIG.tail.h);
  rctx.restore();

  // 身体（呼吸 + 摇摆 + 上下起伏）
  rctx.save();
  rctx.translate(RIG.body.cx, RIG.body.cy + bob);
  rctx.rotate(sway * 0.006);
  rctx.scale(1, breath);
  rctx.drawImage(rig.body, -RIG.body.w / 2, -RIG.body.h, RIG.body.w, RIG.body.h);
  rctx.restore();

  // 头（颈部锚点：点头 + 倾斜 + 跟随呼吸）
  rctx.save();
  rctx.translate(
    RIG.head.nx + sway * 0.5 + gaze.x * (walking ? 8 : 16),
    RIG.head.ny + bob * 0.85 + gaze.y * (walking ? 5 : 10)
  );
  rctx.rotate(
    Math.sin(t * (walking ? 3.6 : 0.75)) * (walking ? 0.055 : 0.028) + gaze.x * 0.08
  );
  rctx.translate(0, Math.sin(t * (walking ? 5.2 * gait : 1.4)) * (walking ? 5 : 2.4));
  if (acting) rctx.rotate(Math.sin(t * 2.4) * 0.02);
  // 头部 2×2 网格 warp：跟随视线轻微变形，让头部显得「活」
  // drawHeadWarped 顶部对齐 -h，补 0.18h 保持与原 drawImage(-h*0.82) 锚点一致
  drawHeadWarped(pickHead(t), 0, RIG.head.h * 0.18, RIG.head.w, RIG.head.h, 0, WarpMath.bandOffsets(gaze.x, gaze.y));
  rctx.restore();
}

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
  return el.closest('#pet') || el.closest('#menu') || el.closest('#bubble');
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
  pet.classList.remove('walking', 'running', 'run-seq');
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  endDrag();
  // 窗口被遮挡/切到别的 Space 时浏览器会冻结计时器与 rAF：
  // 奔跑留在半途会让猫下次露面时定格在跑步帧，这里直接收尾回站立。
  if (mode === 'run') stopRun();
});

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
  const waterBtn = menu.querySelector('[data-act="water"]');
  const foodBtn = menu.querySelector('[data-act="food"]');
  if (waterBtn) waterBtn.classList.toggle('has-request', !!fs.water);
  if (foodBtn) foodBtn.classList.toggle('has-request', !!fs.meal);
}

// ---------- 动作 / 走路 / 游走 ----------
async function ensurePos() {
  const p = await window.api.getWinPos();
  if (!home) home = { x: p.x, y: p.y };
  cur = { x: p.x, y: p.y };
}

function setWalkFrame(on) {
  clearInterval(walkTimer);
  walkTimer = null;
  if (rigOn) { pet.classList.toggle('walking', on); return; }
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

// ---------- 奔跑：真帧序列硬切轮播 + 90px/s 横向位移 ----------
// 腿部交替与身体收拢/伸展全在帧里，所以 CSS 侧不再叠加缩放模拟（见 .run-seq）
function setRunFrame(on) {
  clearInterval(runTimer);
  runTimer = null;
  if (rigOn) { pet.classList.toggle('running', on); return; }
  if (!on) { pet.classList.remove('running', 'run-seq'); return; }
  const walkFrames = (F.walkSeq && F.walkSeq.frames && F.walkSeq.frames.length > 1) ? F.walkSeq.frames : F.walk;
  const { frames, frameMs, real } = RunMath.pickRunFrames(F.runSeq, walkFrames);
  pet.classList.add('running');
  pet.classList.toggle('run-seq', real);
  if (!frames.length) return;
  const start = performance.now();
  hardCutTo(frames[0]);
  runTimer = setInterval(() => {
    if (frames.length < 2) return;
    hardCutTo(frames[RunMath.runFrameIndex(performance.now() - start, frameMs, frames.length)]);
  }, frameMs);
}

// 冲刺目标：优先朝屏幕中间跑，并把落点夹进可见工作区——
// 主进程会把窗口夹回工作区，目标跑到屏幕外的话猫会在边上原地踏步到冲刺结束。
// 多屏下 availLeft 才是当前屏幕在全局坐标里的左边界，直接用 availWidth 会把副屏算错。
function runTargetX(fromX) {
  const dist = 150 + Math.random() * 120;
  const sc = window.screen || {};
  const left = (Number.isFinite(sc.availLeft) ? sc.availLeft : 0) + 20;
  const right = left + (sc.availWidth || 1440) - 280;
  let dir = Math.random() < 0.5 ? -1 : 1;
  if (fromX + dist > right) dir = -1;
  else if (fromX - dist < left) dir = 1;
  const target = fromX + dir * dist;
  return Math.round(Math.max(left, Math.min(right, target)));
}

function startRunDash() {
  if (currentForm !== 'custom' || mode !== 'idle' || !cur) { scheduleWander(); return; }
  const targetX = runTargetX(cur.x);
  pet.classList.toggle('face-left', targetX < cur.x);   // 向左跑：scaleX(-1)
  mode = 'run';
  setRunFrame(true);
  moveLast = performance.now();
  stepRun({ x: targetX, y: cur.y });
}

function stepRun(target) {
  if (mode !== 'run' || drag) { stopRun(); return; }
  const now = performance.now();
  const dt = (now - moveLast) / 1000;
  moveLast = now;
  const dx = target.x - cur.x;
  if (Math.abs(dx) < 2) { stopRun(); return; }
  cur.x += Math.sign(dx) * Math.min(RunMath.runStep(dt), Math.abs(dx));
  if (now - lastMoveAt >= 33) {
    lastMoveAt = now;
    window.api.setWinPos(Math.round(cur.x), Math.round(cur.y));
  }
  rafId = requestAnimationFrame(() => stepRun(target));
}

function stopRun() {
  if (mode === 'run') mode = 'idle';
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  clearInterval(runTimer);
  runTimer = null;
  if (!rigOn && currentForm === 'custom' && F.idle.length) {
    // 先淡回站立帧，等淡完再摘掉 .running：奔跑展示框比站立宽，
    // 立刻摘掉会在淡化中途把跑步帧缩一下，看着像抽一下
    crossfadeTo(F.idle[0], 320);
    setTimeout(() => { if (mode !== 'run') setRunFrame(false); }, 340);
  } else {
    setRunFrame(false);
  }
  scheduleWander();
}

// 外部触发（面板「跑一段」/演示钩子）：位置就绪后立刻冲刺
async function runOnDemand() {
  if (currentForm !== 'custom' || mode === 'drag' || mode === 'run') return;
  const mySession = bumpSession();
  clearBehaviorTimers();
  mode = 'idle';
  pet.classList.remove('acting', ...ACT_CLASSES);
  await ensurePos();
  if (session !== mySession || mode !== 'idle') return;
  startRunDash();
}

function playAction(name) {
  const act = ACTIONS[name];
  const seq = F.sequences && F.sequences[name];
  const url = (F.actions && F.actions[name]) || (seq && seq.frames && seq.frames[0]);
  if (!act || !url || currentForm !== 'custom' || mode === 'drag') return;
  const mySession = bumpSession();   // 任何新动作使旧的结束回调失效
  clearBehaviorTimers();
  mode = 'act';
  if (rigOn) { disableRig(); }   // 动作使用序列帧
  pet.classList.remove('walking', 'running', 'run-seq', 'face-left', ...ACT_CLASSES);
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
    if (rig) enableRig();          // 动作结束恢复骨骼常动
    scheduleWander();
  }, act.ms);
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  wanderTimer = setTimeout(startWander, 3500 + Math.random() * 5000);
}

async function startWander() {
  if (currentForm !== 'custom' || mode !== 'idle' || vibeOn) { scheduleWander(); return; }
  const names = displayMode === 'photo' ? [] : Object.keys(ACTIONS).filter((n) => (F.sequences && F.sequences[n]) || (F.actions && F.actions[n]));
  if (names.length && Math.random() < 0.5) {
    playAction(names[Math.floor(Math.random() * names.length)]);
    return;
  }
  const mySession = session;
  await ensurePos();
  if (session !== mySession || mode !== 'idle') return;  // 等待期间被拖拽/动作打断
  // 偶尔跑一段：有真跑步帧时概率更高（腿部交替是看点），没有则是走路帧加速的兜底
  const hasRunSeq = !!(F.runSeq && F.runSeq.frames && F.runSeq.frames.length >= 2);
  if (Math.random() < (hasRunSeq ? 0.35 : 0.12)) { startRunDash(); return; }
  const target = {
    x: home.x + Math.round((Math.random() * 2 - 1) * 90),
    y: home.y + Math.round((Math.random() * 2 - 1) * 36)
  };
  const dx = target.x - cur.x;
  if (Math.abs(dx) < 6 && Math.abs(target.y - cur.y) < 6) { scheduleWander(); return; }
  pet.classList.toggle('face-left', dx < 0);
  mode = 'walk';
  setWalkFrame(true);
  moveLast = performance.now();
  stepTo(target);
}

let lastMoveAt = 0;
const WALK_SPEED = 96;   // px/s：原先是每帧 1.6px，在 120Hz 屏上会跑成两倍速
function stepTo(target) {
  if (mode !== 'walk' || drag) { stopWander(); return; }
  const now = performance.now();
  const dt = (now - moveLast) / 1000;
  moveLast = now;
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) { stopWander(); return; }
  const step = Math.min(RunMath.runStep(dt, WALK_SPEED), dist);
  cur.x += (dx / dist) * step;
  cur.y += (dy / dist) * step;
  // 位置 IPC 限流到 ~30Hz：视觉依旧平滑，跨进程调用减半
  if (now - lastMoveAt >= 33) {
    lastMoveAt = now;
    window.api.setWinPos(Math.round(cur.x), Math.round(cur.y));
  }
  rafId = requestAnimationFrame(() => stepTo(target));
}

function stopWander() {
  if (mode === 'walk') mode = 'idle';
  clearInterval(walkTimer); walkTimer = null;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  pet.classList.remove('walking');
  if (!rigOn && currentForm === 'custom' && F.idle.length) crossfadeTo(F.idle[0], 350);
  scheduleWander();
}

// ---------- 写代码氛围模式：跟着键盘/鼠标节奏拍爪子、冒代码粒子、显示 KPM 与连击 ----------
const vibeEl = document.getElementById('vibe');
const vibeParticles = document.getElementById('vibe-particles');
const vibeKpmEl = document.getElementById('vibe-kpm');
const vibeComboEl = document.getElementById('vibe-combo');
const vibePaws = [vibeEl.querySelector('.vibe-paw-l'), vibeEl.querySelector('.vibe-paw-r')];
const vibeMeter = VibeMath.createMeter();
const VIBE_MAX_PARTICLES = 16;
const VIBE_LINES = ['这段代码有点东西 ✨', '手速起飞了喵！', '键盘冒烟啦 🔥', 'bug 退散！', '一把梭，冲！', '记得 commit 哦~'];
let vibeOn = false;
let vibeLoop = null;
let vibePaw = 0;
let vibeLastParticle = 0;
let vibeLevel = '';

function restartClass(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;   // 强制回流，让同一动画能连续重播
  el.classList.add(cls);
}

function spawnVibeParticle(level) {
  const now = performance.now();
  const gap = level === 'fire' ? 45 : level === 'flow' ? 70 : 110;
  if (now - vibeLastParticle < gap || vibeParticles.childElementCount >= VIBE_MAX_PARTICLES) return;
  vibeLastParticle = now;
  const p = document.createElement('span');
  p.className = 'vibe-particle';
  p.textContent = VibeMath.pickParticle();
  p.style.left = `${30 + Math.random() * 160}px`;
  p.style.setProperty('--dx', `${Math.round((Math.random() * 2 - 1) * 28)}px`);
  p.style.setProperty('--rot', `${Math.round((Math.random() * 2 - 1) * 25)}deg`);
  p.addEventListener('animationend', () => p.remove(), { once: true });
  vibeParticles.appendChild(p);
}

function renderVibe() {
  const t = Date.now();
  const kpm = vibeMeter.kpm(t);
  const combo = vibeMeter.combo(t);
  vibeKpmEl.textContent = String(kpm);
  vibeComboEl.textContent = combo >= 5 ? `x${combo}` : '';
  vibeEl.style.setProperty('--vibe', vibeMeter.intensity(t).toFixed(3));
  const level = vibeMeter.level(t);
  if (level !== vibeLevel) {
    vibeEl.classList.remove(`vibe-${vibeLevel}`);
    vibeEl.classList.add(`vibe-${level}`);
    vibeLevel = level;
  }
  vibeEl.classList.toggle('vibe-resting', vibeMeter.idleMs(t) > 6000);
}

function onVibeInput(p) {
  if (!vibeOn || !p) return;
  const t = Date.now();
  const prev = vibeMeter.combo(t);
  const combo = vibeMeter.hit(t, p.kind);
  if (p.kind === 'mouse') return;   // 鼠标移动只加一点热度
  vibePaw = 1 - vibePaw;
  restartClass(vibePaws[vibePaw], 'tap');
  restartClass(pet, 'vibe-bounce');
  spawnVibeParticle(vibeMeter.level(t));
  const m = VibeMath.milestone(prev, combo);
  if (m && !quiet && mode === 'idle') say(m >= 100 ? `${m} 连击！键盘要冒烟啦 🔥` : `${m} 连击！`, 'happy');
}

function applyVibe(on) {
  on = !!on;
  if (on === vibeOn) return;
  vibeOn = on;
  vibeEl.classList.toggle('hidden', !on);
  pet.classList.toggle('vibing', on);
  clearInterval(vibeLoop); vibeLoop = null;
  vibeMeter.reset();
  vibeParticles.textContent = '';
  if (on) {
    if (mode === 'walk') stopWander();   // 原地坐好陪你写代码
    renderVibe();
    vibeLoop = setInterval(renderVibe, 120);
    if (!quiet) say('写代码模式开启！我陪你敲 ⌨️', 'happy');
  }
}

window.api.onVibeInput(onVibeInput);
window.api.onVibeChanged(applyVibe);

// ---------- 来自主进程的事件 ----------
window.api.onFormChanged((form) => applyForm(form));
window.api.onPetSay((msg) => {
  if (!msg) return;
  if (msg.action === 'run') runOnDemand();                       // 奔跑是位移行为，不走定格动作
  else if (typeof msg.action === 'string') playAction(msg.action);
  if (msg.text) say(msg.text, msg.mood || 'normal');
});
window.api.onCustomImageChanged(() => {
  bumpSession();
  setIdle();
  disableRig();
  loadCustomImage();   // 上传形象后 getRigParts 会返回 unusable，保持帧动画
});
window.api.onFeedState((fs) => renderFeedBadge(fs));
window.api.onRigRefresh(() => loadRig());

// 初始化
window.api.getState().then((s) => {
  quiet = !!s.quiet;
  applyVibe(s.vibe);
  displayMode = s.displayMode === 'rig' ? 'rig' : 'photo';
  applyForm(s.form || 'custom');
  renderFeedBadge(s.feed);
});
window.api.onStateUpdated((s) => { quiet = !!s.quiet; });
scheduleWander();
