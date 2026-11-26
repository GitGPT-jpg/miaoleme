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

// 没有专门画帧的小动作：复用站立/动作帧，靠 CSS 动画 + 小道具把动作演出来
const BEHAVIOR_FX = {
  look:      { label: '咦？那边有什么…', ms: 3200, frame: 'idle' },
  loaf:      { label: '揣手手，当一只吐司 🍞', ms: 6500, frame: 'idle2' },
  yawn:      { label: '哈——欠~', ms: 2600, frame: 'idle2' },
  stretch:   { label: '伸个懒腰~', ms: 3000, frame: 'idle' },
  knead:     { label: '踩踩奶，踩踩奶~', ms: 4200, frame: 'idle' },
  scratch:   { label: '挠挠痒~', ms: 3000, frame: 'groom' },
  tail:      { label: '我的尾巴！别跑！', ms: 3600, frame: 'idle', prop: '〰️' },
  pounce:    { label: '准备…扑！', ms: 2600, frame: 'idle', prop: '🐭' },
  yarn:      { label: '毛线球是我的！', ms: 4200, frame: 'roll', prop: '🧶' },
  butterfly: { label: '蝴蝶蝴蝶别跑~', ms: 4200, frame: 'idle', prop: '🦋' },
  catnap:    { label: '眯一会儿…', ms: 7000, frame: 'sleep', prop: '💤' },
  groom:     { label: '舔舔毛，保持美丽~', ms: 3600, frame: 'idle2' },
  roll:      { label: '打个滚~', ms: 3200, frame: 'idle' },
  eat:       { label: '吧唧吧唧 🐟', ms: 3600, frame: 'idle2', prop: '🐟' },
  drink:     { label: '咕噜咕噜~', ms: 3000, frame: 'idle2', prop: '💧' }
};
const BEH_CLASSES = Object.keys(BEHAVIOR_FX).map((n) => 'beh-' + n).concat('beh-seq');
const NAP_CLASSES = ['vibe-sleeping', 'nap-twitch'];

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

// 注意力层（耳、眼、头的局部叠加）。全身动作仍只由当前 mode 的执行者控制。
const attention = AttentionMath.createAttention();
const ATT_CLASSES = ['att-ear-tip', 'att-look', 'att-flick', 'att-down', 'att-lean', 'att-linger', 'att-peek'];
let attTimer = null;
let attSaved = null;      // 首键时记下的「刚才在做什么」：{ session, kind, url }
let attLooked = false;
let senseOn = true;       // 「感知键盘」开关
let keySource = 'app-only';
let groomIdx = 0;         // 舔爪循环当前帧：注意力结束后从这一帧接着舔
let groomPaused = false;
let groomLoop = false;    // 正在演可被注意力暂停的舔爪循环
const WALK_CLASSES = ['walk-look', 'walk-lean', 'sniff', 'turn-head', 'turn-body', 'turn-tail', 'walk-slow', 'posed'];
let patrolTimers = [];
let behSeqTimers = [];
const TEASE_CLASSES = ['crouch', 'pounce', 'paw-hold', 'arrow-push', 'posed'];
const tease = AttentionMath.createTease();
const petArrow = document.querySelector('.pet-arrow');
let teaseCoolUntil = 0;
let teaseTimers = [];
// 拖拽/菜单/喂养/切形象等打断：注意力、巡视、逗猫的旧回调一起失效
function interruptOwnLife() {
  clearAttention();
  clearPatrol();
  clearTease();
  groomLoop = false;
}
function attentionBusy() { return attention.level !== 'none'; }

function clearBehaviorTimers() {
  clearTimeout(wanderTimer); wanderTimer = null;
  clearTimeout(actTimer); actTimer = null;
  clearInterval(sleepCycleTimer); sleepCycleTimer = null;
  clearInterval(walkTimer); walkTimer = null;
  clearInterval(runTimer); runTimer = null;
  behSeqTimers.forEach(clearTimeout); behSeqTimers = [];
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function setIdle() {
  clearBehaviorTimers();
  interruptOwnLife();
  mode = 'idle';
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'acting', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  clearProp();
}

function applyForm(form) {
  currentForm = form;
  disableRig();
  bumpSession();
  clearBehaviorTimers();
  interruptOwnLife();
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
let F = { idle: [], walk: [], happy: null, actions: {}, meta: {}, sequences: {}, behaviorSeq: {}, poses: {}, walkSeq: null, runSeq: null, idleEar: null };
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

// 行为/姿态真帧预解码：第一次用到时不闪
let preloadedPose = [];
function preloadPoseFrames() {
  preloadedPose = [];
  const urls = new Set(Object.values(F.poses || {}));
  Object.values(F.behaviorSeq || {}).forEach((b) => (b.frames || []).forEach((u) => urls.add(u)));
  urls.forEach((u) => { if (!u) return; const im = new Image(); im.src = u; preloadedPose.push(im); });
}
function pose(key) { return (F.poses && F.poses[key]) || null; }

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
      runSeq: frames.runSeq || null,
      behaviorSeq: frames.behaviorSeq || {},
      poses: frames.poses || {},
      idleEar: frames.idleEar || null
    };
    preloadRunFrames(F.runSeq);
    preloadPoseFrames();
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
  if (rigOn || currentForm !== 'custom' || mode !== 'idle' || F.idle.length < 2 || attentionBusy()) return;
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
  if (rigOn || mode !== 'idle' || attentionBusy()) return;
  if (mood === 'happy' && F.happy) crossfadeTo(F.happy, 350);
  else if (mood === 'normal' && F.idle.length) crossfadeTo(F.idle[0], 350);
}

