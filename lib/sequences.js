// 动作序列元数据（纯函数，可单测）：每帧时长、过渡时长、动作总时长
// 说明：真正流畅的动画来自「关键帧 + 过渡 + 次级运动」，而不是大量风格漂移的单帧
const { RUN_FRAME_MS, RUN_FRAMES } = require('./run');

const ACTION_META = {
  roll:    { label: '打个滚~ 看我肚皮！', ms: 4200, frameMs: 700, fadeMs: 180 },
  groom:   { label: '舔舔毛，保持美丽~', ms: 4600, frameMs: 760, fadeMs: 220 },
  eat:     { label: '干饭时间到！🍚', ms: 4500, frameMs: 700, fadeMs: 200 },
  drink:   { label: '咕噜咕噜~ 好喝！', ms: 3300, frameMs: 620, fadeMs: 180 },
  sleep:   { label: '有点困了…睡会儿 💤', ms: 8000, frameMs: 2200, fadeMs: 900 },
  stretch: { label: '伸个懒腰~', ms: 3200, frameMs: 1400, fadeMs: 420 },
  play:    { label: '陪我玩会儿嘛~', ms: 3600, frameMs: 900, fadeMs: 240 }
};

const WALK = { frameMs: 180, fadeMs: 110 };
// 内置猫的奔跑序列文件名（已按播放顺序排好：收拢 ↔ 伸展交替）
const RUN_FILES = Array.from({ length: RUN_FRAMES }, (_, i) => `cat-3d-run-${i + 1}.png`);

const GROOM_FILES = ['cat-3d-groom.png', 'act-groom-2.png', 'act-groom-3.png', 'act-groom-4.png'];
// 转耳变体：与原帧一一对应（x.png -> x-ear.png），只改耳朵，脸宽/毛色/基线不变。
// 任何一帧缺变体就整组不给，渲染层改用 CSS 耳尖微动兜底，避免帧序错位。
const earName = (f) => f.replace(/\.png$/, '-ear.png');
function earFramesFor(url, files) {
  const base = files.map(url);
  const ear = files.map((f) => url(earName(f)));
  if (base.some((u) => !u) || ear.some((u) => !u)) return {};
  return { earFrames: ear };
}

// 小生活行为的真帧（以 cat-3d-idle 为母版补画，同一画布/基线）。缺帧则整条不给，渲染层回落到 CSS 演法
const BEHAVIOR_FILES = {
  loaf:      { files: ['act-sit-down.png', 'act-loaf-1.png', 'act-loaf-2.png'], frameMs: 1600, fadeMs: 520, hold: true },
  yawn:      { files: ['act-yawn-0.png', 'act-yawn-1.png', 'act-yawn-2.png', 'act-yawn-1.png', 'act-yawn-0.png'], frameMs: 560, fadeMs: 260, hold: true },
  knead:     { files: ['act-knead-1.png', 'act-knead-2.png'], frameMs: 420, fadeMs: 150 },
  scratch:   { files: ['act-scratch-1.png', 'act-scratch-2.png'], frameMs: 170, fadeMs: 70 },
  look:      { files: ['act-look-0.png', 'act-look-1.png', 'act-look-2.png'], frameMs: 900, fadeMs: 340, hold: true },
  tail:      { files: ['act-tail.png', 'act-turn-1.png'], frameMs: 520, fadeMs: 200 },
  butterfly: { files: ['act-stand-alert.png', 'act-paw-up.png', 'act-bat.png', 'act-paw-up.png'], frameMs: 460, fadeMs: 160 },
  yarn:      { files: ['act-bat.png', 'act-paw-up.png', 'act-crouch.png'], frameMs: 420, fadeMs: 150 },
  pounce:    { files: ['act-crouch.png', 'act-pounce.png', 'act-land.png'], frameMs: 700, fadeMs: 120, hold: true },
  stretch:   { files: ['act-stretch-0.png', 'act-stretch-1.png', 'act-stretch-2.png', 'act-stretch-3.png'], frameMs: 800, fadeMs: 320, hold: true },
  shake:     { files: ['act-shake-1.png', 'act-shake-2.png'], frameMs: 110, fadeMs: 40 },
  earscratch:{ files: ['act-earscratch-1.png', 'act-earscratch-2.png'], frameMs: 150, fadeMs: 60 },
  belly:     { files: ['act-belly-1.png', 'act-belly-2.png'], frameMs: 1400, fadeMs: 500, hold: true },
  chatter:   { files: ['act-chatter.png', 'act-stand-alert.png'], frameMs: 260, fadeMs: 90 },
  sitlick:   { files: ['act-sit-down.png', 'act-sit-lick.png'], frameMs: 900, fadeMs: 300, hold: true },
  tailwrap:  { files: ['act-sit-down.png', 'act-tail-wrap.png'], frameMs: 1200, fadeMs: 450, hold: true },
  // 入睡/起身过渡：站 → 坐 → 趴 → 蜷；蜷着抬头 → 前腿撑起 → 站直。睡觉不再是一刀切
  settle:    { files: ['act-sit-down.png', 'act-settle-1.png', 'act-settle-2.png', 'act-settle-3.png'], frameMs: 900, fadeMs: 380, hold: true },
  rise:      { files: ['act-wake-1.png', 'act-rise-1.png', 'act-rise-2.png'], frameMs: 800, fadeMs: 340, hold: true }
};
// 巡视/逗猫用到的单帧姿态
const POSE_FILES = {
  alert: 'act-stand-alert.png', sniff: 'act-sniff.png', turnBack: 'act-turn-1.png', turnFront: 'act-turn-2.png',
  sitDown: 'act-sit-down.png', crouch: 'act-crouch.png', pounce: 'act-pounce.png', land: 'act-land.png', pawUp: 'act-paw-up.png',
  blink: 'act-blink.png', blinkHalf: 'act-blink-half.png', startle: 'act-startle.png', content: 'act-content.png',
  rub: 'act-rub.png', curl: 'act-curl.png', sideSleep: 'act-side-sleep.png',
  // 中间帧：抬爪准备舔、迈出第一步、收步站定
  groomStart: 'act-groom-0.png', stepOut: 'act-walk-5.png', stepIn: 'act-walk-6.png'
};

