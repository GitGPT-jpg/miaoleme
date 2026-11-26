(function () {
  const B = window.CatBrain;
  const stage = document.getElementById('cat-stage');
  if (!B || !stage) return;
  const q = new URLSearchParams(location.search);
  const body = stage.querySelector('.cat-body');
  const names = ['sit', 'sit-tag', 'bored', 'hover', 'search', 'swipe', 'wash-look', 'wash-peek', 'watch-l', 'watch-r',
    'crouch', 'crouch-l', 'crouch-r', 'rub-l', 'rub-r', 'lie-1', 'lie-2', 'lie-3', 'loaf', 'loaf-ear', 'loaf-tail', 'loaf-sleep'];
  for (const w of B.WASH) names.push(w, w + '-ear');
  const imgs = {};
  for (const n of names) {
    const im = new Image();
    im.src = 'assets/cat-' + n + '.webp';
    im.alt = ''; im.decoding = 'async'; im.draggable = false;
    body.appendChild(im);
    imgs[n] = im;
  }
  const now = () => performance.now();
  const s = B.createBrain(now());
  let shown = null;
  const dbg = q.get('debug') === '1' && !q.has('rec') ? stage.appendChild(document.createElement('div')) : null;
  if (dbg) dbg.className = 'cat-debug';

  function show(r) {
    if (r.frame !== shown) {
      const ms = (r.fade || 0) + 'ms';
      const next = imgs[r.frame] || imgs.sit;
      if (shown && imgs[shown]) { imgs[shown].style.transitionDuration = ms; imgs[shown].classList.remove('on'); }
      next.style.transitionDuration = ms;
      next.classList.add('on');
      shown = r.frame;
    }
    body.classList.toggle('breathe', !!r.breathe);
    if (dbg) dbg.textContent = `${r.act} · ${r.frame} · 兴致 ${r.interest} · 习惯 ${r.habit.toFixed(2)}`;
  }

  function norm(x, y) {
    const b = stage.getBoundingClientRect();
    return { x: (x - b.left) / b.width, y: (y - b.top) / b.height };
  }

  // 键盘只计次数和节奏，不读字符；passive，不拦截任何默认行为（Tab、输入法照常）
  document.addEventListener('keydown', () => show(B.key(s, now())), { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    show(B.pointer(s, norm(e.clientX, e.clientY), now()));
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => show(B.pointer(s, null, now())));
  window.addEventListener('blur', () => show(B.pointer(s, null, now())));
  // 横向或斜向轻划算摸脸；明显竖向的是在滚动页面，猫不当回事
  let g = null;
  stage.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    g = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY, scroll: false } : null;
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!g || !t || g.scroll) return;
    const dx = Math.abs(t.clientX - g.x), dy = Math.abs(t.clientY - g.y);
    if (dy > 10 && dy > dx * 1.5) { g.scroll = true; return; }
    if (dx + dy > 6) show(B.touch(s, norm(g.x, g.y), now()));
  }, { passive: true });
  stage.addEventListener('touchend', () => { g = null; }, { passive: true });

  (function loop() { show(B.tick(s, now())); requestAnimationFrame(loop); })();
  window.__cat = { state: s, frame: () => shown };
})();