let demoSilent = false;   // 静音实录：隐藏气泡
function say(text, mood = 'normal') {
  if (demoSilent) return;
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
  // 不清画布的话，切回序列帧后 Canvas 上会留一只定格的旧猫
  if (rctx && rigCanvas) rctx.clearRect(0, 0, rigCanvas.width, rigCanvas.height);
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
  gazeTarget = GazeMath.gazeFromOffset(p.x, p.y, 600);   // 普通路过：只目送
  onTeaseCursor(p);                                       // 爪边来回逗：才会扑
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
  interruptOwnLife();
  zoomiesLeft = 0;
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'acting', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  vibeEl.classList.remove('vibe-sleeping');
  clearProp();
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
  if (mode === 'tease' || mode === 'patrol' || groomLoop) setIdle();
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
  // 骨骼模式也走真实的走路序列帧：位移期间先收起骨骼，停步后由 stopWander 恢复
  if (on && rigOn) disableRig();
  if (on) {
    pet.classList.add('walking');
    const ws = F.walkSeq;
    const seq = (ws && ws.frames && ws.frames.length > 1) ? ws.frames : F.walk;
    const frameMs = (ws && ws.frameMs) || 260;
    // fadeMs 0 = 四腿步态帧硬切；淡化会把前后两帧的腿叠成重影
    const fadeMs = (ws && Number.isFinite(ws.fadeMs)) ? ws.fadeMs : 140;
    const show = (src) => (fadeMs > 0 ? crossfadeTo(src, fadeMs) : hardCutTo(src));
    pet.classList.toggle('walk-seq', !!(ws && ws.wide && seq === ws.frames));
    let tick = 0;
    if (seq.length) show(seq[0]);
    walkTimer = setInterval(() => {
      if (seq.length < 2) return;
      tick = (tick + 1) % seq.length;
      show(seq[tick]);
    }, frameMs);
  } else {
    pet.classList.remove('walking', 'walk-seq');
  }
}

// ---------- 奔跑：真帧序列硬切轮播 + 90px/s 横向位移 ----------
// 腿部交替与身体收拢/伸展全在帧里，所以 CSS 侧不再叠加缩放模拟（见 .run-seq）
function setRunFrame(on) {
  clearInterval(runTimer);
  runTimer = null;
  if (on && rigOn) disableRig();
  if (!on) { pet.classList.remove('running', 'run-seq'); return; }
  pet.classList.remove('walk-seq');
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
  const dist = 220 + Math.random() * 300;
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
  if (rig && !rigOn && mode === 'idle' && zoomiesLeft <= 0) setTimeout(() => { if (mode === 'idle' && rig && !rigOn) enableRig(); }, 360);
  // 疯跑（zoomies）：猫会突然来回连冲好几趟
  if (zoomiesLeft > 0 && !(vibeOn && vibePhaseState === 'typing')) {
    zoomiesLeft -= 1;
    clearTimeout(wanderTimer);
    wanderTimer = setTimeout(() => { if (mode === 'idle') startRunDash(); else scheduleWander(); }, 380);
    return;
  }
  zoomiesLeft = 0;
  scheduleWander();
}

