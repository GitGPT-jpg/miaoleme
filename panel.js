// ---------- Tab 切换 ----------
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('page-' + tab.dataset.tab).classList.add('active');
  });
});

// ---------- 工具 ----------
function fmt(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------- 形态 ----------
const formBtns = document.querySelectorAll('.form-btn');
formBtns.forEach((btn) => {
  btn.addEventListener('click', async () => {
    const s = await window.api.setForm(btn.dataset.form);
    renderForm(s.form);
  });
});
function renderForm(form) {
  formBtns.forEach((b) => b.classList.toggle('active', b.dataset.form === form));
}

// 自定义图片上传 + 预览
const customPreview = document.getElementById('custom-preview');
function loadCustomPreview() {
  window.api.getCustomImage().then((url) => {
    if (url) { customPreview.src = url; customPreview.classList.add('show'); }
    else customPreview.classList.remove('show');
  });
}
const UPLOAD_ERRORS = {
  image_too_large: '图片超过 20MB，请压缩后再试',
  invalid_image: '这不是有效的图片文件（支持 PNG/JPG/GIF/WebP）',
};
document.getElementById('upload-img').addEventListener('click', async () => {
  const res = await window.api.uploadCustomImage();
  if (res && !res.ok && res.error) {
    genStatusEl.className = 'gen-status err';
    genStatusEl.textContent = '⚠️ ' + (UPLOAD_ERRORS[res.error] || '上传失败：' + res.error);
    return;
  }
  if (res && res.ok) {
    if (res.dataUrl) { customPreview.src = res.dataUrl; customPreview.classList.add('show'); }
    renderForm('custom');
    if (res.generating) setGenStatus({ state: 'generating', done: 0, total: 6, label: '准备中' });
    window.api.petSay({ text: '换上新形象啦~', mood: 'happy' });
  }
});

// 后台 3D 生成状态（可查询事实：初始化读主进程任务，事件只做通知）
const genStatusEl = document.getElementById('gen-status');
const genProgEl = document.getElementById('gen-progress');
const genProgFill = document.getElementById('gen-progress-fill');
const genActionsEl = document.getElementById('gen-actions');

const GEN_STATE_MAP = { running: 'generating', completed: 'completed', partial: 'partial', failed: 'failed', cancelled: 'cancelled', unavailable: 'unavailable' };
const genCancelBtn = document.getElementById('gen-cancel');
const genRetryBtn = document.getElementById('gen-retry');
function showGenActions(cancel, retry) {
  genActionsEl.style.display = (cancel || retry) ? 'flex' : 'none';
  genCancelBtn.style.display = cancel ? '' : 'none';
  genRetryBtn.style.display = retry ? '' : 'none';
}

function setGenStatus(s) {
  genStatusEl.className = 'gen-status';
  genActionsEl.style.display = 'none';
  if (!s) { genStatusEl.textContent = ''; genProgEl.classList.remove('show'); return; }
  const st = GEN_STATE_MAP[s.state || s.status] || s.state || s.status;
  const total = s.total || 0;
  const ok = s.succeeded || 0;
  const bad = s.failed || 0;
  const done = s.done != null ? s.done : ok + bad;

  if (st === 'generating') {
    genStatusEl.classList.add('busy');
    genStatusEl.textContent = total
      ? `正在后台生成 3D 形象 ${done}/${total}${s.label ? '（' + s.label + '）' : ''}…`
      : '正在准备生成…';
    genProgEl.classList.add('show');
    genProgFill.style.width = total ? Math.round(done / total * 100) + '%' : '4%';
    showGenActions(true, false);
  } else if (st === 'completed') {
    genStatusEl.classList.add('ok');
    genStatusEl.textContent = `✅ 全部 ${total || ok} 个姿势生成完成并应用`;
    genProgFill.style.width = '100%';
    setTimeout(() => genProgEl.classList.remove('show'), 1500);
    loadCustomPreview();
  } else if (st === 'partial') {
    genStatusEl.classList.add('err');
    genStatusEl.textContent = `⚠️ 已生成 ${ok}/${total}，${bad} 项失败，可重试失败项`;
    genProgEl.classList.add('show');
    genProgFill.style.width = Math.round(ok / (total || 1) * 100) + '%';
    showGenActions(false, true);
    loadCustomPreview();
  } else if (st === 'cancelled') {
    genStatusEl.classList.add('err');
    genStatusEl.textContent = `⏹ 已取消生成（已完成 ${ok}/${total}）`;
    genProgEl.classList.remove('show');
    showGenActions(false, true);
    loadCustomPreview();
  } else if (st === 'failed') {
    genStatusEl.classList.add('err');
    genStatusEl.textContent = '❌ 生成失败，已保留原图/最近成功形象';
    genProgEl.classList.remove('show');
    showGenActions(false, true);
  } else if (st === 'unavailable') {
    genStatusEl.classList.add('err');
    genStatusEl.textContent = '⚠️ 未配置生成服务，当前使用原图';
    genProgEl.classList.remove('show');
  }
}
window.api.onGenStatus((s) => setGenStatus(s));

document.getElementById('gen-cancel').addEventListener('click', async () => {
  await window.api.cancelGen();
});
document.getElementById('gen-retry').addEventListener('click', async () => {
  const r = await window.api.retryGen();
  if (r && r.ok && !r.nothingToDo) {
    setGenStatus(Object.assign({ state: 'generating', succeeded: 0, failed: 0 }, r.job || {}));
  }
});

// 初始化时查询真实任务状态（面板关闭重开也能看到）
async function refreshGenJob() {
  try {
    const job = await window.api.getGenJob();
    if (job) setGenStatus(job);
  } catch (e) { /* 忽略 */ }
}

// ---------- 喝水 ----------
const waterEnabled = document.getElementById('water-enabled');
const waterInterval = document.getElementById('water-interval');
document.getElementById('water-save').addEventListener('click', async () => {
  await window.api.setWater({
    enabled: waterEnabled.checked,
    intervalMin: Math.max(5, parseInt(waterInterval.value || '45', 10))
  });
  flash(document.getElementById('water-save'), '已保存');
});
function setIfIdle(el, v) { if (document.activeElement !== el) el.value = v; }
function renderWater(water) {
  waterEnabled.checked = !!water.enabled;
  setIfIdle(waterInterval, water.intervalMin);
}

function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1200);
}

