// 孤儿帧找回（纯函数，不依赖 Electron，可单测）：
// 生成任务中断或旧版本的清空逻辑会让 store 丢掉已经生成好的帧，但文件还在磁盘上。
// 按文件名挑出每个槽位最新的一张，由主进程在清理之前填回缺失的槽位。
const { RUN_FRAMES } = require('./run');

const ACTION_KEYS = ['roll', 'groom', 'eat', 'sleep', 'drink', 'stretch'];
const RUN_RE = /^pet-gen-run-(\d+)-(\d+)\.png$/;
const POSE_RE = /^pet-gen-([a-z]+)-(\d+)\.(png|jpg)$/;

function newest(map, key, ts, name) {
  const cur = map[key];
  if (!cur || ts > cur.ts) map[key] = { ts, name };
}

// 返回 { run: [name|null × RUN_FRAMES], actions: {key: name}, idle, walk }
// minTs：早于当前站立帧的文件属于换图前的旧猫，不能拿来拼进新猫
function pickOrphanFrames(fileNames, minTs = 0) {
  const runs = {};
  const poses = {};
  (Array.isArray(fileNames) ? fileNames : []).forEach((f) => {
    if (typeof f !== 'string') return;
    let m = RUN_RE.exec(f);
    if (m && Number(m[2]) < minTs) return;
    if (m) {
      const i = Number(m[1]);
      if (i >= 1 && i <= RUN_FRAMES) newest(runs, i, Number(m[2]), f);
      return;
    }
    m = POSE_RE.exec(f);
    if (m && Number(m[2]) >= minTs) newest(poses, m[1], Number(m[2]), f);
  });
  const run = [];
  for (let i = 1; i <= RUN_FRAMES; i++) run.push(runs[i] ? runs[i].name : null);
  const actions = {};
  ACTION_KEYS.forEach((k) => { if (poses[k]) actions[k] = poses[k].name; });
  return {
    run,
    actions,
    idle: poses.idle ? poses.idle.name : null,
    walk: poses.walk ? poses.walk.name : null
  };
}

// 只填缺失的槽位，不覆盖已有引用；run 序列必须整组齐全才填（半组会混出跛脚步态）。
// exists(name) 判断当前引用是否仍有效。返回 { state, changed: [...] }
function planRecovery(state, picked, exists) {
  const ok = typeof exists === 'function' ? exists : () => true;
  const s = Object.assign({}, state);
  const changed = [];
  const curRun = (s.customGenRunSeq || []).filter((p) => p && ok(p));
  if (curRun.length < RUN_FRAMES && picked.run.every(Boolean)) {
    s.customGenRunSeq = picked.run.slice();
    changed.push('run');
  }
  const acts = Object.assign({}, s.customGenActions || {});
  Object.keys(picked.actions).forEach((k) => {
    if (!acts[k] || !ok(acts[k])) { acts[k] = picked.actions[k]; changed.push(k); }
  });
  if (changed.some((c) => c !== 'run')) s.customGenActions = acts;
  return { state: s, changed };
}

// pet-gen-<key>-<ts>.png 里的时间戳；取不到返回 0
function frameTs(name) {
  const m = /-(\d{10,})\.(png|jpg)$/.exec(String(name || ''));
  return m ? Number(m[1]) : 0;
}

// 重做奔跑序列结束后：新的一组没凑齐、旧的一组还完整，就该把旧的还回去
function shouldRestoreRunSeq(cur, prev, exists) {
  const ok = typeof exists === 'function' ? exists : () => true;
  const curOk = (cur || []).filter((p) => p && ok(p)).length;
  const prevOk = (prev || []).filter((p) => p && ok(p)).length;
  return curOk < RUN_FRAMES && prevOk === RUN_FRAMES;
}

module.exports = { pickOrphanFrames, frameTs, planRecovery, shouldRestoreRunSeq, ACTION_KEYS };