// 外部触发（面板「跑一段」/演示钩子）：位置就绪后立刻冲刺
async function runOnDemand() {
  if (currentForm !== 'custom' || mode === 'drag' || mode === 'run') return;
  const mySession = bumpSession();
  clearBehaviorTimers();
  mode = 'idle';
  pet.classList.remove('acting', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  vibeEl.classList.remove('vibe-sleeping');
  clearProp();
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
  interruptOwnLife();
  clearBehaviorTimers();
  mode = 'act';
  if (rigOn) { disableRig(); }   // 动作使用序列帧
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'face-left', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  vibeEl.classList.remove('vibe-sleeping');
  clearProp();
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
  // 写代码模式下你停手时，它更快地去过自己的小日子
  const free = vibeOn && vibePhaseState === 'free';
  wanderTimer = setTimeout(startWander, free ? 900 + Math.random() * 1900 : 1800 + Math.random() * 3200);
}

async function startWander() {
  if (currentForm !== 'custom' || mode !== 'idle' || (vibeOn && vibePhaseState === 'typing')) { scheduleWander(); return; }
  const b = BehaviorMath.pickBehavior(BehaviorMath.BEHAVIORS, behaviorRecent);
  behaviorRecent = BehaviorMath.pushRecent(behaviorRecent, b);
  if (b !== 'walk' && b !== 'run' && b !== 'zoomies') {
    if (b === 'groom' && startGroom()) return;
    if (hasActionFrame(b)) { playAction(b); return; }
    if (BEHAVIOR_FX[b]) { playBehavior(b); return; }
  }
  const mySession = session;
  await ensurePos();
  if (session !== mySession || mode !== 'idle') return;  // 等待期间被拖拽/动作打断
  if (b === 'run' || b === 'zoomies') {
    zoomiesLeft = b === 'zoomies' ? 2 + Math.floor(Math.random() * 2) : 0;
    if (b === 'zoomies' && !quiet && Math.random() < 0.6) say('突然想跑！冲冲冲！', 'happy');
    startRunDash();
    return;
  }
  if (b === 'walk' && Math.random() < 0.5) { startPatrol(); return; }
  startRoam(1 + Math.floor(Math.random() * 3));
}

// 散步：走一段、停下张望、再走一段——真猫很少一口气走到底
function roamBounds() {
  const sc = window.screen || {};
  const left = (Number.isFinite(sc.availLeft) ? sc.availLeft : 0) + 20;
  return { left, right: left + (sc.availWidth || 1440) - 280 };
}
function startRoam(legs) {
  if (mode !== 'idle' && mode !== 'patrol') { scheduleWander(); return; }
  const mySession = session;
  const { left, right } = roamBounds();
  const target = {
    x: BehaviorMath.roamTargetX(cur.x, home.x, left, right),
    y: Math.round(Math.max(home.y - 36, Math.min(home.y + 36, cur.y + (Math.random() * 2 - 1) * 24)))
  };
  const dx = target.x - cur.x;
  if (Math.abs(dx) < 6 && Math.abs(target.y - cur.y) < 6) { mode = 'idle'; scheduleWander(); return; }
  pet.classList.toggle('face-left', dx < 0);
  mode = 'walk';
  setWalkFrame(true);
  moveLast = performance.now();
  const more = legs > 1;
  stepTo(target, more ? { onArrive: () => roamPause(mySession, legs - 1) } : undefined);
}
function roamPause(mySession, legs) {
  if (session !== mySession) return;
  mode = 'patrol';
  clearInterval(walkTimer); walkTimer = null;
  pet.classList.remove('walking', 'walk-slow');
  const sniff = Math.random() < 0.4;
  const still = sniff ? pose('sniff') : pose('alert');
  if (still) crossfadeTo(still, 220);
  else if (F.idle.length) crossfadeTo(F.idle[0], 240);
  pet.classList.toggle('posed', !!still);
  pet.classList.add(sniff ? 'sniff' : 'walk-look');     // 停下嗅一嗅，或者望一眼下一个去处
  patrolLater(mySession, 700 + Math.random() * 900, () => {
    pet.classList.remove('sniff', 'walk-look', 'posed');
    // 偶尔看着看着就突然冲出去
    if (Math.random() < 0.25 && !(vibeOn && vibePhaseState === 'typing')) { mode = 'idle'; startRunDash(); return; }
    startRoam(legs);
  });
}

let lastMoveAt = 0;
const WALK_SPEED = 96;   // px/s：原先是每帧 1.6px，在 120Hz 屏上会跑成两倍速
function stepTo(target, opts) {
  if (mode !== 'walk' || drag) { stopWander(); return; }
  const now = performance.now();
  const dt = (now - moveLast) / 1000;
  moveLast = now;
  const dx = target.x - cur.x;
  const dy = target.y - cur.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    if (opts && opts.onArrive) {
      rafId = null;
      window.api.setWinPos(Math.round(target.x), Math.round(target.y));
      opts.onArrive();
    } else stopWander();
    return;
  }
  // 到屏幕边/窝前放慢：最后一段降到 40% 速度
  const slow = !!(opts && opts.slowNear && dist < opts.slowNear);
  pet.classList.toggle('walk-slow', slow);
  const base = RunMath.runStep(dt, WALK_SPEED);
  const step = Math.min(slow ? base * 0.4 : base, dist);
  cur.x += (dx / dist) * step;
  cur.y += (dy / dist) * step;
  // 位置 IPC 限流到 ~30Hz：视觉依旧平滑，跨进程调用减半
  if (now - lastMoveAt >= 33) {
    lastMoveAt = now;
    window.api.setWinPos(Math.round(cur.x), Math.round(cur.y));
  }
  rafId = requestAnimationFrame(() => stepTo(target, opts));
}