// ---------- 会议 ----------
document.getElementById('meet-add').addEventListener('click', async () => {
  const title = document.getElementById('meet-title').value.trim();
  const time = document.getElementById('meet-time').value;
  if (!title || !time) return;
  const s = await window.api.addMeeting({ title, ts: new Date(time).getTime() });
  document.getElementById('meet-title').value = '';
  document.getElementById('meet-time').value = '';
  renderMeetings(s.meetings);
});

const lastListJson = { meet: '', ddl: '' };
function renderMeetings(list) {
  const ul = document.getElementById('meet-list');
  const sig = JSON.stringify(list);
  if (sig === lastListJson.meet) return;
  lastListJson.meet = sig;
  ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<div class="empty">暂无会议</div>'; return; }
  const now = Date.now();
  list.forEach((m) => {
    const li = document.createElement('li');
    const past = m.ts <= now;
    if (past) li.classList.add('past');
    else if (m.ts - now < 30 * 60 * 1000) li.classList.add('soon');
    li.innerHTML = `<div class="meta"><span class="t">${escapeHtml(m.title)}</span><span class="d">${fmt(m.ts)}${past ? ' · 已过' : ''}</span></div>`;
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '删除';
    del.onclick = async () => renderMeetings((await window.api.removeMeeting(m.id)).meetings);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

// ---------- DDL ----------
document.getElementById('ddl-add').addEventListener('click', async () => {
  const title = document.getElementById('ddl-title').value.trim();
  const time = document.getElementById('ddl-time').value;
  if (!title || !time) return;
  const s = await window.api.addDdl({ title, ts: new Date(time).getTime() });
  document.getElementById('ddl-title').value = '';
  document.getElementById('ddl-time').value = '';
  renderDdls(s.ddls);
});

function renderDdls(list) {
  const ul = document.getElementById('ddl-list');
  const sig = JSON.stringify(list);
  if (sig === lastListJson.ddl) return;
  lastListJson.ddl = sig;
  ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<div class="empty">暂无 DDL</div>'; return; }
  const now = Date.now();
  list.forEach((d) => {
    const li = document.createElement('li');
    const expired = d.ts <= now;
    if (expired) li.classList.add('past');
    else if (d.ts - now < 24 * 60 * 60 * 1000) li.classList.add('soon');
    const left = d.ts - now;
    const leftTxt = left > 0 ? `剩 ${Math.ceil(left / 3600000)} 小时` : '已到期';
    li.innerHTML = `<div class="meta"><span class="t">${escapeHtml(d.title)}</span><span class="d">${fmt(d.ts)} · ${leftTxt}</span></div>`;
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '删除';
    del.onclick = async () => renderDdls((await window.api.removeDdl(d.id)).ddls);
    li.appendChild(del);
    ul.appendChild(li);
  });
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- 吃饭转盘 ----------
const DEFAULT_MEALS = {
  lunch: ['黄焖鸡', '麻辣烫', '盖浇饭', '沙拉', '牛肉面', '炒饭', '寿司', '轻食'],
  dinner: ['火锅', '烧烤', '炒菜', '饺子', '披萨', '螺蛳粉', '汉堡', '粥']
};
const WHEEL_COLORS = ['#ff9a8b', '#ffc371', '#6a8dff', '#8f6aff', '#4ecdc4', '#ff6b9d', '#ffd166', '#06d6a0'];

let mealList = DEFAULT_MEALS;
let wheelRotation = 0;
let spinning = false;

function currentMeals() {
  const type = document.getElementById('meal-type').value;
  return mealList[type] && mealList[type].length ? mealList[type] : DEFAULT_MEALS[type];
}

function buildWheel() {
  const items = currentMeals();
  const wheel = document.getElementById('wheel');
  const n = items.length;
  const seg = 360 / n;
  // 用 conic-gradient 画扇形背景
  const stops = items.map((_, i) => {
    const c = WHEEL_COLORS[i % WHEEL_COLORS.length];
    return `${c} ${i * seg}deg ${(i + 1) * seg}deg`;
  }).join(', ');
  wheel.style.background = `conic-gradient(${stops})`;
  // 文字
  wheel.innerHTML = '';
  items.forEach((name, i) => {
    const el = document.createElement('div');
    el.className = 'seg';
    el.style.transform = `rotate(${i * seg + seg / 2}deg)`;
    el.style.setProperty('--txt', '0deg');
    el.innerHTML = `<span>${escapeHtml(name)}</span>`;
    wheel.appendChild(el);
  });
}

document.getElementById('meal-type').addEventListener('change', () => {
  buildWheel();
  document.getElementById('meal-custom').value = currentMeals().join('，');
});

document.getElementById('spin-btn').addEventListener('click', () => {
  if (spinning) return;
  const items = currentMeals();
  const n = items.length;
  const seg = 360 / n;
  const idx = Math.floor(Math.random() * n);
  // 指针在正上方(0deg)，让所选扇区中心转到顶部
  const target = 360 * 5 + (360 - (idx * seg + seg / 2));
  wheelRotation = target;
  spinning = true;
  document.getElementById('meal-result').textContent = '';
  const wheel = document.getElementById('wheel');
  wheel.style.transform = `rotate(${wheelRotation}deg)`;
  setTimeout(() => {
    spinning = false;
    const pick = items[idx];
    document.getElementById('meal-result').textContent = `就吃「${pick}」吧！`;
    window.api.petSay({ text: `今天就吃「${pick}」吧~`, mood: 'happy' });
    // 归一化角度，避免数值无限增大
    wheelRotation = wheelRotation % 360;
    wheel.style.transition = 'none';
    wheel.style.transform = `rotate(${wheelRotation}deg)`;
    requestAnimationFrame(() => { wheel.style.transition = ''; });
  }, 4100);
});

document.getElementById('meal-custom-save').addEventListener('click', async () => {
  const raw = document.getElementById('meal-custom').value.trim();
  const type = document.getElementById('meal-type').value;
  const arr = raw ? raw.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean) : [];
  const s = await window.api.setMealMenu(type, arr);
  if (s && s.mealMenus) applyMealMenus(s.mealMenus);
  buildWheel();
  flash(document.getElementById('meal-custom-save'), '已应用');
});

function applyMealMenus(menus) {
  mealList = {
    lunch: (menus && menus.lunch) || DEFAULT_MEALS.lunch,
    dinner: (menus && menus.dinner) || DEFAULT_MEALS.dinner
  };
}

// ---------- 石头剪刀布 ----------
const RPS = { rock: '✊', scissors: '✌️', paper: '✋' };
const RPS_NAME = { rock: '石头', scissors: '剪刀', paper: '布' };
let rpsScore = { win: 0, lose: 0, draw: 0 };
function renderRpsScore() {
  document.getElementById('rps-score').textContent = `${rpsScore.win} 胜 ${rpsScore.lose} 负 ${rpsScore.draw} 平`;
}
document.querySelectorAll('.rps button').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const me = btn.dataset.rps;
    const keys = Object.keys(RPS);
    const ai = keys[Math.floor(Math.random() * 3)];
    let outcome;
    let res;
    if (me === ai) { outcome = 'draw'; res = '平局'; }
    else if (
      (me === 'rock' && ai === 'scissors') ||
      (me === 'scissors' && ai === 'paper') ||
      (me === 'paper' && ai === 'rock')
    ) { outcome = 'win'; res = '你赢了！🎉'; }
    else { outcome = 'lose'; res = '你输了~'; }
    document.getElementById('rps-result').textContent = `你 ${RPS[me]} vs ${RPS[ai]} 我 → ${res}`;
    const s = await window.api.recordRps(outcome);
    if (s && s.games) { rpsScore = s.games.rps; renderRpsScore(); }
  });
});

