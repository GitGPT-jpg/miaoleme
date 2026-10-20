const pet = document.getElementById('pet');
const face = pet.querySelector('.pet-face');
const bubble = document.getElementById('bubble');
const menu = document.getElementById('menu');

const FORMS = {
  cat:   { emoji: '🐱', name: '喵喵' },
  robot: { emoji: '🤖', name: '小铁' },
  slime: { emoji: '🟢', name: '咕叽' }
};

// 不同心情下的脸
const MOOD_FACE = {
  cat:   { normal: '🐱', happy: '😸', alert: '🙀' },
  robot: { normal: '🤖', happy: '🤖', alert: '⚠️' },
  slime: { normal: '🟢', happy: '😄', alert: '🟠' }
};

let currentForm = 'cat';
let bubbleTimer = null;

function applyForm(form) {
  currentForm = form;
  pet.className = `form-${form} mood-normal`;
  face.textContent = MOOD_FACE[form].normal;
}

function setMood(mood) {
  pet.classList.remove('mood-normal', 'mood-happy', 'mood-alert');
  pet.classList.add(`mood-${mood}`);
  face.textContent = (MOOD_FACE[currentForm] && MOOD_FACE[currentForm][mood]) || FORMS[currentForm].emoji;
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
    say('咕噜咕噜~ 补水成功！', 'happy');
  } else if (act === 'game') {
    window.api.openPanel();
    window.api.petSay({ text: '去控制台找「小游戏」吧~', mood: 'happy' });
  } else if (act === 'panel') {
    window.api.openPanel();
  }
});

// ---------- 来自主进程的事件 ----------
window.api.onFormChanged((form) => applyForm(form));
window.api.onPetSay((msg) => say(msg.text, msg.mood || 'normal'));

// 初始化
window.api.getState().then((s) => applyForm(s.form || 'cat'));