function stopWander() {
  if (mode === 'walk') mode = 'idle';
  clearInterval(walkTimer); walkTimer = null;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  pet.classList.remove('walking');
  if (!rigOn && currentForm === 'custom' && F.idle.length) crossfadeTo(F.idle[0], 350);
  if (rig && !rigOn && mode === 'idle') enableRig();
  scheduleWander();
}

// ---------- 自己的小生活：没画帧的动作用现有帧 + CSS 动画 + 道具演出来 ----------
const petProp = document.querySelector('.pet-prop');
let behaviorRecent = [];
let zoomiesLeft = 0;

function hasActionFrame(name) {
  if (!ACTIONS[name]) return false;
  const seq = F.sequences && F.sequences[name];
  return !!((F.actions && F.actions[name]) || (seq && seq.frames && seq.frames.length));
}

function clearProp() {
  if (!petProp) return;
  petProp.textContent = '';
  petProp.className = 'pet-prop';
}

function behaviorFrame(key) {
  if (key === 'idle2') return F.idle[1] || F.idle[0];
  if (key && key !== 'idle' && F.actions && F.actions[key]) return F.actions[key];
  return F.idle[0];
}

function playBehavior(name) {
  const fx = BEHAVIOR_FX[name];
  if (!fx || currentForm !== 'custom' || mode === 'drag' || !F.idle.length) return;
  const mySession = bumpSession();
  clearBehaviorTimers();
  interruptOwnLife();
  mode = 'act';
  if (rigOn) disableRig();
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  pet.classList.toggle('face-left', Math.random() < 0.5);
  clearProp();
  pet.classList.add('acting', 'beh-' + name);
  const bs = F.behaviorSeq && F.behaviorSeq[name];
  if (bs && bs.frames && bs.frames.length) {
    pet.classList.add('beh-seq');                         // 有真帧：动作由帧来演，CSS 只留呼吸
    playBehaviorFrames(mySession, bs, fx.ms);
  } else {
    const url = behaviorFrame(fx.frame);
    if (url) crossfadeTo(url, 380);
  }
  if (fx.prop && petProp && !(bs && (name === 'tail' || name === 'pounce'))) {
    petProp.textContent = fx.prop;
    petProp.classList.add('prop-' + name);
  }
  if (!quiet && Math.random() < 0.4) say(fx.label, 'happy');
  actTimer = setTimeout(() => {
    if (session !== mySession) return;
    setIdle();
    pet.classList.remove('face-left', 'beh-seq');
    if (F.idle.length) crossfadeTo(F.idle[0], 420);
    if (rig) enableRig();
    scheduleWander();
  }, fx.ms);
}

// 真帧排程：hold 型（趴下/哈欠/伸懒腰/扑）按顺序演一遍停在最后一帧，收尾前先回到起始姿态；
// 循环型（踩奶/挠痒/扑蝴蝶）在动作时长内循环。所有回调受 session 保护，打断即失效。
function playBehaviorFrames(mySession, bs, totalMs) {
  const at = (ms, fn) => {
    const id = setTimeout(() => {
      behSeqTimers = behSeqTimers.filter((t) => t !== id);
      if (session !== mySession || mode !== 'act') return;
      fn();
    }, ms);
    behSeqTimers.push(id);
  };
  const n = bs.frames.length;
  crossfadeTo(bs.frames[0], 300);
  if (bs.hold) {
    for (let i = 1; i < n; i++) at(i * bs.frameMs, () => crossfadeTo(bs.frames[i], bs.fadeMs));
    if (n > 1 && totalMs > n * bs.frameMs + 700) at(totalMs - 650, () => crossfadeTo(bs.frames[0], 300));
    return;
  }
  const steps = Math.max(1, Math.floor((totalMs - 300) / bs.frameMs));
  for (let k = 1; k < steps; k++) at(k * bs.frameMs, () => crossfadeTo(bs.frames[k % n], bs.fadeMs));
}

// ---------- 键盘注意力：耳、眼、头局部叠加，不接管身体 ----------
function attKind() {
  if (mode === 'act' && pet.classList.contains('act-groom') && groomLoop) return 'groom';
  if (mode === 'nap') return 'nap';
  if (mode === 'idle' && !pet.classList.contains('raw-photo')) return 'idle';
  if (mode === 'idle') return 'lean';
  if (mode === 'act' || mode === 'walk' || mode === 'beh') return 'tip';
  return null;   // 拖拽/奔跑：不分心
}

function earUrlFor(kind) {
  if (kind === 'groom') {
    const g = F.sequences && F.sequences.groom;
    return g && g.earFrames ? g.earFrames[groomIdx % g.earFrames.length] : null;
  }
  if (kind === 'idle' && !rigOn) return F.idleEar || null;
  return null;
}