// ---------- 猜数字 ----------
let secret = Math.floor(Math.random() * 100) + 1;
let guessCount = 0;
document.getElementById('guess-btn').addEventListener('click', () => {
  const v = parseInt(document.getElementById('guess-input').value, 10);
  if (isNaN(v)) return;
  guessCount++;
  const r = document.getElementById('guess-result');
  if (v === secret) {
    r.textContent = `🎉 猜对了！答案是 ${secret}，用了 ${guessCount} 次。点「重开」再来一局~`;
    window.api.petSay({ text: `厉害！${guessCount} 次就猜中啦~`, mood: 'happy' });
  } else if (v < secret) {
    r.textContent = `大一点 ⬆️（第 ${guessCount} 次）`;
  } else {
    r.textContent = `小一点 ⬇️（第 ${guessCount} 次）`;
  }
});
document.getElementById('guess-reset').addEventListener('click', () => {
  secret = Math.floor(Math.random() * 100) + 1;
  guessCount = 0;
  document.getElementById('guess-input').value = '';
  document.getElementById('guess-result').textContent = '我想好了一个 1-100 的数字，来猜吧！';
});

// ---------- 主题 ----------
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  const dk = document.getElementById('theme-dark');
  if (dk) dk.checked = theme === 'dark';
}
document.getElementById('theme-toggle').addEventListener('click', async () => {
  const next = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  const s = await window.api.setTheme(next);
  applyTheme(s.theme);
});
document.getElementById('theme-dark').addEventListener('change', async (e) => {
  const s = await window.api.setTheme(e.target.checked ? 'dark' : 'light');
  applyTheme(s.theme);
});

