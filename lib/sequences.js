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

const WALK = { frameMs: 220, fadeMs: 120 };
// 内置猫的奔跑序列文件名（已按播放顺序排好：收拢 ↔ 伸展交替）
const RUN_FILES = Array.from({ length: RUN_FRAMES }, (_, i) => `cat-3d-run-${i + 1}.png`);

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
    actions: {
      roll: { frames: seq(['cat-3d-roll.png', 'act-roll-2.png', 'act-roll-3.png', 'act-roll-4.png', 'act-roll-5.png']), frameMs: ACTION_META.roll.frameMs, fadeMs: ACTION_META.roll.fadeMs },
      groom: { frames: seq(['cat-3d-groom.png', 'act-groom-2.png', 'act-groom-3.png', 'act-groom-4.png']), frameMs: ACTION_META.groom.frameMs, fadeMs: ACTION_META.groom.fadeMs },
      eat: { frames: seq(['cat-3d-eat.png', 'act-eat-2.png', 'act-eat-3.png', 'act-eat-4.png']), frameMs: ACTION_META.eat.frameMs, fadeMs: ACTION_META.eat.fadeMs },
      drink: { frames: seq(['cat-3d-drink.png', 'act-drink-2.png', 'act-drink-3.png', 'act-drink-4.png']), frameMs: ACTION_META.drink.frameMs, fadeMs: ACTION_META.drink.fadeMs },
      sleep: { frames: seq(['cat-3d-sleep.png', 'cat-3d-sleep2.png']), frameMs: ACTION_META.sleep.frameMs, fadeMs: ACTION_META.sleep.fadeMs },
      stretch: { frames: seq(['act-stretch-1.png', 'act-stretch-2.png', 'act-stretch-3.png']), frameMs: ACTION_META.stretch.frameMs, fadeMs: ACTION_META.stretch.fadeMs }
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

module.exports = { ACTION_META, WALK, RUN_FILES, buildBundledSequences, frameIndices };