function feedAttention(n) {
  if (currentForm !== 'custom' || !senseOn || drag) return;
  const now = Date.now();
  const r = attention.onKeys(n, now);
  if (r.started) {
    const kind = attKind();
    if (!kind) { attention.reset(); return; }
    attSaved = { session, kind, url: activeUrl };
    attLooked = false;
    const ear = earUrlFor(kind);
    if (kind === 'groom') groomPaused = true;   // 爪悬着，不往下舔
    if (ear) hardCutTo(ear);                    // 首键：同一帧里只换耳朵，立即可见
    else if (kind === 'nap') restartClass(pet, 'nap-twitch');
    else if (kind === 'lean') pet.classList.add('att-lean');
    else pet.classList.add('att-ear-tip');
    pet.classList.add('att-on');
  }
  if (r.raised && attSaved && attSaved.kind !== 'nap') {
    attLooked = true;
    pet.classList.add('att-look');
  }
  if (r.flick) restartClass(pet, 'att-flick');
  pet.classList.remove('att-linger', 'att-down');
  if (!attTimer) attTimer = setInterval(attTick, 120);
}

function attTick() {
  if (!attSaved || attSaved.session !== session) { clearAttention(); return; }
  const r = attention.tick(Date.now());
  if (r.phase === 'linger') pet.classList.add('att-linger');
  if (!r.resumed) return;
  clearInterval(attTimer); attTimer = null;
  const saved = attSaved;
  const finish = () => {
    if (saved.session !== session) return;
    pet.classList.remove(...ATT_CLASSES, 'att-on');
    if (saved.kind === 'groom') {
      const g = F.sequences && F.sequences.groom;
      if (g) crossfadeTo(g.frames[groomIdx % g.frames.length], 260);
      groomPaused = false;           // 接着舔刚才那只爪
    } else if (saved.kind === 'idle' && earUrlFor('idle') && F.idle.length) {
      crossfadeTo(F.idle[0], 260);
    }
    attSaved = null;
  };
  if (attLooked) {
    // 多看的那半拍已在 linger 里；现在低头，再回到原来的事
    pet.classList.remove('att-look', 'att-linger');
    pet.classList.add('att-down');
    setTimeout(finish, 320);
  } else finish();
}

function clearAttention() {
  attention.reset();
  clearInterval(attTimer); attTimer = null;
  pet.classList.remove(...ATT_CLASSES, 'att-on');
  attSaved = null;
  attLooked = false;
  groomPaused = false;
}

// 舔爪循环：可被注意力暂停（爪悬着），停手后从同一帧接着舔
function startGroom(opts) {
  const seq = F.sequences && F.sequences.groom;
  if (!seq || !seq.frames || seq.frames.length < 2 || currentForm !== 'custom' || mode === 'drag') return false;
  const o = opts || {};
  const mySession = bumpSession();
  clearBehaviorTimers();
  clearAttention();
  mode = 'act';
  if (rigOn) disableRig();
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'face-left', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES, ...WALK_CLASSES, ...TEASE_CLASSES);
  vibeEl.classList.remove('vibe-sleeping');
  clearProp();
  pet.classList.add('acting', 'act-groom');
  groomLoop = true;
  groomIdx = o.startIdx || 0;
  crossfadeTo(seq.frames[groomIdx], seq.fadeMs || 220);
  const total = o.ms || (8000 + Math.random() * 4000);
  let left = total;
  sleepCycleTimer = setInterval(() => {
    if (session !== mySession) return;
    if (groomPaused) return;          // 注意力期间不推进、不计时：舔够才收
    left -= seq.frameMs || 760;
    groomIdx = (groomIdx + 1) % seq.frames.length;
    crossfadeTo(seq.frames[groomIdx], seq.fadeMs || 220);
    if (o.peekAt && !o.peeked && total - left >= o.peekAt) { o.peeked = true; peekAtUser(mySession); }
    if (left <= 0) endGroom(mySession);
  }, seq.frameMs || 760);
  if (!o.silent && !quiet && Math.random() < 0.3) say(ACTIONS.groom.label, 'happy');
  return true;
}

function endGroom(mySession) {
  if (session !== mySession) return;
  groomLoop = false;
  clearAttention();
  setIdle();
  if (F.idle.length) crossfadeTo(F.idle[0], 450);
  if (rig) enableRig();
  scheduleWander();
}


// ---------- 巡视：望向目标 → 重心前移 → 迈步 → 近边减速 → 嗅 → 头先转、肩胯跟上、尾巴最后收 → 回窝 ----------
function patrolLater(mySession, ms, fn) {
  const id = setTimeout(() => {
    patrolTimers = patrolTimers.filter((t) => t !== id);
    if (session !== mySession || drag) return;
    fn();
  }, ms);
  patrolTimers.push(id);
}
function clearPatrol() {
  patrolTimers.forEach(clearTimeout);
  patrolTimers = [];
  pet.classList.remove(...WALK_CLASSES);
}