// ---------- 统计 / 养成 ----------
function renderStats(stats) {
  const s = stats || { intimacy: 0, waterDone: 0, pomodoroDone: 0 };
  document.getElementById('st-intimacy').textContent = s.intimacy || 0;
  document.getElementById('st-water').textContent = s.waterDone || 0;
  document.getElementById('st-pomo').textContent = s.pomodoroDone || 0;
  const exp = (s.intimacy || 0) + (s.waterDone || 0) * 2 + (s.pomodoroDone || 0) * 5;
  const level = Math.floor(exp / 20) + 1;
  const pct = (exp % 20) / 20 * 100;
  document.getElementById('st-level').textContent = 'Lv.' + level;
  document.getElementById('level-fill').style.width = pct + '%';
  document.getElementById('level-text').textContent = `当前 Lv.${level}，再获得 ${20 - (exp % 20)} 点成长值升级~`;
}
document.getElementById('pet-praise').addEventListener('click', async () => {
  const stats = await window.api.addIntimacy(1);
  renderStats(stats);
  window.api.petSay({ text: '好舒服~ 最喜欢你啦！', mood: 'happy' });
});

// 动作触发
document.querySelectorAll('.act-btn').forEach((btn) => {
  btn.addEventListener('click', () => window.api.triggerAction(btn.dataset.act));
});

