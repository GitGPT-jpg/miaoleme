// 奔跑节拍与位移（UMD：渲染层与 Node 共用）
// 真实猫小跑是「收拢（拱背、四脚聚拢）↔ 伸展（四肢前后拉开）」交替，身体始终水平；
// 动作全在帧里，渲染层只负责按时间硬切帧 + 按 dt 推进位移。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RunMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const RUN_SPEED = 90;          // px/s：横向位移速度
  const RUN_FRAMES = 8;          // 一个完整步态循环的帧数（run-1…run-8）
  const RUN_STRIDE_PX = 58;      // 一个循环前进的距离，用来反推帧间隔
  const WALK_FALLBACK_MS = 120;  // 没有真跑步帧时，走路帧的加速间隔

  // 步频与位移匹配：循环内前进 stridePx → 每帧 ms，夹在 70–90ms（更短会糊，更长会拖）
  function cycleFrameMs(speed = RUN_SPEED, stridePx = RUN_STRIDE_PX, count = RUN_FRAMES, min = 70, max = 90) {
    const s = speed > 0 ? speed : RUN_SPEED;
    const n = count > 0 ? count : RUN_FRAMES;
    const px = stridePx > 0 ? stridePx : RUN_STRIDE_PX;
    return Math.min(max, Math.max(min, Math.round((px / s) * 1000 / n)));
  }

  const RUN_FRAME_MS = cycleFrameMs();

  // 硬切索引：跑步帧间隔很短，淡入淡出会糊，按时间整帧取
  function runFrameIndex(elapsedMs, frameMs = RUN_FRAME_MS, count = RUN_FRAMES) {
    if (!(count > 0) || !(frameMs > 0)) return 0;
    const e = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
    return Math.floor(e / frameMs) % count;
  }

  // dt(秒) → 本帧位移像素；dt 上限 50ms，切后台再回来不会瞬移
  function runStep(dt, speed = RUN_SPEED) {
    const h = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0));
    return h * (Number.isFinite(speed) && speed > 0 ? speed : RUN_SPEED);
  }

  // 选帧：真帧序列优先（≥2 帧即成循环），否则用走路帧加速兜底
  function pickRunFrames(runSeq, walkFrames) {
    const real = runSeq && Array.isArray(runSeq.frames) ? runSeq.frames.filter(Boolean) : [];
    if (real.length >= 2) {
      const ms = runSeq.frameMs > 0 ? runSeq.frameMs : RUN_FRAME_MS;
      return { frames: real, frameMs: ms, real: true };
    }
    const walk = Array.isArray(walkFrames) ? walkFrames.filter(Boolean) : [];
    return { frames: walk, frameMs: WALK_FALLBACK_MS, real: false };
  }

  // 按实测体长排出「收拢 ↔ 伸展」交替的播放顺序：
  // 最收拢 → 过渡 → 最伸展 → 过渡 → 次收拢 → 过渡 → 次伸展 → 过渡。
  // 生成模型对 CONTACT/DOWN/PASSING/FLIGHT 的服从度不稳（常把该收拢的帧画成伸展），
  // 与其相信提示词的标号，不如按画出来的体长排，步态节奏才稳定。
  function orderRunCycle(lengths) {
    const n = Array.isArray(lengths) ? lengths.length : 0;
    if (n < 4) return Array.from({ length: n }, (_, i) => i);
    const asc = lengths.map((v, i) => i).sort((a, b) => (lengths[a] - lengths[b]) || (a - b));
    const short = [asc.shift(), asc.shift()];
    const long = [asc.pop(), asc.pop()];
    const mid = asc;
    const out = [];
    for (let k = 0; k < 2; k++) {
      out.push(short[k]);
      if (mid.length) out.push(mid.shift());
      out.push(long[k]);
      if (mid.length) out.push(mid.shift());
    }
    while (mid.length) out.push(mid.shift());
    return out;
  }

  return {
    RUN_SPEED, RUN_FRAMES, RUN_FRAME_MS, RUN_STRIDE_PX, WALK_FALLBACK_MS,
    cycleFrameMs, runFrameIndex, runStep, pickRunFrames, orderRunCycle
  };
});
