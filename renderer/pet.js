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

// ---------- 鼠标穿透控制 ----------
// 初始穿透，forward:true 让渲染层仍能收到 mousemove 以检测悬停
window.api.setIgnoreMouse(true);
let ignoring = true;

function overInteractive(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return false;
  return el.closest('#pet') || el.closest('#menu') || el.closest('#bubble');
}

document.addEventListener('mousemove', (e) => {
  const over = overInteractive(e.clientX, e.clientY);
  if (over && ignoring) {
    ignoring = false;
    window.api.setIgnoreMouse(false);
  } else if (!over && !ignoring) {
    ignoring = true;
    window.api.setIgnoreMouse(true);
  }
});

// ---------- 悬浮显示快捷菜单 ----------
pet.addEventListener('mouseenter', () => menu.classList.remove('hidden'));
document.getElementById('stage').addEventListener('mouseleave', () => menu.classList.add('hidden'));

// 点击宠物：互动
let lastClickTs = 0;
pet.addEventListener('click', () => {
  // 拖动结束也会触发 click，这里用简单节流
  const now = Date.now();
  if (now - lastClickTs < 300) return;
  lastClickTs = now;
  const lines = ['嘿嘿~', '在的在的！', '需要我做点什么吗？', '最喜欢你啦~'];
  say(lines[Math.floor(Math.random() * lines.length)], 'happy');
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