// ---------- 久坐 ----------
const sitEnabled = document.getElementById('sit-enabled');
const sitInterval = document.getElementById('sit-interval');
document.getElementById('sit-save').addEventListener('click', async () => {
  await window.api.setSit({ enabled: sitEnabled.checked, intervalMin: parseInt(sitInterval.value || '60', 10) });
  flash(document.getElementById('sit-save'), '已保存');
});
function renderSit(sit) {
  if (!sit) return;
  sitEnabled.checked = !!sit.enabled;
  setIfIdle(sitInterval, sit.intervalMin);
}

// ---------- 免打扰 ----------
const dndEnabled = document.getElementById('dnd-enabled');
const dndStart = document.getElementById('dnd-start');
const dndEnd = document.getElementById('dnd-end');
document.getElementById('dnd-save').addEventListener('click', async () => {
  await window.api.setDnd({ enabled: dndEnabled.checked, start: dndStart.value, end: dndEnd.value });
  flash(document.getElementById('dnd-save'), '已保存');
});
function renderDnd(dnd) {
  if (!dnd) return;
  dndEnabled.checked = !!dnd.enabled;
  setIfIdle(dndStart, dnd.start);
  setIfIdle(dndEnd, dnd.end);
}

// ---------- 开机自启 ----------
document.getElementById('autolaunch').addEventListener('change', async (e) => {
  await window.api.setAutoLaunch(e.target.checked);
});
document.getElementById('quiet-mode').addEventListener('change', async (e) => {
  await window.api.setQuiet(e.target.checked);
});

// PLACEHOLDER_POMO_GAMES

