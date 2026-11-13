/* =========================================================
   きんトモ — 画面と動き
   今回の範囲:ホーム画面 / トレーニング記録画面(+休憩・お祝い)
   データはこの端末のブラウザ内(localStorage)だけに保存します。
   アドレスの最後に ?demo を付けると、サンプル記録入りで表示します(保存はしません)。
   ========================================================= */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const layer = $('#layer');
  const DEMO = new URLSearchParams(location.search).has('demo');
  const KEY = 'kintomo.v1';
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 種目 ---------- */
  const PARTS = [
    { id: 'legs', name: 'あし・おしり', emoji: '🦵' },
    { id: 'chest', name: 'むね', emoji: '🙌' },
    { id: 'back', name: 'せなか', emoji: '🧍' },
    { id: 'abs', name: 'おなか', emoji: '🧘' },
    { id: 'arms', name: 'うで・かた', emoji: '💪' },
  ];
  const EXERCISES = [
    { id: 'squat', name: 'スクワット', part: 'legs', weight: false },
    { id: 'lunge', name: 'ランジ', part: 'legs', weight: false },
    { id: 'legpress', name: 'レッグプレス', part: 'legs', weight: true, w0: 30 },
    { id: 'pushup', name: 'うでたてふせ', part: 'chest', weight: false },
    { id: 'bench', name: 'ベンチプレス', part: 'chest', weight: true, w0: 20 },
    { id: 'backext', name: 'せなか反らし', part: 'back', weight: false },
    { id: 'latpull', name: 'ラットプルダウン', part: 'back', weight: true, w0: 20 },
    { id: 'crunch', name: 'ふっきん', part: 'abs', weight: false },
    { id: 'legraise', name: 'あし上げ ふっきん', part: 'abs', weight: false },
    { id: 'curl', name: 'ダンベルカール', part: 'arms', weight: true, w0: 3 },
    { id: 'shoulder', name: 'ショルダープレス', part: 'arms', weight: true, w0: 3 },
  ];
  // 最初から入っている種目 + 自分で作った種目
  const allEx = () => [...EXERCISES, ...data.custom];
  const getEx = (id) => allEx().find((e) => e.id === id) || { id, name: 'なくなった種目', part: 'legs', weight: false };
  const getPart = (id) => PARTS.find((p) => p.id === id) || PARTS[0];

  /* ---------- 日付 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((a - b) / 864e5);
  const YOUBI = '日月火水木金土';

  /* ---------- データ ---------- */
  const defaults = () => ({ logs: {}, menu: ['squat', 'pushup', 'crunch'], goal: 3, rest: 60, custom: [], badges: {} });

  function demoData() {
    const d = defaults();
    d.menu = ['squat', 'pushup', 'crunch', 'curl'];
    const t = today();
    const body = (arr) => arr.map((r) => ({ w: 0, r }));
    const day = (off, sq, pu, cr, curl) => {
      const o = { squat: body(sq), pushup: body(pu), crunch: body(cr) };
      if (curl) o.curl = curl.map(([w, r]) => ({ w, r }));
      d.logs[key(addDays(t, off))] = o;
    };
    day(-9, [8, 8, 8], [5, 5, 5], [8, 8, 8]);
    day(-7, [8, 8, 8], [5, 5, 5], [8, 8, 8]);
    day(-5, [10, 8, 8], [6, 5, 5], [10, 8, 8], [[3, 10], [3, 10]]);
    day(-3, [10, 10, 8], [6, 6, 5], [10, 10, 8], [[3, 10], [3, 10]]);
    day(-2, [10, 10, 10], [6, 6, 6], [10, 10, 10], [[4, 10], [4, 10]]);
    return d;
  }

  function load() {
    if (DEMO) return demoData();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* 保存が使えない環境でも動かす */ }
    return defaults();
  }
  function save() {
    if (DEMO) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 同上 */ }
  }

  let data = load();
  let screen = 'home';
  let rec = null;            // 記録画面でいま入力中の内容
  const targets = {};        // 種目ごとの「今日やるセット数」
  let rest = null;           // 休憩タイマー
  let hold = { t: 0, iv: 0, fired: false };
  let audio = null;
  let picker = null;         // 種目えらびのシート
  const review = { month: null, day: null, ex: null, week: null, point: null }; // ふりかえり画面の表示状態

  /* ---------- 記録の集計 ---------- */
  const setsOn = (k, exId) => (data.logs[k] && data.logs[k][exId]) || [];
  const todaySets = (exId) => setsOn(key(today()), exId);
  const trainedDays = () => Object.keys(data.logs)
    .filter((k) => Object.values(data.logs[k]).some((s) => s.length)).sort();

  function prevRecord(exId) {
    const tk = key(today());
    const ks = Object.keys(data.logs).filter((k) => k < tk && setsOn(k, exId).length).sort();
    if (!ks.length) return null;
    const k = ks[ks.length - 1];
    return { date: k, sets: data.logs[k][exId] };
  }
  function targetOf(exId) {
    if (!targets[exId]) {
      const p = prevRecord(exId);
      targets[exId] = p ? p.sets.length : 3;
    }
    return targets[exId];
  }

  // 継続日数:おやすみは2日まで「つづき」に数える(筋肉には休みも必要なので)
  function streakInfo() {
    const days = trainedDays();
    const t = today();
    const total = days.length;
    if (!total) return { state: 'new', days: 0, total, doneToday: false };
    let start = parse(days[days.length - 1]);
    const gap = diffDays(t, start);
    if (gap > 3) return { state: 'restart', days: 0, total, doneToday: false };
    for (let i = days.length - 2; i >= 0; i--) {
      const d = parse(days[i]);
      if (diffDays(start, d) <= 3) start = d; else break;
    }
    return { state: 'alive', days: diffDays(t, start) + 1, total, doneToday: gap === 0, gap };
  }

  function weekInfo() {
    const t = today();
    const dow = (t.getDay() + 6) % 7; // 月曜はじまり
    const mon = addDays(t, -dow);
    const set = new Set(trainedDays());
    const days = Array.from({ length: 7 }, (_, i) => ({
      label: '月火水木金土日'[i],
      done: set.has(key(addDays(mon, i))),
      isToday: i === dow,
      future: i > dow,
    }));
    return { days, count: days.filter((d) => d.done).length };
  }

  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

  // これまでの合計(ふりかえり・バッジで使う)
  function totals() {
    const days = trainedDays();
    let sets = 0, reps = 0;
    const kinds = new Set();
    days.forEach((k) => Object.keys(data.logs[k]).forEach((id) => {
      const ss = data.logs[k][id];
      if (!ss.length) return;
      kinds.add(id);
      sets += ss.length;
      reps += ss.reduce((a, s) => a + s.r, 0);
    }));
    // いちばん長く続いた日数
    let best = 0, start = null, prev = null;
    days.forEach((k) => {
      const d = parse(k);
      if (!prev || diffDays(d, prev) > 3) start = d;
      prev = d;
      best = Math.max(best, diffDays(d, start) + 1);
    });
    const st = streakInfo();
    if (st.state === 'alive') best = Math.max(best, st.days);
    // 週の目標を達成した週の数
    const perWeek = {};
    days.forEach((k) => { const m = key(mondayOf(parse(k))); perWeek[m] = (perWeek[m] || 0) + 1; });
    const goalWeeks = Object.values(perWeek).filter((c) => c >= data.goal).length;
    // 自己ベストを更新した回数(種目ごと・日ごとに1回と数える)
    let pbs = 0;
    kinds.forEach((id) => {
      let maxW = -1, maxR = -1;
      days.forEach((k) => {
        const ss = setsOn(k, id);
        if (!ss.length) return;
        const w = Math.max(...ss.map((s) => s.w));
        const body = ss.filter((s) => s.w === 0);
        const r = body.length ? Math.max(...body.map((s) => s.r)) : -1;
        if (maxW >= 0) {
          if (w > 0 && w > maxW) pbs++;
          else if (r >= 0 && maxR >= 0 && r > maxR) pbs++;
        }
        maxW = Math.max(maxW, w);
        maxR = Math.max(maxR, r);
      });
    });
    return { days: days.length, sets, reps, kinds: kinds.size, bestStreak: best, goalWeeks, pbs };
  }

  /* ---------- 表示の小道具 ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => String(Math.round(n * 10) / 10);
  const setText = (s) => (s.w > 0 ? `${fmtNum(s.w)}kg × ` : '') + `${s.r}回`;
  function setsText(sets) {
    const same = sets.every((s) => s.w === sets[0].w && s.r === sets[0].r);
    if (same) return `${setText(sets[0])} × ${sets.length}セット`;
    const sameW = sets.every((s) => s.w === sets[0].w);
    if (sameW) return (sets[0].w > 0 ? `${fmtNum(sets[0].w)}kg × ` : '') + sets.map((s) => s.r).join('・') + '回';
    return sets.map(setText).join('、');
  }
  const dateText = (k) => { const d = parse(k); return `${d.getMonth() + 1}/${d.getDate()}(${YOUBI[d.getDay()]})`; };
  function agoText(k) {
    const n = diffDays(today(), parse(k));
    return n === 1 ? 'きのう' : n === 2 ? 'おととい' : `${n}日前`;
  }

  const ICONS = {
    home: '<path d="M3.5 11.5 12 4l8.5 7.5V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    medal: '<circle cx="12" cy="14.5" r="6"/><path d="M8.6 9.4 6 3.5h4l2 3.8 2-3.8h4l-2.6 5.9"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    party: '<path d="M4 20l4.5-12 7.5 7.5z"/><path d="M14 4v2M19 5l-1.5 1.5M20 10h-2M13.5 9.5c1-1 1-2.500 0-3.500"/>',
  };
  const icon = (name, size = 24, sw = 2.4) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  const FLAME = 'M32 4C36 16 50 22 50 38C50 50 42 58 32 58C22 58 14 50 14 38C14 30 18 26 21 21C22 27 25 29 27 29C25 20 27 10 32 4Z';
  const flame = (size, color = 'currentColor') =>
    `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><path d="${FLAME}" fill="${color}"/></svg>`;
  // 応援キャラ「メラ」:小さな炎。継続(=炎を消さない)の象徴
  const mascot = (size, happy = false) => `
    <svg class="mascot" width="${size}" height="${size}" viewBox="0 0 64 64" role="img" aria-label="応援キャラクターのメラ">
      <path d="${FLAME}" fill="#E11D2A"/>
      <path d="M32 26C37 33 43 37 43 45C43 52 38 56 32 56C26 56 21 52 21 45C21 37 27 33 32 26Z" fill="#FFC83D"/>
      <circle cx="22.500" cy="47.500" r="2.600" fill="#FF8A1F" opacity=".6"/>
      <circle cx="41.500" cy="47.500" r="2.600" fill="#FF8A1F" opacity=".6"/>
      ${happy
        ? '<path d="M25 43.500q2.200-2.600 4.400 0M34.600 43.500q2.200-2.600 4.400 0" fill="none" stroke="#2A1B18" stroke-width="2" stroke-linecap="round"/><path d="M28 47.500q4 5 8 0z" fill="#2A1B18"/>'
        : '<circle cx="27.200" cy="43" r="2.200" fill="#2A1B18"/><circle cx="36.800" cy="43" r="2.200" fill="#2A1B18"/><path d="M28.500 47.500q3.500 3.600 7 0" fill="none" stroke="#2A1B18" stroke-width="2" stroke-linecap="round"/>'}
    </svg>`;

  /* ---------- ホーム画面 ---------- */
  function cheerMessage(st, wk) {
    if (st.state === 'new') return 'はじめまして、メラだよ!今日からいっしょに、ゆるっと続けていこうね。';
    if (st.state === 'restart') return 'おかえり!待ってたよ。また今日から、いっしょに始めよう。';
    if (st.doneToday) return '今日もおつかれさま!しっかり休むのも、トレーニングのうちだよ。';
    const left = data.goal - wk.count;
    if (left === 1) return 'あと1回で今週の目標達成!今日、いっしょにやってみない?';
    const list = [
      '来てくれてうれしい!今日は1セットだけでも、じゅうぶん花マルだよ。',
      'いい調子!無理せず、できるぶんだけ いっしょにやろう。',
      '今日のあなたも、きっとできる。まずは1セットから!',
      'ちょっと体を動かすと、気分もすっきりするよ。',
    ];
    return list[today().getDate() % list.length];
  }

  function viewHome() {
    const st = streakInfo();
    const wk = weekInfo();
    const now = new Date();
    const h = now.getHours();
    const hello = h < 4 ? 'こんばんは' : h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日(${YOUBI[now.getDay()]})`;
    const dark = document.documentElement.dataset.theme === 'dark';

    let label = 'つづけて', num = st.days, unit = '日目', sub = 'おやすみの日も、つづきのうち。';
    if (st.state === 'new') { label = 'ようこそ'; num = 1; sub = '今日が、さいしょの一歩。'; }
    else if (st.state === 'restart') { label = 'また、ここから'; num = 1; sub = `これまでに 合計${st.total}日 がんばったよ。`; }
    else if (st.doneToday) sub = '今日のぶん、できたね!';
    else if (st.gap === 3) sub = '今日すこし動くと、継続がつながるよ。';

    const week = wk.days.map((d) => {
      const cls = [d.done ? 'done' : '', d.isToday ? 'today' : '', d.future ? 'future' : '', !d.done && !d.isToday && !d.future ? 'rest' : ''].join(' ');
      const say = d.done ? 'できた' : d.isToday ? 'これから' : d.future ? '' : 'おやすみ';
      return `<li class="${cls}"><span class="lbl">${d.isToday ? '今日' : d.label}</span><span class="dot" role="img" aria-label="${d.label}曜日 ${say}">${d.done ? icon('check', 20, 3.2) : ''}</span></li>`;
    }).join('');

    const left = Math.max(0, data.goal - wk.count);
    const segs = Array.from({ length: data.goal }, (_, i) =>
      `<span class="seg ${i < wk.count ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.12}s">${i < wk.count ? icon('check', 16, 3.4) : ''}</span>`).join('');
    const goalNote = left === 0
      ? '<strong>今週の目標、達成!</strong> すごい、やったね!'
      : wk.count === 0 ? 'まずは1回。自分のペースでいこう。'
        : `<strong>あと${left}回</strong>で達成!いいペースだよ。`;

    const items = data.menu.map((id) => {
      const ex = getEx(id), part = getPart(ex.part);
      const done = todaySets(id);
      const prev = prevRecord(id);
      const last = done.length
        ? `<span class="last ok">今日 ${done.length}セット できた!</span>`
        : prev ? `<span class="last">前回 ${esc(setsText(prev.sets))}</span>`
          : '<span class="last">はじめての種目</span>';
      return `<li><button class="menu-item" data-act="open-ex" data-ex="${id}">
        <span class="tile ${done.length ? 'done' : ''}">${done.length ? icon('check', 28, 3) : part.emoji}</span>
        <span class="info"><span class="name">${esc(ex.name)}</span><br>${last}</span>
        <span class="chev">${icon('chev', 22)}</span>
      </button></li>`;
    }).join('');

    return `
    <div class="screen screen-home in">
      <header class="home-top">
        <div>
          <div class="brand">${flame(22)}<span>きんトモ</span></div>
          <p class="home-date">${dateStr}</p>
        </div>
        <button class="icon-btn" data-act="theme" aria-label="${dark ? '明るい画面にする' : '暗い画面にする'}">${icon(dark ? 'sun' : 'moon', 24)}</button>
      </header>

      <section class="cheer" aria-label="今日の応援メッセージ">
        ${mascot(64)}
        <div class="bubble"><p class="hello">${hello}!</p><p class="msg">${cheerMessage(st, wk)}</p></div>
      </section>

      <section class="hero" aria-label="継続日数">
        <div class="hero-flame">${flame(170, '#fff')}</div>
        <span class="hero-label">${flame(20, '#FFC83D')}${label}</span>
        <div class="hero-num"><b id="streak-num" data-to="${num}">${num}</b><span>${unit}</span></div>
        <p class="hero-sub">${sub}</p>
        <ol class="week" aria-label="今週のようす">${week}</ol>
      </section>

      <section class="card goal">
        <div class="goal-head">
          <span class="goal-title">今週の目標<span class="chip">週${data.goal}回</span></span>
          <span class="goal-count"><b>${wk.count}</b> / ${data.goal}回</span>
        </div>
        <div class="segs" role="progressbar" aria-valuemin="0" aria-valuemax="${data.goal}" aria-valuenow="${Math.min(wk.count, data.goal)}" aria-label="今週の達成回数">${segs}</div>
        <p class="goal-note">${goalNote}</p>
      </section>

      <section class="card menu">
        <div class="menu-head">
          <h2>今日のメニュー</h2>
          <button class="link-btn" data-act="menu-edit">${icon('edit', 18)}かえる</button>
        </div>
        <p class="hint">やりたい種目をタップしても始められるよ</p>
        <ul class="menu-list">${items}</ul>
      </section>
    </div>

    <div class="fixed-bar cta-bar">
      <button class="btn-primary" data-act="start">${icon('play', 26)}${st.doneToday ? 'もうすこし やる' : 'トレーニングをはじめる'}</button>
    </div>
    ${tabbar('home')}`;
  }

  function tabbar(active) {
    const tabs = [['home', 'home', 'ホーム'], ['review', 'calendar', 'ふりかえり'], ['badges', 'medal', 'バッジ'], ['goal', 'target', '目標']];
    return `<nav class="fixed-bar tabbar" aria-label="メニュー">${tabs.map(([id, ic, name]) =>
      `<button class="tab ${id === active ? 'on' : ''}" data-act="tab" data-tab="${id}" ${id === active ? 'aria-current="page"' : ''}><span class="ic">${icon(ic, 24)}</span>${name}</button>`).join('')}</nav>`;
  }

  const choice = (act, val, text, on) =>
    `<button class="choice ${on ? 'on' : ''}" data-act="${act}" data-val="${val}" aria-pressed="${on}">${icon('check', 18, 3.2)}<span>${text}</span></button>`;

  /* ---------- 目標とせってい ---------- */
  const themePref = () => {
    try { const t = localStorage.getItem('kintomo.theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch (e) { return 'auto'; }
  };
  function setTheme(pref) {
    try {
      if (pref === 'auto') localStorage.removeItem('kintomo.theme'); else localStorage.setItem('kintomo.theme', pref);
    } catch (e) { /* 保存できなくても、いまの表示は切りかえる */ }
    const dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  function viewGoal() {
    const wk = weekInfo();
    const g = data.goal;
    const advice = g <= 2 ? 'ゆったりペース。まずは「続けること」が いちばん大事!'
      : g <= 4 ? 'ちょうどいいペース。体を休ませる日もとれて、おすすめだよ。'
        : g <= 6 ? 'しっかりペース。おやすみの日も忘れずにね。'
          : '毎日ペース。つかれた日は、休んでだいじょうぶ。';
    const left = g - wk.count;
    const now = left <= 0 ? `今週は もう <b>${wk.count}回</b>。目標達成だね!` : `今週は いま <b>${wk.count}回</b>。あと${left}回で達成だよ。`;
    const rests = [[30, '30秒'], [60, '1分'], [90, '1分30秒'], [120, '2分'], [180, '3分']];
    const pref = themePref();
    return `
    <div class="screen screen-tab in">
      <header class="page-top"><h1>目標とせってい</h1><p>無理のない目標が、いちばん続くよ</p></header>

      <section class="card">
        <h2 class="card-title">週に何回やる?</h2>
        <div class="stepper goal-stepper">
          <button class="step-btn" data-act="goal-step" data-dir="-1" aria-label="目標を1回へらす" ${g <= 1 ? 'disabled' : ''}>${icon('minus', 32, 3)}</button>
          <p class="goal-big" aria-live="polite"><span>週</span><b>${g}</b><span>回</span></p>
          <button class="step-btn" data-act="goal-step" data-dir="1" aria-label="目標を1回ふやす" ${g >= 7 ? 'disabled' : ''}>${icon('plus', 32, 3)}</button>
        </div>
        <div class="advice">${mascot(44)}<p>${advice}</p></div>
        <p class="goal-now">${now}</p>
      </section>

      <section class="card">
        <h2 class="card-title">休憩の長さ</h2>
        <p class="hint">セットとセットの間に、ひと息つく時間</p>
        <div class="choice-row">${rests.map(([s, t]) => choice('rest-set', s, t, data.rest === s)).join('')}</div>
      </section>

      <section class="card">
        <h2 class="card-title">画面の色</h2>
        <div class="choice-row">
          ${choice('theme-set', 'light', '明るい', pref === 'light')}
          ${choice('theme-set', 'dark', '暗い', pref === 'dark')}
          ${choice('theme-set', 'auto', 'スマホの設定に合わせる', pref === 'auto')}
        </div>
      </section>
    </div>
    ${tabbar('goal')}`;
  }

  /* ---------- ふりかえり ---------- */
  function dayDetail(k) {
    const d = parse(k);
    const head = `${d.getMonth() + 1}月${d.getDate()}日(${YOUBI[d.getDay()]})`;
    const log = data.logs[k] || {};
    const ids = Object.keys(log).filter((id) => log[id].length);
    if (!ids.length) {
      const note = k === key(today()) ? '今日はまだ記録なし。できそうなら、1セットだけでも!' : 'この日は おやすみ。休むのも大事だよ。';
      return `<div class="day-box"><h3>${head}</h3><p class="day-rest">${note}</p></div>`;
    }
    return `<div class="day-box"><h3>${head}</h3><ul>${ids.map((id) => {
      const ex = getEx(id);
      return `<li><span class="d-name">${getPart(ex.part).emoji} ${esc(ex.name)}</span><span class="d-val">${esc(setsText(log[id]))}</span></li>`;
    }).join('')}</ul></div>`;
  }

  // 週ごとの回数(直近8週)。1色の棒+目標の点線。数字は棒の上に直接書く
  function weekChart() {
    const mon = mondayOf(today());
    const set = new Set(trainedDays());
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const start = addDays(mon, -7 * (7 - i));
      let c = 0;
      for (let j = 0; j < 7; j++) if (set.has(key(addDays(start, j)))) c++;
      return { start, c, cur: i === 7 };
    });
    const W = 300, top = 30, base = 150, step = W / 8, bw = 20;
    const max = Math.max(data.goal, ...weeks.map((w) => w.c), 1);
    const y = (v) => base - (base - top) * (v / max);
    const gy = y(data.goal);
    const hit = weeks.filter((w) => w.c >= data.goal).length;
    const bars = weeks.map((w, i) => {
      const x = step * i + (step - bw) / 2, cx = step * i + step / 2;
      const label = w.cur ? '今週' : `${w.start.getMonth() + 1}/${w.start.getDate()}`;
      const h = base - y(w.c);
      const bar = w.c > 0
        ? `<path class="ch-bar" d="M${x} ${base}V${base - h + 4}q0-4 4-4h${bw - 8}q4 0 4 4V${base}z"/>`
        : `<rect class="ch-zero" x="${x}" y="${base - 3}" width="${bw}" height="3" rx="1.5"/>`;
      return `<g><title>${w.cur ? '今週' : label + 'からの週'}:${w.c}回</title>${bar}
        <text class="ch-val" x="${cx}" y="${base - h - 7}" text-anchor="middle">${w.c}</text>
        ${i % 2 ? `<text class="ch-x ${w.cur ? 'cur' : ''}" x="${cx}" y="${base + 18}" text-anchor="middle">${label}${w.cur ? '' : '〜'}</text>` : ''}</g>`;
    }).join('');
    return `
      <p class="chart-lead">この8週間で、目標(週${data.goal}回)を <strong>${hit}週</strong> 達成!</p>
      <svg class="chart" viewBox="0 0 ${W} 176" role="img" aria-label="週ごとのトレーニング回数。${weeks.map((w) => w.c + '回').join('、')}">
        <line class="ch-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>
        ${bars}
        <line class="ch-goal" x1="0" x2="${W}" y1="${gy}" y2="${gy}"/>
      </svg>
      <p class="chart-legend"><span class="dash" aria-hidden="true"></span>点線が 目標のライン(週${data.goal}回)</p>`;
  }

  // 種目ごとの成長(その日のいちばん良い記録)。点をタップすると日付と数字が出る
  function growthChart(exId) {
    const ks = Object.keys(data.logs).filter((k) => setsOn(k, exId).length).sort();
    const useW = ks.some((k) => setsOn(k, exId).some((s) => s.w > 0));
    const unit = useW ? 'kg' : '回';
    const pts = ks.map((k) => ({ k, v: Math.max(...setsOn(k, exId).map((s) => (useW ? s.w : s.r))) })).slice(-12);
    const n = pts.length;
    const sel = review.point != null && review.point < n ? review.point : n - 1;
    const W = 300, left = 22, right = 30, top = 34, base = 132;
    const vs = pts.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs);
    const x = (i) => (n === 1 ? W / 2 : left + (W - left - right) * (i / (n - 1)));
    const y = (v) => (hi === lo ? (top + base) / 2 : base - (base - top) * ((v - lo) / (hi - lo)));
    const line = n > 1 ? `<path class="ch-line" d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('')}"/>` : '';
    const dots = pts.map((p, i) => {
      const show = i === sel || i === 0 || i === n - 1;
      return `<g data-act="rv-pt" data-i="${i}" class="ch-pt ${i === sel ? 'sel' : ''}">
        <title>${dateText(p.k)}:${fmtNum(p.v)}${unit}</title>
        <circle class="ch-hit" cx="${x(i)}" cy="${y(p.v)}" r="16"/>
        <circle class="ch-dot" cx="${x(i)}" cy="${y(p.v)}" r="${i === sel ? 7 : 5}"/>
        ${show ? `<text class="ch-val" x="${x(i)}" y="${y(p.v) - 13}" text-anchor="middle">${fmtNum(p.v)}${i === sel ? unit : ''}</text>` : ''}
      </g>`;
    }).join('');
    const diff = n > 1 ? Math.round((pts[n - 1].v - pts[0].v) * 10) / 10 : 0;
    const lead = n < 2 ? '記録が増えると、ここに成長の線がのびていくよ。'
      : diff > 0 ? `はじめより <strong>+${fmtNum(diff)}${unit}</strong> のびたよ!すごい!`
        : diff === 0 ? 'いいペースで続けられているね。' : '体調に合わせて調整できているね。その調子!';
    return `
      <p class="chart-lead">${lead}</p>
      <p class="chart-cap">${useW ? 'その日 いちばん重かった重さ' : '1セットで いちばん多かった回数'}</p>
      <svg class="chart" viewBox="0 0 ${W} 164" role="img" aria-label="${esc(getEx(exId).name)}の記録。${pts.map((p) => fmtNum(p.v) + unit).join('、')}">
        <line class="ch-base" x1="0" x2="${W}" y1="${base + 14}" y2="${base + 14}"/>
        ${line}${dots}
        <text class="ch-x" x="${n === 1 ? W / 2 : left}" y="${base + 32}" text-anchor="${n === 1 ? 'middle' : 'start'}">${dateText(pts[0].k)}</text>
        ${n > 1 ? `<text class="ch-x" x="${W - right + 26}" y="${base + 32}" text-anchor="end">${dateText(pts[n - 1].k)}</text>` : ''}
      </svg>
      <p class="chart-read">${icon('check', 16, 3.2)}${dateText(pts[sel].k)}:<b>${fmtNum(pts[sel].v)}${unit}</b>${n > 1 ? '<span>(点をタップで ほかの日も見られるよ)</span>' : ''}</p>`;
  }

  function viewReview() {
    const t = today(), tk = key(t);
    const days = trainedDays();
    const set = new Set(days);
    if (!review.month) {
      review.month = new Date(t.getFullYear(), t.getMonth(), 1);
      const inMonth = days.filter((k) => k.slice(0, 7) === tk.slice(0, 7));
      review.day = inMonth.length ? inMonth[inMonth.length - 1] : null;
    }
    const y = review.month.getFullYear(), mo = review.month.getMonth();
    const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
    const dim = new Date(y, mo + 1, 0).getDate();
    const isCur = y === t.getFullYear() && mo === t.getMonth();
    let count = 0;
    const cells = Array.from({ length: lead }, () => '<span class="cal-cell empty"></span>');
    for (let d = 1; d <= dim; d++) {
      const k = key(new Date(y, mo, d));
      const done = set.has(k), future = k > tk, sel = review.day === k;
      if (done) count++;
      cells.push(`<button class="cal-cell ${done ? 'done' : ''} ${k === tk ? 'today' : ''} ${sel ? 'sel' : ''}" data-act="cal-day" data-day="${k}" ${future ? 'disabled' : ''} aria-pressed="${sel}" aria-label="${mo + 1}月${d}日${k === tk ? ' 今日' : ''} ${done ? 'トレーニングした日' : future ? 'これから' : 'おやすみ'}"><span class="cal-num">${d}</span><span class="cal-dot">${done ? icon('check', 16, 3.6) : ''}</span></button>`);
    }
    const tot = totals();
    const monthNote = count ? `この月は <strong>${count}日</strong> がんばったよ!` : isCur ? '今月はこれから。まずは1日、やってみよう。' : 'この月は ゆっくり休んだ月だね。';

    const logged = [...new Set([...data.menu, ...days.flatMap((k) => Object.keys(data.logs[k]))])]
      .filter((id) => days.some((k) => setsOn(k, id).length));
    if (!logged.includes(review.ex)) { review.ex = logged[0] || null; review.point = null; }

    const graphs = logged.length ? `
      <section class="card">
        <h2 class="card-title">週ごとの回数</h2>
        ${weekChart()}
      </section>
      <section class="card">
        <h2 class="card-title">種目ごとの成長</h2>
        <nav class="ex-tabs in-card" aria-label="種目をえらぶ">${logged.map((id) =>
          `<button class="ex-chip ${id === review.ex ? 'on' : ''}" data-act="rv-ex" data-ex="${id}" ${id === review.ex ? 'aria-current="true"' : ''}>${esc(getEx(id).name)}</button>`).join('')}</nav>
        ${growthChart(review.ex)}
      </section>` : `
      <section class="card empty-note">${mascot(72)}<p>記録すると、ここに<br>成長のグラフが出てくるよ。</p></section>`;

    return `
    <div class="screen screen-tab in">
      <header class="page-top"><h1>ふりかえり</h1><p>ここまでの がんばりを、ながめてみよう</p></header>

      <div class="stats">
        <div class="stat"><b>${tot.days}</b><span>日(合計)</span></div>
        <div class="stat"><b>${tot.sets}</b><span>セット</span></div>
        <div class="stat"><b>${tot.reps}</b><span>回(合計)</span></div>
      </div>

      <section class="card cal">
        <div class="cal-head">
          <button class="icon-btn flat" data-act="cal-move" data-dir="-1" aria-label="前の月へ">${icon('back', 24, 2.8)}</button>
          <h2>${y}年 ${mo + 1}月</h2>
          <button class="icon-btn flat" data-act="cal-move" data-dir="1" aria-label="次の月へ" ${isCur ? 'disabled' : ''}>${icon('chev', 24, 2.8)}</button>
        </div>
        <p class="cal-note">${monthNote}</p>
        <div class="cal-week" aria-hidden="true">${[...'月火水木金土日'].map((c) => `<span>${c}</span>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
        <p class="cal-legend"><span class="lg"><span class="cal-dot on">${icon('check', 14, 3.6)}</span>やった日</span><span class="lg"><span class="cal-dot ring"></span>今日</span></p>
        ${review.day ? dayDetail(review.day) : '<p class="cal-tip">日にちをタップすると、その日の記録が見られるよ</p>'}
      </section>
      ${graphs}
    </div>
    ${tabbar('review')}`;
  }

  /* ---------- バッジ ---------- */
  const BADGES = [
    { id: 'first', g: 0, em: '🌱', name: 'はじめの一歩', key: 'days', to: 1, unit: '日' },
    { id: 'k5', g: 0, em: '🌈', name: '5種類に挑戦', key: 'kinds', to: 5, unit: '種類' },
    { id: 'st3', g: 1, em: '🔥', name: '3日つづいた', key: 'bestStreak', to: 3, unit: '日' },
    { id: 'st7', g: 1, em: '🔥', name: '1週間つづいた', key: 'bestStreak', to: 7, unit: '日' },
    { id: 'st14', g: 1, em: '🔥', name: '2週間つづいた', key: 'bestStreak', to: 14, unit: '日' },
    { id: 'st30', g: 1, em: '🔥', name: '30日つづいた', key: 'bestStreak', to: 30, unit: '日' },
    { id: 'st60', g: 1, em: '🔥', name: '60日つづいた', key: 'bestStreak', to: 60, unit: '日' },
    { id: 'st100', g: 1, em: '👑', name: '100日 達成', key: 'bestStreak', to: 100, unit: '日' },
    { id: 'gw1', g: 2, em: '🎯', name: '週の目標 達成', key: 'goalWeeks', to: 1, unit: '週' },
    { id: 'gw4', g: 2, em: '🎯', name: '目標達成 4週', key: 'goalWeeks', to: 4, unit: '週' },
    { id: 'gw10', g: 2, em: '🎯', name: '目標達成 10週', key: 'goalWeeks', to: 10, unit: '週' },
    { id: 'pb1', g: 3, em: '🏅', name: '自己ベスト更新', key: 'pbs', to: 1, unit: '回' },
    { id: 'pb5', g: 3, em: '🏅', name: '自己ベスト 5回', key: 'pbs', to: 5, unit: '回' },
    { id: 'pb10', g: 3, em: '🏆', name: '自己ベスト 10回', key: 'pbs', to: 10, unit: '回' },
    { id: 'd5', g: 4, em: '📅', name: '合計 5日', key: 'days', to: 5, unit: '日' },
    { id: 'd10', g: 4, em: '📅', name: '合計 10日', key: 'days', to: 10, unit: '日' },
    { id: 'd30', g: 4, em: '📅', name: '合計 30日', key: 'days', to: 30, unit: '日' },
    { id: 'd50', g: 4, em: '📅', name: '合計 50日', key: 'days', to: 50, unit: '日' },
    { id: 'd100', g: 4, em: '🎖️', name: '合計 100日', key: 'days', to: 100, unit: '日' },
    { id: 'r100', g: 5, em: '💪', name: '合計 100回', key: 'reps', to: 100, unit: '回' },
    { id: 'r500', g: 5, em: '💪', name: '合計 500回', key: 'reps', to: 500, unit: '回' },
    { id: 'r1000', g: 5, em: '💪', name: '合計 1000回', key: 'reps', to: 1000, unit: '回' },
    { id: 'r5000', g: 5, em: '💪', name: '合計 5000回', key: 'reps', to: 5000, unit: '回' },
    { id: 'r10000', g: 5, em: '⭐', name: '合計 1万回', key: 'reps', to: 10000, unit: '回' },
  ];
  const BADGE_GROUPS = [
    ['はじめの一歩', ''],
    ['つづけた日数', 'おやすみ2日までは「つづき」に数えるよ'],
    ['週の目標', '週の目標回数を達成した週の数'],
    ['自己ベスト', '前の自分をこえた回数'],
    ['合計の日数', 'トレーニングした日の合計'],
    ['合計の回数', 'これまでにやった回数の合計'],
  ];

  // まだ持っていないバッジのうち、条件を満たしたものを「ゲット」にする
  function syncBadges() {
    const s = totals();
    const fresh = [];
    BADGES.forEach((b) => {
      if (!data.badges[b.id] && s[b.key] >= b.to) { data.badges[b.id] = key(today()); fresh.push(b); }
    });
    if (fresh.length) save();
    return fresh;
  }

  function viewBadges() {
    const s = totals();
    const got = BADGES.filter((b) => data.badges[b.id]).length;
    const next = BADGES.filter((b) => !data.badges[b.id])
      .map((b) => ({ b, p: Math.min(1, s[b.key] / b.to) }))
      .sort((a, c) => c.p - a.p)[0];
    const nextBox = next ? `
      <section class="card next-badge">
        <p class="nb-label">つぎのバッジ</p>
        <div class="nb-row">
          <span class="medal small">${next.b.em}</span>
          <div class="nb-info">
            <p class="nb-name">${next.b.name}</p>
            <p class="nb-left">あと <b>${fmtNum(next.b.to - s[next.b.key])}${next.b.unit}</b>!</p>
          </div>
        </div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${next.b.to}" aria-valuenow="${s[next.b.key]}" aria-label="つぎのバッジまでの進み具合"><span style="width:${Math.max(4, next.p * 100)}%"></span></div>
        <p class="nb-prog">${fmtNum(s[next.b.key])} / ${next.b.to}${next.b.unit}</p>
      </section>` : `
      <section class="card empty-note">${mascot(72, true)}<p>ぜんぶのバッジを あつめたね!<br>ほんとうに すごい!</p></section>`;

    const groups = BADGE_GROUPS.map(([title, hint], gi) => `
      <section class="badge-group">
        <h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ''}
        <ul class="badges">${BADGES.filter((b) => b.g === gi).map((b) => {
          const have = !!data.badges[b.id];
          return `<li class="badge ${have ? 'got' : 'locked'}">
            <span class="medal" role="img" aria-label="${have ? 'ゲットずみ' : 'まだ'}">${have ? b.em : icon('lock', 26)}${have ? `<span class="medal-ck">${icon('check', 12, 4)}</span>` : ''}</span>
            <span class="b-name">${b.name}</span>
            <span class="b-state">${have ? 'ゲット!' : `あと${fmtNum(b.to - s[b.key])}${b.unit}`}</span>
          </li>`;
        }).join('')}</ul>
      </section>`).join('');

    return `
    <div class="screen screen-tab in">
      <header class="page-top"><h1>バッジ</h1><p>がんばった「しるし」が、ここに集まるよ</p></header>
      <section class="badge-count" aria-label="あつめたバッジの数">
        ${mascot(60, got > 0)}
        <p>あつめたバッジ<br><b>${got}</b><span> / ${BADGES.length}こ</span></p>
      </section>
      ${nextBox}
      ${groups}
    </div>
    ${tabbar('badges')}`;
  }

  /* ---------- 記録画面 ---------- */
  function sessionList() {
    const tk = key(today());
    const logged = Object.keys(data.logs[tk] || {}).filter((id) => todaySets(id).length);
    return [...new Set([...data.menu, ...logged, ...(rec ? [rec.exId] : [])])];
  }
  function nextExercise() {
    const list = sessionList();
    const i = list.indexOf(rec.exId);
    const order = [...list.slice(i + 1), ...list.slice(0, i)];
    return order.find((id) => todaySets(id).length < targetOf(id)) || null;
  }

  function openExercise(exId) {
    const ex = getEx(exId);
    const done = todaySets(exId);
    const prev = prevRecord(exId);
    let base;
    if (prev && prev.sets[done.length]) base = prev.sets[done.length];
    else if (done.length) base = done[done.length - 1];
    else if (prev) base = prev.sets[prev.sets.length - 1];
    else base = { w: ex.weight ? ex.w0 : 0, r: 10 };
    rec = { exId, w: base.w, r: base.r, showWeight: ex.weight || base.w > 0, fresh: false };
    targetOf(exId);
    screen = 'record';
    render();
  }

  function startTraining() {
    const first = data.menu.find((id) => todaySets(id).length < targetOf(id)) || data.menu[0];
    openExercise(first);
  }

  // 数字のすぐ横に単位(回・kg)が来るよう、入力らんの幅を文字数に合わせる
  const fitWidth = (text) => `${Math.max(1, String(text).length) + 0.4}ch`;

  function stepper(field, label, unit, val) {
    return `
    <div class="field">
      <div class="field-label">${label}</div>
      <div class="stepper">
        <button class="step-btn" data-step="${field}" data-dir="-1" aria-label="${label}を1へらす">${icon('minus', 32, 3)}</button>
        <label class="step-val">
          <input id="in-${field}" data-field="${field}" inputmode="${field === 'w' ? 'decimal' : 'numeric'}" value="${fmtNum(val)}" style="width:${fitWidth(fmtNum(val))}" maxlength="5" autocomplete="off" aria-label="${label}">
          <span class="unit">${unit}</span>
        </label>
        <button class="step-btn" data-step="${field}" data-dir="1" aria-label="${label}を1ふやす">${icon('plus', 32, 3)}</button>
      </div>
    </div>`;
  }

  function viewRecord() {
    const ex = getEx(rec.exId), part = getPart(ex.part);
    const done = todaySets(rec.exId);
    const prev = prevRecord(rec.exId);
    const target = targetOf(rec.exId);
    const complete = done.length >= target;
    const n = done.length + 1;
    const next = nextExercise();
    const anyToday = sessionList().some((id) => todaySets(id).length);

    const chips = sessionList().map((id) => {
      const e = getEx(id), fin = todaySets(id).length >= targetOf(id);
      return `<button class="ex-chip ${id === rec.exId ? 'on' : ''}" data-act="open-ex" data-ex="${id}" ${id === rec.exId ? 'aria-current="true"' : ''}>${fin ? icon('check', 18, 3.2) : ''}${esc(e.name)}</button>`;
    }).join('') + `<button class="ex-chip add" data-act="pick">${icon('plus', 18, 3)}ほかの種目</button>`;

    const prevBox = prev
      ? `<span class="tag">前回</span><div><p class="val">${esc(setsText(prev.sets))}</p><p class="when">${agoText(prev.date)}・${dateText(prev.date)}<br>同じ数字を入れておいたよ</p></div>`
      : `<span class="tag">はじめて</span><div><p class="val">まずは軽めで だいじょうぶ</p><p class="when">できた回数を そのまま記録しよう</p></div>`;

    const pips = Array.from({ length: Math.max(target, done.length) }, (_, i) => {
      if (i < done.length) return `<span class="pip done ${rec.fresh && i === done.length - 1 ? 'fresh' : ''}" role="img" aria-label="${i + 1}セット目 できた">${icon('check', 18, 3.4)}</span>`;
      if (i === done.length) return `<span class="pip now" role="img" aria-label="${i + 1}セット目 いまここ">${i + 1}</span>`;
      return `<span class="pip" role="img" aria-label="${i + 1}セット目 これから">${i + 1}</span>`;
    }).join('');

    const body = complete
      ? `<div class="complete">
          <div class="stamp">${icon('check', 44, 3.4)}</div>
          <p class="big">${done.length}セット やりきった!</p>
          <p>${esc(ex.name)}、おつかれさま。</p>
          <button class="btn-ghost" data-act="more-set">${icon('plus', 20, 3)}もう1セットやる</button>
        </div>`
      : `<div class="set-head">
          <p class="set-now"><b>${n}</b>セット目</p>
          <div class="pips">${pips}</div>
        </div>
        ${rec.showWeight ? stepper('w', '重さ', 'kg', rec.w) + (ex.weight ? '' : '<p class="field-hint">0kg なら「自分の体重だけ」で記録するよ</p>') : ''}
        ${stepper('r', '回数', '回', rec.r)}
        ${rec.showWeight ? '' : '<button class="add-weight" data-act="add-weight">+ おもりを使うとき</button>'}`;

    const log = done.length ? `
      <section class="log">
        <h2>今日の記録</h2>
        <ul>${done.map((s, i) => `<li><span class="ck">${icon('check', 16, 3.4)}</span><span class="n">${i + 1}セット目</span><span class="v">${setText(s)}</span>${i === done.length - 1 ? '<button class="undo" data-act="undo-set">とりけす</button>' : ''}</li>`).join('')}</ul>
      </section>` : '';

    let primary;
    if (!complete) primary = `<button class="btn-primary" data-act="log-set">${icon('check', 28, 3.2)}${n}セット目 できた!</button>`;
    else if (next) primary = `<button class="btn-primary" data-act="open-ex" data-ex="${next}">つぎは「${esc(getEx(next).name)}」${icon('chev', 24, 3)}</button>`;
    else primary = `<button class="btn-primary" data-act="finish">${icon('party', 26)}今日のトレーニング おわり!</button>`;
    const secondary = anyToday && (!complete || next) ? '<button class="btn-text" data-act="finish">今日はここまでにする</button>' : '';

    return `
    <div class="screen screen-record">
      <header class="rec-top">
        <button class="icon-btn" data-act="home" aria-label="ホームにもどる">${icon('back', 26, 2.8)}</button>
        <div><p class="rec-part">${part.emoji} ${part.name}</p><h1>${esc(ex.name)}</h1></div>
      </header>
      <nav class="ex-tabs" aria-label="今日の種目">${chips}</nav>
      <section class="prev" aria-label="前回の記録">${prevBox}</section>
      <section class="card set-card">${body}</section>
      ${log}
    </div>
    <div class="fixed-bar action-bar">${primary}${secondary}</div>`;
  }

  /* ---------- 入力 ---------- */
  const LIMIT = { w: [0, 500], r: [1, 999] };
  const clamp = (field, v) => Math.min(LIMIT[field][1], Math.max(LIMIT[field][0], v));
  function stepField(field, dir) {
    const cur = rec[field];
    const nextVal = clamp(field, (dir > 0 ? Math.floor(cur + 1e-9) : Math.ceil(cur - 1e-9)) + dir);
    if (nextVal === cur) return;
    rec[field] = nextVal;
    const input = $('#in-' + field);
    if (input) {
      input.value = fmtNum(nextVal);
      input.style.width = fitWidth(input.value);
      input.classList.remove('bump'); void input.offsetWidth; input.classList.add('bump');
    }
    buzz(8);
  }
  function readField(input, fix) {
    const field = input.dataset.field;
    // 全角で打たれた数字(例:１０)も半角に直して読む
    const raw = input.value.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9.]/g, '');
    let v = parseFloat(raw);
    if (!isFinite(v)) v = fix ? LIMIT[field][0] : rec[field];
    v = clamp(field, field === 'r' ? Math.round(v) : Math.round(v * 10) / 10);
    rec[field] = v;
    if (fix) input.value = fmtNum(v);
    input.style.width = fitWidth(input.value);
  }
  function stopHold() { clearTimeout(hold.t); clearInterval(hold.iv); hold.t = hold.iv = 0; }

  /* ---------- 記録する ---------- */
  function isBest(exId, w, r) {
    const all = Object.keys(data.logs).flatMap((k) => setsOn(k, exId));
    if (!all.length) return false;
    if (w > 0) return w > Math.max(...all.map((s) => s.w));
    const body = all.filter((s) => s.w === 0);
    return body.length > 0 && r > Math.max(...body.map((s) => s.r));
  }

  function logSet() {
    document.querySelectorAll('.step-val input').forEach((i) => readField(i, true));
    const tk = key(today());
    const best = isBest(rec.exId, rec.w, rec.r);
    if (!data.logs[tk]) data.logs[tk] = {};
    if (!data.logs[tk][rec.exId]) data.logs[tk][rec.exId] = [];
    data.logs[tk][rec.exId].push({ w: rec.w, r: rec.r });
    save();
    unlockAudio();
    buzz(20);

    const done = todaySets(rec.exId).length;
    const target = targetOf(rec.exId);
    rec.fresh = true;
    render(true);
    rec.fresh = false;

    if (best) { toast('🎉 自己ベスト更新!すごい!'); confetti(50); }
    if (done < target) openRest(done + 1);
    else if (!best) toast(['ナイス!やりきったね', 'いい感じ!おつかれさま', 'さすが!その調子'][done % 3]);
  }

  function undoSet() {
    const tk = key(today());
    const arr = setsOn(tk, rec.exId);
    if (!arr.length) return;
    arr.pop();
    if (!arr.length) delete data.logs[tk][rec.exId];
    if (!Object.keys(data.logs[tk]).length) delete data.logs[tk];
    save();
    render(true);
    toast('ひとつ もどしたよ');
  }

  /* ---------- 休憩タイマー ---------- */
  const RING = 2 * Math.PI * 92;
  function openRest(nextSet) {
    closeRest();
    rest = { end: Date.now() + data.rest * 1000, total: data.rest };
    layer.innerHTML = `
      <div class="scrim"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="休憩タイマー">
        <h2>ナイス!ひと息いれよう</h2>
        <p class="sub">つぎは ${nextSet}セット目。息をととのえてね</p>
        <div class="ring">
          <svg width="210" height="210" viewBox="0 0 210 210" aria-hidden="true">
            <circle class="track" cx="105" cy="105" r="92" fill="none" stroke-width="16"/>
            <circle class="bar" id="rest-bar" cx="105" cy="105" r="92" fill="none" stroke-width="16" stroke-linecap="round" stroke-dasharray="${RING}" stroke-dashoffset="0"/>
          </svg>
          <div class="num" role="timer" aria-live="off"><b id="rest-num">${data.rest}</b><span>秒</span></div>
        </div>
        <div class="rest-ctl">
          <button class="btn-ghost" data-act="rest-add" data-sec="-10" aria-label="休憩を10秒へらす">${icon('minus', 18, 3)}10秒</button>
          <button class="btn-ghost" data-act="rest-add" data-sec="10" aria-label="休憩を10秒ふやす">${icon('plus', 18, 3)}10秒</button>
        </div>
        <button class="btn-primary" data-act="rest-skip">休憩おわり、つぎへ</button>
      </section>`;
    rest.iv = setInterval(tickRest, 200);
    tickRest();
  }
  function tickRest() {
    if (!rest) return;
    const ms = rest.end - Date.now();
    const left = Math.max(0, Math.ceil(ms / 1000));
    const num = $('#rest-num'), bar = $('#rest-bar');
    if (num) num.textContent = left;
    if (bar) bar.style.strokeDashoffset = RING * (1 - Math.max(0, Math.min(1, ms / (rest.total * 1000))));
    if (ms <= 0) { closeRest(); beep(); buzz([120, 80, 120]); toast('休憩おわり!つぎのセット、いこう'); }
  }
  function closeRest() {
    if (rest) clearInterval(rest.iv);
    rest = null;
    layer.innerHTML = '';
  }

  /* ---------- 種目をえらぶ ---------- */
  // mode: 'record' = いまからやる種目をえらぶ / 'menu' = 今日のメニューに入れる種目をえらぶ
  function openPicker(mode) {
    picker = { mode, adding: false, form: { part: 'legs', weight: false } };
    renderPicker(true);
  }
  function closePicker() {
    picker = null;
    layer.innerHTML = '';
    if (screen === 'home') render(true);
  }
  function renderPicker(first) {
    const old = $('.sheet');
    const top = old ? old.scrollTop : 0;
    const menuMode = picker.mode === 'menu';
    const list = allEx().filter((e) => !e.hidden);
    const groups = PARTS.map((p) => {
      const items = list.filter((e) => e.part === p.id);
      if (!items.length) return '';
      return `
        <div class="pick-group">
          <h3>${p.emoji} ${p.name}</h3>
          <div class="pick-list ${menuMode ? 'one' : ''}">${items.map((e) => {
            const on = menuMode && data.menu.includes(e.id);
            return `<div class="pick-cell">
              <button class="pick-item ${on ? 'on' : ''} ${e.custom ? 'mine' : ''}" data-act="${menuMode ? 'menu-toggle' : 'pick-ex'}" data-ex="${e.id}" ${menuMode ? `aria-pressed="${on}"` : ''}>
                ${menuMode ? `<span class="pick-ck">${on ? icon('check', 16, 3.6) : ''}</span>` : ''}<span>${esc(e.name)}</span>
              </button>
              ${e.custom ? `<button class="pick-del" data-act="custom-del" data-ex="${e.id}" aria-label="${esc(e.name)}を一覧から消す">${icon('close', 14, 3.2)}</button>` : ''}
            </div>`;
          }).join('')}</div>
        </div>`;
    }).join('');

    const form = picker.adding ? `
      <div class="custom-form">
        <h3>自分で種目をつくる</h3>
        <label class="f-label" for="cf-name">種目のなまえ</label>
        <input id="cf-name" class="text-input" maxlength="20" placeholder="例:かかと上げ" autocomplete="off" enterkeyhint="done">
        <p class="f-label">体のどこを使う?</p>
        <div class="choice-row">${PARTS.map((p) => choice('cf-part', p.id, `${p.emoji} ${p.name}`, picker.form.part === p.id)).join('')}</div>
        <p class="f-label">おもりは使う?</p>
        <div class="choice-row">
          ${choice('cf-weight', '0', '使わない(自分の体重)', !picker.form.weight)}
          ${choice('cf-weight', '1', '使う(ダンベルなど)', picker.form.weight)}
        </div>
        <button class="btn-primary" data-act="custom-save">${icon('plus', 24, 3)}この種目を追加する</button>
        <button class="btn-text" data-act="custom-cancel">やめる</button>
      </div>` : `
      <button class="btn-ghost wide" data-act="custom-open">${icon('plus', 20, 3)}自分で種目をつくる</button>`;

    layer.innerHTML = `
      <div class="scrim" data-act="close-sheet"></div>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="種目リスト">
        <h2>${menuMode ? '今日のメニューをえらぶ' : 'どの種目をやる?'}</h2>
        <p class="sub">${menuMode ? 'タップで「入れる/はずす」を切りかえ' : '体の場所ごとに ならんでいるよ'}</p>
        ${groups}
        ${form}
        ${picker.adding ? '' : menuMode
          ? '<button class="btn-primary sheet-ok" data-act="close-sheet">これでOK</button>'
          : '<button class="btn-text" data-act="close-sheet">とじる</button>'}
      </section>`;
    if (!first) {
      const sh = $('.sheet');
      sh.classList.add('noanim'); $('.scrim').classList.add('noanim');
      sh.scrollTop = top;
    }
  }

  function toggleMenu(id) {
    const i = data.menu.indexOf(id);
    if (i >= 0) {
      if (data.menu.length === 1) { toast('メニューには 1つ以上 入れておこう'); return; }
      data.menu.splice(i, 1);
    } else data.menu.push(id);
    save();
    renderPicker();
  }

  function saveCustom() {
    const input = $('#cf-name');
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) { toast('種目のなまえを入れてね'); input.focus(); return; }
    if (allEx().some((e) => !e.hidden && e.name === name)) { toast('同じなまえの種目が、もうあるよ'); input.focus(); return; }
    // 前に消した同じなまえの種目があれば、それを元にもどす(昔の記録とつながる)
    let ex = data.custom.find((e) => e.name === name);
    if (ex) { ex.hidden = false; ex.part = picker.form.part; ex.weight = picker.form.weight; }
    else {
      ex = { id: 'c' + Date.now().toString(36), name, part: picker.form.part, weight: picker.form.weight, w0: 5, custom: true };
      data.custom.push(ex);
    }
    if (picker.mode === 'menu') {
      if (!data.menu.includes(ex.id)) data.menu.push(ex.id);
      save();
      picker.adding = false;
      renderPicker();
      toast(`「${name}」をメニューに追加したよ`);
    } else {
      save();
      picker = null;
      layer.innerHTML = '';
      openExercise(ex.id);
      toast(`「${name}」を追加したよ`);
    }
  }

  function deleteCustom(id) {
    const ex = data.custom.find((e) => e.id === id);
    if (!ex) return;
    ex.hidden = true;
    data.menu = data.menu.filter((m) => m !== id);
    if (!data.menu.length) data.menu = ['squat'];
    save();
    renderPicker();
    toast(`「${ex.name}」を一覧から消したよ(記録は残るよ)`);
  }

  /* ---------- お祝い ---------- */
  function bestsToday() {
    const tk = key(today());
    const out = [];
    Object.keys(data.logs[tk] || {}).forEach((id) => {
      const now = setsOn(tk, id);
      const before = Object.keys(data.logs).filter((k) => k < tk).flatMap((k) => setsOn(k, id));
      if (!now.length || !before.length) return;
      const maxW = Math.max(...now.map((s) => s.w)), oldW = Math.max(...before.map((s) => s.w));
      if (maxW > 0 && maxW > oldW) { out.push(`${getEx(id).name} ${fmtNum(maxW)}kg`); return; }
      const nb = now.filter((s) => s.w === 0), ob = before.filter((s) => s.w === 0);
      if (nb.length && ob.length) {
        const r = Math.max(...nb.map((s) => s.r));
        if (r > Math.max(...ob.map((s) => s.r))) out.push(`${getEx(id).name} ${r}回`);
      }
    });
    return out;
  }

  function finish() {
    closeRest();
    const tk = key(today());
    const log = data.logs[tk] || {};
    const ids = Object.keys(log).filter((id) => log[id].length);
    if (!ids.length) { screen = 'home'; render(); return; }
    const sets = ids.reduce((a, id) => a + log[id].length, 0);
    const reps = ids.reduce((a, id) => a + log[id].reduce((b, s) => b + s.r, 0), 0);
    const st = streakInfo(), wk = weekInfo();
    const wins = [];
    wins.push(['🔥', st.days <= 1 ? '今日が1日目。いいスタート!' : `つづけて ${st.days}日目!`]);
    if (wk.count === data.goal) wins.push(['🎯', `今週の目標(週${data.goal}回)達成!`]);
    else if (wk.count < data.goal) wins.push(['🎯', `今週 ${wk.count}回目。目標まで あと${data.goal - wk.count}回`]);
    else wins.push(['🎯', `今週 ${wk.count}回目。目標をこえたね!`]);
    bestsToday().forEach((b) => wins.push(['🏅', `自己ベスト更新! ${b}`]));
    syncBadges().forEach((b) => wins.push([b.em, `新しいバッジ「${b.name}」ゲット!`]));
    const leads = ['今日のあなた、最高にかっこいいよ。', '一歩ずつ、ちゃんと前に進んでるね。', 'やりきったね。その積み重ねが力になるよ。'];

    layer.innerHTML = `
      <section class="party" role="dialog" aria-modal="true" aria-label="トレーニング完了">
        ${mascot(130, true)}
        <h1>おつかれさま!</h1>
        <p class="lead">${leads[sets % leads.length]}</p>
        <div class="stats">
          <div class="stat"><b>${ids.length}</b><span>種目</span></div>
          <div class="stat"><b>${sets}</b><span>セット</span></div>
          <div class="stat"><b>${reps}</b><span>回(合計)</span></div>
        </div>
        <div class="wins">${wins.map(([em, t]) => `<p class="win"><span class="em">${em}</span><span>${esc(t)}</span></p>`).join('')}</div>
        <button class="btn-primary" data-act="party-close">ホームにもどる</button>
      </section>`;
    $('#toast').classList.remove('show');
    confetti(150);
    buzz([30, 60, 30, 60, 80]);
    chime();
  }

  /* ---------- 紙吹雪・音・ふるえ・ひとこと ---------- */
  function confetti(n) {
    if (REDUCED) return;
    const c = $('#confetti'), ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ['#E11D2A', '#FF8A1F', '#FFC83D', '#FF6B6B', '#FFB3A7'];
    const ps = Array.from({ length: n }, () => ({
      x: W / 2 + (Math.random() - 0.5) * Math.min(W, 480) * 0.3,
      y: H * 0.38,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 17 - 5,
      s: 7 + Math.random() * 8,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.4,
      col: cols[Math.floor(Math.random() * cols.length)],
      round: Math.random() < 0.4,
    }));
    const LIFE = 3200;
    const t0 = performance.now();
    const myRun = (confetti.run = (confetti.run || 0) + 1);
    function frame(t) {
      const el = t - t0;
      ctx.clearRect(0, 0, W, H);
      if (el >= LIFE || myRun !== confetti.run) return;
      ctx.globalAlpha = Math.min(1, (LIFE - el) / 800);
      ps.forEach((p) => {
        p.vy += 0.45; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 6.28); ctx.fill(); }
        else ctx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66);
        ctx.restore();
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function unlockAudio() {
    try {
      if (!audio) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); }
      if (audio && audio.state === 'suspended') audio.resume();
    } catch (e) { /* 音が出せなくても問題なし */ }
  }
  function tone(freq, at, len) {
    if (!audio) return;
    try {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      const t = audio.currentTime + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(audio.destination);
      o.start(t); o.stop(t + len + 0.02);
    } catch (e) { /* 同上 */ }
  }
  const beep = () => { tone(660, 0, 0.18); tone(880, 0.2, 0.3); };
  const chime = () => { tone(523, 0, 0.2); tone(659, 0.12, 0.2); tone(784, 0.24, 0.2); tone(1047, 0.36, 0.45); };
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* 同上 */ } };

  let toastTimer = 0;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------- 画面を描く ---------- */
  function render(keepScroll) {
    stopHold();
    if (screen === 'home') app.innerHTML = viewHome();
    else if (screen === 'record') app.innerHTML = viewRecord();
    else if (screen === 'review') app.innerHTML = viewReview();
    else if (screen === 'goal') app.innerHTML = viewGoal();
    else {
      const fresh = syncBadges();
      app.innerHTML = viewBadges();
      if (fresh.length) { toast(`🎉 新しいバッジ「${fresh[fresh.length - 1].name}」ゲット!`); confetti(60); }
    }
    if (keepScroll) app.firstElementChild.classList.remove('in'); // 同じ画面の描き直しでは、登場の動きをくり返さない
    if (!keepScroll) window.scrollTo(0, 0);
    if (screen === 'home') countUp($('#streak-num'));
    if (screen === 'record') {
      const on = $('.ex-chip.on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }
  function countUp(el) {
    if (!el || REDUCED) return;
    const to = Number(el.dataset.to);
    if (!(to > 1)) return;
    const t0 = performance.now(), dur = 700;
    el.textContent = '1';
    (function f(t) {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = Math.max(1, Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(f);
    })(t0);
    setTimeout(() => { el.textContent = to; }, dur + 400); // 画面が裏にあっても最後は正しい数字に
  }

  function toggleTheme() {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    render(true);
  }
  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (themePref() === 'auto') { setTheme('auto'); render(true); } };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
  }

  /* ---------- 操作を受けとる ---------- */
  document.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) {
      if (hold.fired) { hold.fired = false; return; }
      stepField(step.dataset.step, Number(step.dataset.dir));
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (act === 'start') startTraining();
    else if (act === 'open-ex') { closeRest(); openExercise(el.dataset.ex); }
    else if (act === 'home' || act === 'party-close') { closeRest(); screen = 'home'; render(); }
    else if (act === 'tab') { screen = el.dataset.tab; render(); }
    else if (act === 'theme') toggleTheme();
    else if (act === 'log-set') logSet();
    else if (act === 'undo-set') undoSet();
    else if (act === 'more-set') { targets[rec.exId] = todaySets(rec.exId).length + 1; render(true); }
    else if (act === 'add-weight') { rec.showWeight = true; render(true); }
    else if (act === 'finish') finish();
    else if (act === 'pick') openPicker('record');
    else if (act === 'menu-edit') openPicker('menu');
    else if (act === 'pick-ex') { picker = null; layer.innerHTML = ''; openExercise(el.dataset.ex); }
    else if (act === 'close-sheet') closePicker();
    else if (act === 'menu-toggle') toggleMenu(el.dataset.ex);
    else if (act === 'custom-open') { picker.adding = true; renderPicker(); const n = $('#cf-name'); n.scrollIntoView({ block: 'center' }); n.focus(); }
    else if (act === 'custom-cancel') { picker.adding = false; renderPicker(); }
    else if (act === 'custom-save') saveCustom();
    else if (act === 'custom-del') deleteCustom(el.dataset.ex);
    else if (act === 'cf-part' || act === 'cf-weight') {
      if (act === 'cf-part') picker.form.part = el.dataset.val; else picker.form.weight = el.dataset.val === '1';
      el.parentNode.querySelectorAll('.choice').forEach((c) => {
        c.classList.toggle('on', c === el);
        c.setAttribute('aria-pressed', c === el);
      });
    }
    else if (act === 'goal-step') {
      data.goal = Math.min(7, Math.max(1, data.goal + Number(el.dataset.dir)));
      save(); render(true);
    }
    else if (act === 'rest-set') { data.rest = Number(el.dataset.val); save(); render(true); toast('休憩の長さを かえたよ'); }
    else if (act === 'theme-set') { setTheme(el.dataset.val); render(true); }
    else if (act === 'cal-move') {
      review.month = new Date(review.month.getFullYear(), review.month.getMonth() + Number(el.dataset.dir), 1);
      review.day = null;
      render(true);
    }
    else if (act === 'cal-day') { review.day = el.dataset.day; render(true); }
    else if (act === 'rv-ex') { review.ex = el.dataset.ex; review.point = null; render(true); }
    else if (act === 'rv-pt') { review.point = Number(el.dataset.i); render(true); }
    else if (act === 'rest-skip') closeRest();
    else if (act === 'rest-add' && rest) {
      rest.end = Math.max(Date.now(), rest.end + Number(el.dataset.sec) * 1000);
      rest.total = Math.max(rest.total, Math.ceil((rest.end - Date.now()) / 1000));
      tickRest();
    }
  });

  // +/− は押しっぱなしで連続して変わる
  document.addEventListener('pointerdown', (e) => {
    const step = e.target.closest('[data-step]');
    if (!step) return;
    stopHold();
    hold.fired = false;
    hold.t = setTimeout(() => {
      hold.fired = true;
      hold.iv = setInterval(() => stepField(step.dataset.step, Number(step.dataset.dir)), 90);
    }, 420);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => document.addEventListener(ev, stopHold, true));

  document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.field) readField(e.target, false); });
  document.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.field) e.target.select(); });
  document.addEventListener('focusout', (e) => { if (e.target.dataset && e.target.dataset.field) readField(e.target, true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.field) e.target.blur();
    if (e.key === 'Enter' && e.target.id === 'cf-name' && !e.isComposing) saveCustom();
    if (e.key === 'Escape' && picker) closePicker();
  });

  syncBadges(); // すでにある記録ぶんのバッジは、起動時に静かに反映しておく
  render();
})();