function patrolEdgeX(fromX) {
  const sc = window.screen || {};
  const left = (Number.isFinite(sc.availLeft) ? sc.availLeft : 0) + 20;
  const right = left + (sc.availWidth || 1440) - 280;
  let dir = (fromX - left) < (right - fromX) ? -1 : 1;     // 朝更近的那条边
  if (Math.abs((dir < 0 ? left : right) - fromX) < 120) dir = -dir;   // 已经贴边了：去对面那条边看看
  const edge = dir < 0 ? left : right;
  const reach = Math.min(Math.abs(edge - fromX), 520);       // 太远就只巡到半路，免得一走半分钟
  return { x: Math.round(fromX + dir * reach), dir, atEdge: reach === Math.abs(edge - fromX) };
}

async function startPatrol() {
  if (currentForm !== 'custom' || mode !== 'idle' || drag) { scheduleWander(); return; }
  const mySession = bumpSession();
  clearBehaviorTimers();
  clearAttention();
  await ensurePos();
  if (session !== mySession || mode !== 'idle') return;
  const edge = patrolEdgeX(cur.x);
  if (Math.abs(edge.x - cur.x) < 40) { scheduleWander(); return; }
  const back = { x: home.x, y: home.y };
  mode = 'patrol';
  if (rigOn) disableRig();
  pet.classList.toggle('face-left', edge.dir < 0);
  if (pose('alert')) crossfadeTo(pose('alert'), 300);   // 起身站好、竖耳
  pet.classList.add('walk-look');                       // 先望向想去的地方
  patrolLater(mySession, 520, () => {
    pet.classList.add('walk-lean');                     // 重心前移
    patrolLater(mySession, 300, () => {
      pet.classList.remove('walk-look');
      mode = 'walk';
      setWalkFrame(true);
      moveLast = performance.now();
      stepTo({ x: edge.x, y: cur.y }, { slowNear: 80, onArrive: () => patrolAtEdge(mySession, back) });
      patrolLater(mySession, 260, () => pet.classList.remove('walk-lean'));
    });
  });
  return true;
}

function patrolAtEdge(mySession, back) {
  if (session !== mySession) return;
  mode = 'patrol';
  clearInterval(walkTimer); walkTimer = null;
  pet.classList.remove('walking', 'walk-slow');
  const sn = pose('sniff');
  if (sn) crossfadeTo(sn, 240); else if (F.idle.length) crossfadeTo(F.idle[0], 260);
  pet.classList.toggle('posed', !!sn);
  pet.classList.add('sniff');                           // 停下来嗅一嗅
  const tb = pose('turnBack'), tf = pose('turnFront');
  patrolLater(mySession, 950, () => {
    pet.classList.remove('sniff');
    pet.classList.toggle('posed', !!tb);
    if (tb) crossfadeTo(tb, 160);                       // 头先扭回来
    pet.classList.add('turn-head');                     // 头先动
    patrolLater(mySession, tb ? 260 : 180, () => {
      if (tf) crossfadeTo(tf, 140);                     // 肩胯跟上：正面过渡
      pet.classList.add('turn-body');                   // 肩胯跟上
      patrolLater(mySession, tf ? 240 : 200, () => {
        pet.classList.toggle('face-left');              // 身体到位才真的换朝向
        if (tb) crossfadeTo(tb, 140);
        pet.classList.remove('turn-head');
        pet.classList.add('turn-tail');                 // 尾巴最后收住
        patrolLater(mySession, 260, () => {
          pet.classList.remove('turn-body', 'posed');
          mode = 'walk';
          setWalkFrame(true);
          moveLast = performance.now();
          stepTo(back, { slowNear: 60, onArrive: () => patrolHome(mySession) });
          patrolLater(mySession, 320, () => pet.classList.remove('turn-tail'));
        });
      });
    });
  });
}

function patrolHome(mySession) {
  if (session !== mySession) return;
  const sd = pose('sitDown');
  if (!sd) { clearPatrol(); pet.classList.remove('face-left'); stopWander(); return; }
  // 回到窝里：先坐下，再转回原来的姿态
  mode = 'patrol';
  clearInterval(walkTimer); walkTimer = null;
  pet.classList.remove('walking', 'walk-slow');
  pet.classList.add('posed');
  crossfadeTo(sd, 320);
  patrolLater(mySession, 900, () => {
    clearPatrol();
    pet.classList.remove('face-left', 'posed');
    mode = 'walk';
    stopWander();
  });
}


// ---------- 逗猫：普通路过只目送；在爪边来回逗才压低身子扑 ----------
function teaseLater(mySession, ms, fn) {
  const id = setTimeout(() => {
    teaseTimers = teaseTimers.filter((t) => t !== id);
    if (session !== mySession || drag) return;
    fn();
  }, ms);
  teaseTimers.push(id);
}
function clearTease() {
  teaseTimers.forEach(clearTimeout);
  teaseTimers = [];
  pet.classList.remove(...TEASE_CLASSES);
  if (petArrow) petArrow.classList.add('hidden');
}