// ---------- 番茄钟 ----------
const pomoWork = document.getElementById('pomo-work');
const pomoBreak = document.getElementById('pomo-break');
const pomoRing = document.querySelector('.pomo-ring');
document.getElementById('pomo-cfg-save').addEventListener('click', async () => {
  const s = await window.api.setPomodoro({ workMin: parseInt(pomoWork.value, 10), breakMin: parseInt(pomoBreak.value, 10) });
  pomoWork.value = s.pomodoro.workMin; pomoBreak.value = s.pomodoro.breakMin;
  document.getElementById('pomo-time').textContent = String(s.pomodoro.workMin).padStart(2, '0') + ':00';
  flash(document.getElementById('pomo-cfg-save'), '已保存');
});
document.getElementById('pomo-start').addEventListener('click', () => window.api.pomodoroStart());
document.getElementById('pomo-stop').addEventListener('click', () => window.api.pomodoroStop());
window.api.onPomodoroTick((p) => {
  const m = Math.floor(p.remain / 60), s = p.remain % 60;
  document.getElementById('pomo-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  const phaseEl = document.getElementById('pomo-phase');
  pomoRing.classList.remove('run', 'break');
  if (!p.active) { phaseEl.textContent = '准备开始'; }
  else if (p.phase === 'work') { phaseEl.textContent = '专注中…'; pomoRing.classList.add('run'); }
  else { phaseEl.textContent = '休息中…'; pomoRing.classList.add('break'); }
});

// ---------- 记忆翻牌 ----------
const MEMORY_ICONS = ['🐱', '🤖', '🟢', '🍱', '💧', '🍅', '🎮', '⭐'];
let memFirst = null, memLock = false, memMatched = 0;
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function buildMemory() {
  const grid = document.getElementById('memory-grid');
  grid.innerHTML = '';
  memFirst = null; memLock = false; memMatched = 0;
  document.getElementById('memory-result').textContent = '翻开配对所有卡片~';
  const deck = shuffle(MEMORY_ICONS.concat(MEMORY_ICONS));
  deck.forEach((icon) => {
    const c = document.createElement('div');
    c.className = 'mcard';
    c.dataset.icon = icon;
    c.textContent = icon;
    c.addEventListener('click', () => flipCard(c));
    grid.appendChild(c);
  });
}
function flipCard(c) {
  if (memLock || c.classList.contains('open') || c.classList.contains('done')) return;
  c.classList.add('open');
  if (!memFirst) { memFirst = c; return; }
  if (memFirst.dataset.icon === c.dataset.icon) {
    memFirst.classList.add('done'); c.classList.add('done');
    memFirst = null; memMatched++;
    if (memMatched === MEMORY_ICONS.length) {
      document.getElementById('memory-result').textContent = '🎉 全部配对完成！';
      window.api.petSay({ text: '记忆力满分~', mood: 'happy' });
    }
  } else {
    memLock = true;
    const a = memFirst, b = c; memFirst = null;
    setTimeout(() => { a.classList.remove('open'); b.classList.remove('open'); memLock = false; }, 700);
  }
}
document.getElementById('memory-reset').addEventListener('click', buildMemory);

// ---------- 反应力测试 ----------
const reBox = document.getElementById('reaction-box');
let reState = 'idle', reStart = 0, reTimer = null;
reBox.addEventListener('click', () => {
  if (reState === 'idle') {
    reState = 'wait'; reBox.className = 'reaction-box wait'; reBox.textContent = '等待变绿…';
    const delay = 1000 + Math.floor(Math.random() * 3000);
    reTimer = setTimeout(() => {
      reState = 'ready'; reBox.className = 'reaction-box ready'; reBox.textContent = '点我！';
      reStart = performance.now();
    }, delay);
  } else if (reState === 'wait') {
    clearTimeout(reTimer); reState = 'idle'; reBox.className = 'reaction-box'; reBox.textContent = '太早了！点击重试';
    document.getElementById('reaction-result').textContent = '沉住气，等变绿再点~';
  } else if (reState === 'ready') {
    const ms = Math.round(performance.now() - reStart);
    reState = 'idle'; reBox.className = 'reaction-box'; reBox.textContent = '再来一次';
    document.getElementById('reaction-result').textContent = `反应速度：${ms} 毫秒 ${ms < 250 ? '⚡ 神速！' : ms < 400 ? '👍 不错' : '🐢 再练练'}`;
  }
});

// 喂水 / 喂猫粮
document.getElementById('feed-water-btn').addEventListener('click', async () => {
  await window.api.feedWater();
  flash(document.getElementById('feed-water-btn'), '喂好啦 💧');
});
document.getElementById('feed-food-btn').addEventListener('click', async () => {
  await window.api.feedFood();
  flash(document.getElementById('feed-food-btn'), '喂好啦 🍚');
});

// ---------- 初始化 ----------
function renderAll(s) {
  if (s.mealMenus) applyMealMenus(s.mealMenus);
  if (s.games && s.games.rps) { rpsScore = s.games.rps; renderRpsScore(); }
  renderForm(s.form);
  loadCustomPreview();
  renderWater(s.water);
  renderSit(s.sit);
  renderDnd(s.dnd);
  renderStats(s.stats);
  applyTheme(s.theme || 'light');
  if (s.pomodoro) { setIfIdle(pomoWork, s.pomodoro.workMin); setIfIdle(pomoBreak, s.pomodoro.breakMin); }
  document.getElementById('autolaunch').checked = !!s.autoLaunch;
  document.getElementById('quiet-mode').checked = !!s.quiet;
  renderMeetings(s.meetings);
  renderDdls(s.ddls);
}
async function init() {
  const s = await window.api.getState();
  renderAll(s);
  buildWheel();
  document.getElementById('meal-custom').value = currentMeals().join('，');
  buildMemory();
  if (s.genJob) setGenStatus(s.genJob); else refreshGenJob();
}
window.api.onStateUpdated((s) => renderAll(s));
init();