function buildBehaviorSequences(url) {
  const out = {};
  Object.keys(BEHAVIOR_FILES).forEach((k) => {
    const b = BEHAVIOR_FILES[k];
    const frames = b.files.map(url);
    if (frames.some((u) => !u)) return;
    out[k] = { frames, frameMs: b.frameMs, fadeMs: b.fadeMs, hold: !!b.hold };
  });
  return out;
}
function buildPoses(url) {
  const out = {};
  Object.keys(POSE_FILES).forEach((k) => { const u = url(POSE_FILES[k]); if (u) out[k] = u; });
  return out;
}

// 构造 bundled 序列：入参是 (文件名) => dataURL，缺帧自动跳过
function buildBundledSequences(url) {
  const seq = (files) => files.map(url).filter(Boolean);
  const runFrames = seq(RUN_FILES);
  return {
    meta: Object.assign({}, ACTION_META),
    walk: {
      frames: seq(['cat-3d-walk.png', 'cat-3d-walk2.png', 'act-walk-3.png', 'act-walk-4.png']),
      frameMs: WALK.frameMs,
      fadeMs: WALK.fadeMs
    },
    // 少于 4 帧凑不出步态，交给渲染层用走路帧加速兜底
    run: runFrames.length >= 4 ? { frames: runFrames, frameMs: RUN_FRAME_MS } : null,
    behaviors: buildBehaviorSequences(url),
    poses: buildPoses(url),
    actions: {
      roll: { frames: seq(['cat-3d-roll.png', 'act-roll-2.png', 'act-roll-3.png', 'act-roll-4.png', 'act-roll-5.png']), frameMs: ACTION_META.roll.frameMs, fadeMs: ACTION_META.roll.fadeMs },
      groom: Object.assign(
        { frames: seq(GROOM_FILES), frameMs: ACTION_META.groom.frameMs, fadeMs: ACTION_META.groom.fadeMs },
        earFramesFor(url, GROOM_FILES)
      ),
      eat: { frames: seq(['cat-3d-eat.png', 'act-eat-2.png', 'act-eat-3.png', 'act-eat-4.png']), frameMs: ACTION_META.eat.frameMs, fadeMs: ACTION_META.eat.fadeMs },
      drink: { frames: seq(['cat-3d-drink.png', 'act-drink-2.png', 'act-drink-3.png', 'act-drink-4.png']), frameMs: ACTION_META.drink.frameMs, fadeMs: ACTION_META.drink.fadeMs },
      sleep: { frames: seq(['cat-3d-sleep.png', 'cat-3d-sleep2.png']), frameMs: ACTION_META.sleep.frameMs, fadeMs: ACTION_META.sleep.fadeMs },
      stretch: { frames: seq(['act-stretch-0.png', 'act-stretch-1.png', 'act-stretch-2.png', 'act-stretch-3.png']), frameMs: ACTION_META.stretch.frameMs, fadeMs: ACTION_META.stretch.fadeMs }
    }
  };
}

// 序列在给定总时长内应播放的帧索引（循环）；用于渲染层排程与单测
function frameIndices(totalMs, frameMs, count) {
  if (!count || count < 1) return [];
  if (!(totalMs > 0)) return [];
  if (!frameMs || frameMs <= 0) return [0];
  const n = Math.max(1, Math.ceil(totalMs / frameMs));
  return Array.from({ length: n }, (_, i) => i % count);
}

module.exports = { ACTION_META, WALK, RUN_FILES, GROOM_FILES, BEHAVIOR_FILES, POSE_FILES, earName, buildBundledSequences, frameIndices };