function onTeaseCursor(p) {
  const now = Date.now();
  const r = tease.feed(p.x, p.y, now);
  if (!r.teased || now < teaseCoolUntil) return;
  if (currentForm !== 'custom' || mode !== 'idle' || drag || (vibeOn && vibePhaseState === 'typing')) return;
  tease.reset();
  teaseCoolUntil = now + 9000;
  startPounce({ hit: Math.random() < 0.4, dir: p.x < 0 ? -1 : 1 });
}

function startPounce(opts) {
  const o = opts || {};
  if (currentForm !== 'custom' || drag) return;
  const mySession = bumpSession();
  clearBehaviorTimers();
  clearAttention();
  clearPatrol();
  clearTease();
  mode = 'tease';
  if (rigOn) disableRig();
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'acting', ...ACT_CLASSES, ...BEH_CLASSES, ...NAP_CLASSES);
  pet.classList.toggle('face-left', o.dir < 0);
  const cr = pose('crouch');
  if (cr) hardCutTo(cr); else if (F.idle.length) crossfadeTo(F.idle[0], 200);
  pet.classList.toggle('posed', !!cr);
  pet.classList.add('crouch');                            // 压低身子、屁股扭两下
  teaseLater(mySession, 620, () => {
    pet.classList.remove('crouch');
    if (pose('pounce')) hardCutTo(pose('pounce'));        // 腾空：硬切，淡化会糊成残影
    pet.classList.add('pounce');
    teaseLater(mySession, 340, () => (o.hit ? pounceHit(mySession) : pounceMiss(mySession)));
  });
}

function pounceMiss(mySession) {
  pet.classList.remove('pounce');
  if (pose('pawUp')) hardCutTo(pose('pawUp'));            // 落地，扑出去的那只爪还悬着
  pet.classList.add('paw-hold');                          // 扑空：那只爪在空中停一拍
  teaseLater(mySession, 420, () => {
    pet.classList.remove('paw-hold', 'face-left', 'posed');
    // 顺势抬爪洗脸，洗到一半偷偷瞄人
    if (!startGroom({ ms: groomAfterMissMs(), peekAt: 1900, silent: true })) {
      mode = 'idle';
      scheduleWander();
    }
  });
}
function groomAfterMissMs() { return 4600 + Math.random() * 1200; }

function pounceHit(mySession) {
  pet.classList.remove('pounce');
  if (pose('land')) hardCutTo(pose('land'));              // 落地按住
  if (petArrow) petArrow.classList.remove('hidden');      // 爪下压着一枚折角纸箭头
  window.api.arrowCaught();
  if (!quiet) say('抓到了！这个归我了 🐾', 'happy');
  teaseLater(mySession, 900, () => {
    if (petArrow) petArrow.classList.add('hidden');       // 藏起来
    pet.classList.remove('face-left', 'posed');
    if (F.idle.length) crossfadeTo(F.idle[0], 380);
    mode = 'idle';
    if (rig) enableRig();
    scheduleWander();
  });
}

function peekAtUser(mySession) {
  if (session !== mySession) return;
  pet.classList.add('att-peek');
  setTimeout(() => { if (session === mySession) pet.classList.remove('att-peek'); }, 900);
}

// 还礼：番茄休息开始或下次启动安顿好时，把同一枚箭头推回来（只一次）
let arrowPending = false;
function pushArrowBack() {
  if (currentForm !== 'custom' || mode !== 'idle' || drag) {
    arrowPending = true;
    setTimeout(() => { if (arrowPending) pushArrowBack(); }, 3000);
    return;
  }
  arrowPending = false;
  const mySession = bumpSession();
  clearBehaviorTimers();
  clearAttention();
  mode = 'tease';
  if (petArrow) petArrow.classList.remove('hidden');
  pet.classList.add('arrow-push');
  if (!quiet) say('喏，还你。', 'happy');
  setTimeout(() => {
    window.api.arrowReturned();
    if (petArrow) petArrow.classList.add('hidden');
    pet.classList.remove('arrow-push');
    if (session !== mySession) return;
    mode = 'idle';
    if (rig) enableRig();
    scheduleWander();
  }, 1800);
}
window.api.onArrowReturn(() => pushArrowBack());


// ---------- 写代码时：猫趴在键盘旁边睡觉，你敲的每一下都变成往上飘的符号 ----------
let vibePhaseState = 'free';
const napZzz = document.getElementById('nap-zzz');

