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
function renderWater(water) {
  waterEnabled.checked = !!water.enabled;
  waterInterval.value = water.intervalMin;
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

function renderMeetings(list) {
  const ul = document.getElementById('meet-list');
  ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<div class="empty">暂无会议</div>'; return; }
  const now = Date.now();
  list.forEach((m) => {
    const li = document.createElement('li');
    if (m.ts - now < 30 * 60 * 1000 && m.ts > now) li.classList.add('soon');
    li.innerHTML = `<div class="meta"><span class="t">${escapeHtml(m.title)}</span><span class="d">${fmt(m.ts)}</span></div>`;
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
  ul.innerHTML = '';
  if (!list.length) { ul.innerHTML = '<div class="empty">暂无 DDL</div>'; return; }
  const now = Date.now();
  list.forEach((d) => {
    const li = document.createElement('li');
    if (d.ts - now < 24 * 60 * 60 * 1000 && d.ts > now) li.classList.add('soon');
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

document.getElementById('meal-type').addEventListener('change', buildWheel);

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

document.getElementById('meal-custom-save').addEventListener('click', () => {
  const raw = document.getElementById('meal-custom').value.trim();
  const type = document.getElementById('meal-type').value;
  if (!raw) { mealList = DEFAULT_MEALS; }
  else {
    const arr = raw.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    if (arr.length >= 2) mealList = Object.assign({}, mealList, { [type]: arr });
  }
  buildWheel();
  flash(document.getElementById('meal-custom-save'), '已应用');
});

// ---------- 石头剪刀布 ----------
const RPS = { rock: '✊', scissors: '✌️', paper: '✋' };
const RPS_NAME = { rock: '石头', scissors: '剪刀', paper: '布' };
let rpsScore = { win: 0, lose: 0, draw: 0 };
document.querySelectorAll('.rps button').forEach((btn) => {
  btn.addEventListener('click', () => {
    const me = btn.dataset.rps;
    const keys = Object.keys(RPS);
    const ai = keys[Math.floor(Math.random() * 3)];
    let res;
    if (me === ai) { res = '平局'; rpsScore.draw++; }
    else if (
      (me === 'rock' && ai === 'scissors') ||
      (me === 'scissors' && ai === 'paper') ||
      (me === 'paper' && ai === 'rock')
    ) { res = '你赢了！🎉'; rpsScore.win++; }
    else { res = '你输了~'; rpsScore.lose++; }
    document.getElementById('rps-result').textContent = `你 ${RPS[me]} vs ${RPS[ai]} 我 → ${res}`;
    document.getElementById('rps-score').textContent = `${rpsScore.win} 胜 ${rpsScore.lose} 负 ${rpsScore.draw} 平`;
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

// ---------- 初始化 ----------
async function init() {
  const s = await window.api.getState();
  renderForm(s.form);
  renderWater(s.water);
  renderMeetings(s.meetings);
  renderDdls(s.ddls);
  buildWheel();
}
window.api.onStateUpdated((s) => {
  renderForm(s.form);
  renderWater(s.water);
  renderMeetings(s.meetings);
  renderDdls(s.ddls);
});
init();

