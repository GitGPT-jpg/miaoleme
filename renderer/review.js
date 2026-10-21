// 每日复盘 · 渲染层（逻辑在 lib/review.js）
(function () {
  const core = window.ReviewCore;
  const rootEl = document.getElementById('review-root');
  if (!core || !rootEl) return;

  const {
    STORAGE_KEY, MOODS, MOOD_ICON, WEEK, dateKey, normalizeRecord, isMeaningful,
    streakOf, sortedKeys, summaryOf, mergeImport
  } = core;

  const $ = (sel) => rootEl.querySelector(sel);
  const FIELDS = [
    {key: 'done', title: '✅ 今日完成', tag: '重点成果', ph: '今天做成了哪些事？挑最重要的写～'},
    {key: 'gain', title: '🌱 今日收获', tag: '学习 & 成长', ph: '学到了什么？有什么新感悟？'},
    {key: 'prob', title: '⚠️ 问题与卡点', tag: '改进空间', ph: '遇到什么问题？下次怎么做得更好？'},
    {key: 'plan', title: '🎯 明日计划', tag: '先想一步', ph: '明天最想推进的一件事是什么？'}
  ];

  let data = load();
  let today = dateKey();
  let selStar = 0;
  let selMood = '';

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch (e) { return {}; }
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* 存储不可用时忽略 */ }
  }

  // ---------- 结构 ----------
  rootEl.innerHTML = [
    '<div class="card rv-card">',
    '  <h2>📝 今天你复盘了吗</h2>',
    '  <div class="rv-stats">',
    '    <div class="rv-stat"><b id="rv-streak">0</b><em>连续天数</em></div>',
    '    <div class="rv-stat"><b id="rv-total">0</b><em>累计复盘</em></div>',
    '    <div class="rv-stat" id="rv-today"><b>—</b><em>今日状态</em></div>',
    '  </div>',
    '  <div class="rv-date" id="rv-date"></div>',
    '  <div id="rv-fields"></div>',
    '  <div class="rv-meta">',
    '    <div class="rv-meta-item"><span class="rv-label">今日能量值</span><div class="rv-stars" id="rv-stars"></div></div>',
    '    <div class="rv-meta-item"><span class="rv-label">今日心情</span><div class="rv-moods" id="rv-moods"></div></div>',
    '  </div>',
    '  <input type="text" id="rv-quote" placeholder="给今天留句话？（可选）" />',
    '  <div class="rv-actions"><button id="rv-save">💾 保存今日复盘</button></div>',
    '  <p class="hint" id="rv-msg"></p>',
    '</div>',
    '<div class="card">',
    '  <div class="rv-list-head"><h2>🗓️ 复盘记录</h2>',
    '    <div class="rv-ops"><button class="mini" id="rv-export">导出</button><button class="mini" id="rv-import">导入</button></div>',
    '  </div>',
    '  <input type="file" id="rv-file" accept=".json" hidden />',
    '  <div id="rv-list"></div>',
    '</div>',
    '<p class="hint rv-foot">数据只存在本机。复盘不是为了责备自己，而是为了明天更笃定。</p>'
  ].join('');

  // 录入区
  const fieldsEl = $('#rv-fields');
  FIELDS.forEach((f) => {
    const wrap = document.createElement('div');
    wrap.className = 'rv-field';
    wrap.innerHTML = `<div class="rv-field-head"><b>${f.title}</b><span>${f.tag}</span></div>` +
      `<textarea id="rv-${f.key}" rows="2" placeholder="${f.ph}"></textarea>`;
    fieldsEl.appendChild(wrap);
  });

  // 星级
  const starsEl = $('#rv-stars');
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = '★';
    s.dataset.v = String(i);
    s.addEventListener('click', () => { selStar = i; paintStars(); });
    starsEl.appendChild(s);
  }
  function paintStars() {
    starsEl.querySelectorAll('span').forEach((s) => s.classList.toggle('on', Number(s.dataset.v) <= selStar));
  }

  // 心情
  const moodsEl = $('#rv-moods');
  MOODS.forEach((m) => {
    const b = document.createElement('span');
    b.className = 'rv-mood';
    b.textContent = m;
    b.dataset.v = m;
    b.addEventListener('click', () => { selMood = m; paintMoods(); });
    moodsEl.appendChild(b);
  });
  function paintMoods() {
    moodsEl.querySelectorAll('.rv-mood').forEach((b) => b.classList.toggle('on', b.dataset.v === selMood));
  }

  // ---------- 载入今日 ----------
  function fill(rec) {
    FIELDS.forEach((f) => { $('#rv-' + f.key).value = (rec && rec[f.key]) || ''; });
    $('#rv-quote').value = (rec && rec.quote) || '';
    selStar = (rec && rec.star) || 0;
    selMood = (rec && rec.mood) || '';
    paintStars();
    paintMoods();
  }

  // ---------- 统计 ----------
  function renderStats() {
    $('#rv-streak').textContent = streakOf(data, today);
    $('#rv-total').textContent = Object.keys(data).length;
    const st = $('#rv-today');
    st.classList.toggle('done', !!data[today]);
    st.querySelector('b').textContent = data[today] ? '已复盘' : '待复盘';
    const d = new Date();
    $('#rv-date').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`;
  }

  // ---------- 历史 ----------
  function renderList() {
    const listEl = $('#rv-list');
    listEl.innerHTML = '';
    const keys = sortedKeys(data);
    if (!keys.length) {
      listEl.innerHTML = '<p class="hint" style="margin-top:4px">还没有复盘记录，从今天开始吧 🌱</p>';
      return;
    }
    keys.forEach((k) => {
      const r = data[k];
      const item = document.createElement('div');
      item.className = 'rv-item';
      const top = document.createElement('div');
      top.className = 'rv-item-top';
      const date = document.createElement('b');
      date.textContent = k + (k === today ? ' · 今天' : '');
      const meta = document.createElement('span');
      meta.className = 'rv-item-meta';
      meta.textContent = (r.star ? '★'.repeat(r.star) : '') + (MOOD_ICON[r.mood] || '');
      const del = document.createElement('button');
      del.className = 'mini rv-del';
      del.textContent = '删除';
      del.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!window.confirm('确定删除 ' + k + ' 的复盘记录吗？')) return;
        delete data[k];
        persist();
        renderStats();
        renderList();
        if (k === today) fill(null);
      });
      top.appendChild(date);
      top.appendChild(meta);
      top.appendChild(del);

      const sum = document.createElement('div');
      sum.className = 'rv-item-sum';
      sum.textContent = summaryOf(r, 60);

      const detail = document.createElement('div');
      detail.className = 'rv-item-detail';
      const rows = [['✅ 完成', r.done], ['🌱 收获', r.gain], ['⚠️ 卡点', r.prob], ['🎯 计划', r.plan], ['📝 一句', r.quote]];
      rows.forEach(([lab, val]) => {
        if (!val) return;
        const p = document.createElement('p');
        const b = document.createElement('b');
        b.textContent = lab + '：';
        p.appendChild(b);
        p.appendChild(document.createTextNode(val));
        detail.appendChild(p);
      });

      item.appendChild(top);
      item.appendChild(sum);
      item.appendChild(detail);
      item.addEventListener('click', () => item.classList.toggle('open'));
      listEl.appendChild(item);
    });
  }

  // ---------- 保存 ----------
  $('#rv-save').addEventListener('click', async () => {
    const input = {quote: $('#rv-quote').value, star: selStar, mood: selMood, ts: Date.now()};
    FIELDS.forEach((f) => { input[f.key] = $('#rv-' + f.key).value; });
    const rec = normalizeRecord(input);
    if (!isMeaningful(rec)) {
      $('#rv-msg').textContent = '写点什么再保存嘛～哪怕一句话也值得记录！';
      return;
    }
    const isNewDay = !data[today];
    data[today] = rec;
    persist();
    renderStats();
    renderList();
    $('#rv-msg').textContent = isNewDay
      ? `保存啦！已连续复盘 ${streakOf(data, today)} 天 🎉`
      : '今天的复盘已更新 🎉';

    // 当天首次复盘给桌宠加亲密度并说句话（主进程未就绪时静默跳过）
    if (isNewDay && window.api) {
      if (typeof window.api.addIntimacy === 'function') {
        try { await window.api.addIntimacy(3); } catch (e) { /* 忽略 */ }
      }
      if (typeof window.api.petSay === 'function') {
        try { window.api.petSay({text: '今天也认真复盘啦，好棒~', mood: 'happy'}); } catch (e) { /* 忽略 */ }
      }
    }
  });

  // ---------- 导入 / 导出 ----------
  $('#rv-export').addEventListener('click', () => {
    if (!Object.keys(data).length) { $('#rv-msg').textContent = '还没有记录可以导出哦～'; return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '复盘记录_' + today + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#rv-import').addEventListener('click', () => $('#rv-file').click());
  $('#rv-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        const n = mergeImport(data, obj);
        if (!n) throw new Error('empty');
        persist();
        renderStats();
        renderList();
        $('#rv-msg').textContent = `导入成功，共 ${n} 条记录！`;
      } catch (e) {
        $('#rv-msg').textContent = '文件格式不对哦，请选择本工具导出的 JSON 文件。';
      }
      ev.target.value = '';
    };
    reader.readAsText(file, 'utf-8');
  });

  // ---------- 初始化 ----------
  fill(data[today]);
  renderStats();
  renderList();
})();