function enterNap() {
  if (currentForm !== 'custom' || mode === 'drag' || mode === 'nap' || mode === 'run') return;
  bumpSession();
  clearBehaviorTimers();
  interruptOwnLife();
  zoomiesLeft = 0;
  if (rigOn) disableRig();
  mode = 'nap';
  pet.classList.remove('walking', 'running', 'run-seq', 'walk-seq', 'face-left', 'acting', ...ACT_CLASSES, ...BEH_CLASSES);
  clearProp();
  pet.classList.add('vibe-sleeping');
  vibeEl.classList.add('vibe-sleeping');
  const url = (F.actions && F.actions.sleep) || F.idle[1] || F.idle[0];
  if (url) crossfadeTo(url, 600);
  // 睡着也不是一动不动：偶尔抖抖耳朵、蹬蹬腿
  sleepCycleTimer = setInterval(() => {
    if (mode !== 'nap' || Math.random() < 0.55) return;
    restartClass(pet, 'nap-twitch');
  }, 2600);
}

function wakeFromNap() {
  if (mode !== 'nap') return;
  clearBehaviorTimers();
  mode = 'idle';
  pet.classList.remove(...NAP_CLASSES);
  vibeEl.classList.remove('vibe-sleeping');
  if (F.idle.length) crossfadeTo(F.idle[0], 450);
  if (vibeOn) {
    playBehavior(Math.random() < 0.5 ? 'yawn' : 'stretch');
    if (!quiet && Math.random() < 0.5) say('睡醒啦~ 你歇会儿，我去玩会儿', 'happy');
  } else {
    if (rig) enableRig();
    scheduleWander();
  }
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
  const napping = mode === 'nap';
  // 猫睡着时符号就是主角：每敲一下几乎都冒一个，从键盘上方飘起
  const gap = napping ? 28 : level === 'fire' ? 45 : level === 'flow' ? 70 : 110;
  const max = napping ? VIBE_MAX_PARTICLES + 12 : VIBE_MAX_PARTICLES;
  if (now - vibeLastParticle < gap || vibeParticles.childElementCount >= max) return;
  vibeLastParticle = now;
  const p = document.createElement('span');
  p.className = 'vibe-particle';
  p.textContent = VibeMath.pickParticle();
  p.style.left = napping ? `${48 + Math.random() * 110}px` : `${30 + Math.random() * 160}px`;
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
  const idleMs = vibeMeter.idleMs(t);
  vibeEl.classList.toggle('vibe-resting', idleMs > 6000);
  const ph = BehaviorMath.vibePhase(vibePhaseState, idleMs);
  if (ph !== vibePhaseState) {
    vibePhaseState = ph;
    if (ph === 'typing') enterNap();
    else wakeFromNap();
  } else if (ph === 'typing' && (mode === 'idle' || mode === 'walk')) {
    if (mode === 'walk') stopWander();
    enterNap();   // 动作刚做完而你还在敲：回键盘边接着睡
  }
}

function onVibeInput(p) {
  if (!p) return;
  if (p.kind === 'key') feedAttention(p.n || 1);   // 注意力只看次数与节奏，与写代码模式无关
  if (!vibeOn) return;
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
  vibePhaseState = 'free';
  if (!on) wakeFromNap();
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
  else if (msg.action === 'demo-silent') { demoSilent = true; quiet = true; bubble.classList.add('hidden'); applyVibe(false); }
  else if (msg.action === 'groom-loop') { interruptOwnLife(); if (mode !== 'idle') setIdle(); startGroom({ ms: msg.ms || 15000, silent: true }); }
  else if (msg.action === 'patrol') { if (mode !== 'idle') setIdle(); startPatrol(); }
  else if (msg.action === 'tease-miss' || msg.action === 'tease-hit') {
    if (mode !== 'idle') setIdle();
    startPounce({ hit: msg.action === 'tease-hit', dir: 1 });
  }
  else if (typeof msg.action === 'string') playAction(msg.action);
  if (msg.text) say(msg.text, msg.mood || 'normal');
});
window.api.onCustomImageChanged(() => {
  bumpSession();
  setIdle();   // setIdle 内已让注意力/巡视/逗猫的旧回调失效
  disableRig();
  loadCustomImage();   // 上传形象后 getRigParts 会返回 unusable，保持帧动画
});
window.api.onFeedState((fs) => renderFeedBadge(fs));
window.api.onRigRefresh(() => loadRig());

// 初始化
window.api.getState().then((s) => {
  quiet = !!s.quiet;
  senseOn = s.senseKeys !== false;
  if (s.keySource) keySource = s.keySource;
  applyVibe(s.vibe);
  displayMode = s.displayMode === 'rig' ? 'rig' : 'photo';
  applyForm(s.form || 'custom');
  renderFeedBadge(s.feed);
});
window.api.onStateUpdated((s) => {
  quiet = !!s.quiet;
  if (typeof s.senseKeys === 'boolean') senseOn = s.senseKeys;
});
window.api.onSenseKeys((on) => { senseOn = !!on; if (!senseOn) clearAttention(); });
window.api.onKeySource((src) => { keySource = src || keySource; });
scheduleWander();
