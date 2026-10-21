// 食物寿命实验室 · 渲染层（数据与算法在 lib/lifebite.js）
(function () {
  const core = window.LifeBite;
  const rootEl = document.getElementById('lifebite-root');
  if (!core || !rootEl) return;

  const {FOODS, findFood, projection, summarize, toneOf, signed, STORAGE_KEY} = core;
  const $ = (sel, el) => (el || rootEl).querySelector(sel);

  function loadLast() {
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      return findFood(id) ? id : null;
    } catch (e) { return null; }
  }
  function saveLast(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* 存储不可用时忽略 */ }
  }

  // ---------- 结构 ----------
  const card = document.createElement('div');
  card.className = 'card lb-card';
  card.innerHTML = [
    '<h2>🧬 食物寿命实验室</h2>',
    '<p class="hint lb-intro">挑一样今天吃的，看看这口是赚了还是亏了（趣味估算，非医疗建议）。</p>',
    '<div class="lb-chips" id="lb-chips"></div>',
    '<div class="lb-detail" id="lb-detail" hidden>',
    '  <div class="lb-head">',
    '    <span class="lb-emo" id="lb-emo">🥑</span>',
    '    <div class="lb-title"><b id="lb-name"></b><small id="lb-desc"></small></div>',
    '    <div class="lb-kcal"><b id="lb-kcal">0</b><small>千卡 / 份</small></div>',
    '  </div>',
    '  <div class="lb-macros" id="lb-macros"></div>',
    '  <div class="lb-nutri" id="lb-nutri"></div>',
    '  <div class="lb-pills" id="lb-pills"></div>',
    '  <div class="lb-life">',
    '    <div class="lb-life-num" id="lb-life"></div>',
    '    <div class="lb-life-unit">分钟 / 份</div>',
    '    <div class="lb-verdict" id="lb-verdict"></div>',
    '    <div class="lb-explain" id="lb-explain"></div>',
    '  </div>',
    '  <div class="lb-proj">',
    '    <div><b id="lb-week">0</b><span>每周一份 · 一年</span></div>',
    '    <div><b id="lb-daily">0</b><span>每天一份 · 一年</span></div>',
    '  </div>',
    '  <p class="hint" id="lb-tip"></p>',
    '</div>'
  ].join('');
  rootEl.appendChild(card);

  // ---------- 候选食物 ----------
  const chipsEl = $('#lb-chips');
  FOODS.forEach((f) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lb-chip';
    btn.dataset.id = f.id;
    btn.innerHTML = `<span class="lb-chip-emo">${f.emo}</span><span class="lb-chip-name">${f.name}</span>` +
      `<span class="lb-chip-tag ${toneOf(f.life)}">${signed(f.life)} 分</span>`;
    btn.addEventListener('click', () => select(f.id));
    chipsEl.appendChild(btn);
  });

  // ---------- 详情 ----------
  function select(id) {
    const f = findFood(id);
    if (!f) return;
    saveLast(id);
    chipsEl.querySelectorAll('.lb-chip').forEach((c) => c.classList.toggle('on', c.dataset.id === id));

    $('#lb-detail').hidden = false;
    $('#lb-emo').textContent = f.emo;
    $('#lb-name').textContent = f.name;
    $('#lb-desc').textContent = f.desc;
    $('#lb-kcal').textContent = f.kcal;

    $('#lb-macros').innerHTML = f.macro.map((m) => `
      <div class="lb-macro">
        <span class="lb-macro-v">${m.v}</span>
        <span class="lb-macro-l">${m.l}</span>
        <span class="lb-macro-bar"><i style="width:${Math.max(2, Math.min(100, m.p))}%;background:${m.c}"></i></span>
      </div>`).join('');

    $('#lb-nutri').innerHTML = f.nutri.map((n) => `
      <div class="lb-nrow">
        <span class="lb-nrow-lab">${n[0]}</span>
        <span class="lb-nrow-bar"><i style="width:${Math.max(2, Math.min(100, n[1]))}%;background:${n[3]}"></i></span>
        <span class="lb-nrow-val">${n[2]}</span>
      </div>`).join('');

    $('#lb-pills').innerHTML = f.pills
      .map((p) => `<span class="lb-pill ${p[0]}">${p[0] === 'g' ? '✓' : '!'} ${p[1]}</span>`).join('');

    const tone = toneOf(f.life);
    const lifeEl = $('#lb-life');
    lifeEl.textContent = signed(f.life);
    lifeEl.className = 'lb-life-num ' + tone;
    $('#lb-verdict').textContent = f.verdict;
    $('#lb-verdict').className = 'lb-verdict ' + tone;
    $('#lb-explain').textContent = f.explain;

    const week = projection(f.life, 52);
    const daily = projection(f.life, 365);
    const weekEl = $('#lb-week');
    const dailyEl = $('#lb-daily');
    weekEl.textContent = week.text;
    dailyEl.textContent = daily.text;
    weekEl.className = week.sign;
    dailyEl.className = daily.sign;

    const s = summarize([id]);
    $('#lb-tip').textContent = s.minutes >= 0
      ? '单份就赚了，关键是长期频率——天天吃比偶尔吃影响大得多。'
      : '偶尔一次不用焦虑，真正要留意的是「高频」这类食物。';
    card.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }

  const last = loadLast();
  if (last) select(last);
})();
