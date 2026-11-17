/* Arrow Dance — oyun motoru ve arayüz */
(function () {
  'use strict';
  const { DX, DY, generateLevel } = window.ArrowLevels;
  const $ = (s) => document.querySelector(s);

  // ---------- Bölümler (her 20 seviyede bir tema) ----------
  const CHAPTERS = [
    { name: 'Başlangıç', bg: '#1d2b53', board: '#26366a', wall: '#141f3d', colors: ['#ff5d73', '#ffd166', '#06d6a0', '#4cc9f0'] },
    { name: 'Orman', bg: '#173d24', board: '#215231', wall: '#0e2615', colors: ['#f4d35e', '#ee964b', '#9be564', '#56cfe1'] },
    { name: 'Okyanus', bg: '#0b3954', board: '#11506f', wall: '#062436', colors: ['#ff6b6b', '#ffe66d', '#4ecdc4', '#c7f9cc'] },
    { name: 'Gün Batımı', bg: '#4a1942', board: '#5f2355', wall: '#2c0e27', colors: ['#ffb4a2', '#ffd60a', '#80ffdb', '#f28482'] },
    { name: 'Çöl', bg: '#6b4226', board: '#835434', wall: '#432816', colors: ['#ffe8a3', '#ff9f68', '#9ee6cf', '#fff3e6'] },
    { name: 'Gece', bg: '#10002b', board: '#240046', wall: '#07001a', colors: ['#ff70a6', '#ff9770', '#70d6ff', '#e9ff70'] },
    { name: 'Lav', bg: '#370617', board: '#540b22', wall: '#1d020a', colors: ['#ffba08', '#f48c06', '#90e0ef', '#ffffff'] },
    { name: 'Buz', bg: '#1b3a4b', board: '#255069', wall: '#0e2230', colors: ['#caf0f8', '#90e0ef', '#ffafcc', '#fdffb6'] },
  ];
  const PER_CHAPTER = 20;
  const chapterIndex = (n) => Math.floor((n - 1) / PER_CHAPTER);
  const chapterOf = (n) => CHAPTERS[chapterIndex(n) % CHAPTERS.length];

  // ---------- Kayıt ----------
  const SAVE_KEY = 'arrowdance_v1';
  const save = Object.assign({
    id: null, name: '', unlocked: 1, best: {}, hints: 3, sound: true, vibrate: true,
  }, (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } })());
  if (!save.id) {
    save.id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  const persist = () => localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  persist();
  const totalStars = () => Object.values(save.best).reduce((s, b) => s + b.stars, 0);
  const totalScore = () => Object.values(save.best).reduce((s, b) => s + b.score, 0);

  // ---------- Ses & titreşim ----------
  let actx = null;
  function tone(freq, dur = 0.08, type = 'sine', vol = 0.15, slide = 0) {
    if (!save.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ses yok */ }
  }
  const sfx = {
    whoosh: (i) => tone(520 + (i % 6) * 60, 0.16, 'triangle', 0.12, 500),
    bump: () => { tone(130, 0.18, 'square', 0.12, -60); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.14), i * 110)),
    fail: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'sawtooth', 0.08), i * 140)),
    click: () => tone(880, 0.04, 'sine', 0.08),
  };
  function buzz(ms) {
    if (!save.vibrate) return;
    try {
      if (window.AndroidBridge && AndroidBridge.vibrate) AndroidBridge.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* yok */ }
  }

  // ---------- Ekranlar ----------
  let current = 'home';
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    current = id;
    if (id !== 'game') { stopLoop(); setTheme(chapterOf(save.unlocked)); }
    if (id === 'home') renderHome();
    if (id === 'levels') renderLevels();
    if (id === 'leaderboard') renderLeaderboard();
  }
  function setTheme(ch) {
    document.documentElement.style.setProperty('--bg', ch.bg);
    document.documentElement.style.setProperty('--board', ch.board);
    document.documentElement.style.setProperty('--accent', ch.colors[1]);
    document.documentElement.style.setProperty('--accent2', ch.colors[0]);
    document.querySelector('meta[name=theme-color]').setAttribute('content', ch.bg);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1800);
  }
  function modal(html) { $('#modal-card').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); }
  const modalOpen = () => !$('#modal').classList.contains('hidden');

  // Android geri tuşu: true => uygulama içinde işlendi
  window.onAndroidBack = function () {
    if (modalOpen()) { if (!modal._locked) closeModal(); return true; }
    if (current === 'game') { show('levels'); return true; }
    if (current !== 'home') { show('home'); return true; }
    return false;
  };
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { sfx.click(); window.onAndroidBack(); }));

  // ---------- Ana menü ----------
  function renderHome() {
    $('#play-level').textContent = 'Seviye ' + save.unlocked;
    $('#home-stars').textContent = totalStars();
    $('#home-score').textContent = totalScore().toLocaleString('tr-TR');
    $('#home-hints').textContent = save.hints;
    $('#player-tag').textContent = save.name ? '👤 ' + save.name : '';
  }
  (function homeBackground() {
    const bg = $('#home-bg'); const glyphs = ['➜'];
    for (let i = 0; i < 18; i++) {
      const s = document.createElement('span'); s.className = 'float-arrow'; s.textContent = glyphs[0];
      const dir = [0, 90, 180, 270][i % 4];
      const dist = 160 + Math.random() * 200;
      s.style.left = Math.random() * 100 + '%'; s.style.top = Math.random() * 100 + '%';
      s.style.setProperty('--r', (dir - 90) + 'deg');
      s.style.setProperty('--tx', (Math.round(Math.sin(dir * Math.PI / 180) * dist)) + 'px');
      s.style.setProperty('--ty', (Math.round(-Math.cos(dir * Math.PI / 180) * dist)) + 'px');
      s.style.animationDuration = (8 + Math.random() * 10) + 's';
      s.style.animationDelay = (-Math.random() * 10) + 's';
      s.style.color = CHAPTERS[0].colors[i % 4];
      s.style.fontSize = (18 + Math.random() * 26) + 'px';
      bg.appendChild(s);
    }
  })();
  $('#btn-play').addEventListener('click', () => { sfx.click(); startLevel(save.unlocked); });
  $('#btn-levels').addEventListener('click', () => { sfx.click(); show('levels'); });
  $('#btn-lb').addEventListener('click', () => { sfx.click(); show('leaderboard'); });
  $('#btn-settings').addEventListener('click', () => { sfx.click(); openSettings(); });

  // ---------- Seviye seçimi ----------
  function renderLevels() {
    const list = $('#chapter-list'); list.innerHTML = '';
    $('#levels-stars').textContent = '⭐ ' + totalStars();
    const maxCh = chapterIndex(save.unlocked) + 1;
    for (let c = 0; c <= maxCh; c++) {
      const ch = CHAPTERS[c % CHAPTERS.length];
      const from = c * PER_CHAPTER + 1, to = from + PER_CHAPTER - 1;
      let stars = 0; for (let n = from; n <= to; n++) stars += save.best[n] ? save.best[n].stars : 0;
      const div = document.createElement('div'); div.className = 'chapter'; div.style.background = ch.board;
      div.innerHTML = `<h3><span>${c + 1}. ${ch.name}${c >= CHAPTERS.length ? ' +' : ''}</span><small>⭐ ${stars}/${PER_CHAPTER * 3} · ${from}-${to}</small></h3>`;
      const grid = document.createElement('div'); grid.className = 'lv-grid';
      for (let n = from; n <= to; n++) {
        const b = document.createElement('button'); b.className = 'lv';
        const best = save.best[n];
        if (n > save.unlocked) { b.classList.add('locked'); b.innerHTML = '🔒'; }
        else {
          if (n === save.unlocked) b.classList.add('current');
          b.innerHTML = `${n}<small>${best ? '★'.repeat(best.stars) + '☆'.repeat(3 - best.stars) : ''}</small>`;
          b.addEventListener('click', () => { sfx.click(); startLevel(n); });
        }
        grid.appendChild(b);
      }
      div.appendChild(grid); list.appendChild(div);
    }
    const cur = list.querySelector('.lv.current');
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 30);
  }

  // ---------- Oyun durumu ----------
  const canvas = $('#board'); const ctx = canvas.getContext('2d');
  let G = null; // aktif seviye
  let raf = 0;
  const layout = { cs: 40, ox: 0, oy: 0, w: 0, h: 0, dpr: 1 };

  function startLevel(n) {
    closeModal();
    const lv = generateLevel(n);
    const ch = chapterOf(n);
    setTheme(ch);
    const grid = new Int16Array(lv.cols * lv.rows).fill(-1);
    lv.walls.forEach(([x, y]) => { grid[y * lv.cols + x] = -2; });
    const arrows = lv.arrows.map((a, i) => ({ ...a, i, alive: true, fly: null, flash: 0, pop: 0, hint: 0 }));
    arrows.forEach(a => a.cells.forEach(([x, y]) => { grid[y * lv.cols + x] = a.i; }));
    G = {
      n, ch, cols: lv.cols, rows: lv.rows, walls: lv.walls, arrows, grid,
      left: arrows.length, total: arrows.length, hearts: 3, mistakes: 0,
      start: 0, elapsed: 0, done: false, particles: [], shake: 0, tapped: 0,
    };
    $('#hud-chapter').textContent = `${chapterIndex(n) + 1}. ${ch.name}`;
    $('#hud-level').textContent = 'Seviye ' + n;
    updateHud();
    show('game');
    resize();
    setupTutorial();
    startLoop();
  }

  function updateHud() {
    if (!G) return;
    $('#hud-hearts').innerHTML = [0, 1, 2].map(i => `<span class="${i >= G.hearts ? 'lost' : ''}">❤️</span>`).join('');
    $('#hud-left').textContent = G.left;
    $('#hud-progress').style.width = ((G.total - G.left) / G.total * 100) + '%';
    $('#hint-count').textContent = save.hints;
  }
  function fmtTime(ms) { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function resize() {
    const wrap = $('#board-wrap'); const r = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    layout.dpr = dpr; layout.w = r.width; layout.h = r.height;
    if (!G) return;
    const pad = 14;
    layout.cs = Math.floor(Math.min((r.width - pad * 2) / G.cols, (r.height - pad * 2) / G.rows, 92));
    layout.ox = (r.width - layout.cs * G.cols) / 2;
    layout.oy = (r.height - layout.cs * G.rows) / 2;
    positionTutorial();
  }
  window.addEventListener('resize', resize);

  // ---------- Etkileşim ----------
  function pathInfo(a) {
    let x = a.x + DX[a.d], y = a.y + DY[a.d], k = 0;
    while (x >= 0 && y >= 0 && x < G.cols && y < G.rows) {
      const v = G.grid[y * G.cols + x];
      if (v !== -1) return { blocked: true, k, v };
      x += DX[a.d]; y += DY[a.d]; k++;
    }
    return { blocked: false, k };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!G || G.done || modalOpen()) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left - layout.ox, py = e.clientY - r.top - layout.oy;
    const cx = Math.floor(px / layout.cs), cy = Math.floor(py / layout.cs);
    if (cx < 0 || cy < 0 || cx >= G.cols || cy >= G.rows) return;
    const v = G.grid[cy * G.cols + cx];
    if (v < 0) return;
    tapArrow(G.arrows[v]);
  });

  function tapArrow(a) {
    if (!a.alive || a.fly) return;
    const now = performance.now();
    if (!G.start) G.start = now;
    a.pop = now; a.hint = 0;
    const p = pathInfo(a);
    if (!p.blocked) {
      // Serbest! Ok tahtadan uçup gider
      a.alive = false;
      a.cells.forEach(([x, y]) => { G.grid[y * G.cols + x] = -1; });
      const dist = p.k + a.len + 3 + Math.max(G.cols, G.rows);
      a.fly = { type: 'exit', t0: now, dur: 260 + dist * 28, dist };
      G.left--; G.tapped++;
      sfx.whoosh(G.tapped); buzz(12);
      spawnTrail(a);
      updateHud();
      if (G.left === 0) finishLevel(true);
      advanceTutorial();
    } else {
      // Çarpışma: ileri gider, çarpar, geri döner
      const fwd = 90 + p.k * 45;
      a.fly = { type: 'bump', t0: now, fwd, back: 220, k: p.k + 0.28 };
      const target = p.v >= 0 ? G.arrows[p.v] : null;
      setTimeout(() => {
        if (!G) return;
        if (target) target.flash = performance.now();
        G.shake = performance.now();
        a.flash = performance.now();
        sfx.bump(); buzz(70);
      }, fwd);
      G.hearts--; G.mistakes++;
      updateHud();
      const hs = $('#hud-hearts').children[G.hearts]; if (hs) hs.classList.add('pop');
      if (G.hearts <= 0) finishLevel(false);
    }
  }

  $('#btn-restart').addEventListener('click', () => { sfx.click(); if (G) startLevel(G.n); });
  $('#btn-hint').addEventListener('click', () => {
    if (!G || G.done) return;
    if (save.hints <= 0) { toast('İpucu kalmadı — 3 yıldızla kazan!'); return; }
    const free = G.arrows.filter(a => a.alive && !a.fly && !pathInfo(a).blocked);
    if (!free.length) return;
    // Bağımlılığı en çok olanı seç (en faydalı ipucu)
    free.sort((p, q) => blockersOf(q) - blockersOf(p));
    free[0].hint = performance.now();
    save.hints--; persist(); updateHud(); sfx.click();
  });
  function blockersOf(a) {
    // Bu okun hücrelerinden geçmek zorunda olan canlı ok sayısı
    const mine = new Set(a.cells.map(([x, y]) => y * G.cols + x)); let c = 0;
    for (const b of G.arrows) {
      if (!b.alive || b === a) continue;
      let x = b.x + DX[b.d], y = b.y + DY[b.d];
      while (x >= 0 && y >= 0 && x < G.cols && y < G.rows) { if (mine.has(y * G.cols + x)) { c++; break; } x += DX[b.d]; y += DY[b.d]; }
    }
    return c;
  }

  // ---------- Öğretici ----------
  function setupTutorial() {
    const t = $('#tutorial');
    if (G.n === 1) { $('#tutorial-text').textContent = 'Oka dokun — önü açıksa uçup gider!'; t.classList.remove('hidden'); positionTutorial(); }
    else if (G.n === 2) { $('#tutorial-text').textContent = 'Dikkat! Başka oka çarparsan can kaybedersin ❤️'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none'; }
    else if (G.n === 6) { $('#tutorial-text').textContent = 'Uzun oklar geldi! Tüm gövdesi geçmeli.'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none'; }
    else if (G.n === 11) { $('#tutorial-text').textContent = 'Taş bloklar hiç kalkmaz — yolunu ona göre seç.'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none'; }
    else t.classList.add('hidden');
  }
  function positionTutorial() {
    if (!G || G.n !== 1) return;
    const hand = $('#tutorial .hand'); hand.style.display = '';
    const free = G.arrows.find(a => a.alive && !pathInfo(a).blocked);
    if (!free) { hand.style.display = 'none'; return; }
    const r = canvas.getBoundingClientRect();
    const [hx, hy] = free.cells[free.cells.length - 1];
    hand.style.left = (r.left + layout.ox + (hx + 0.45) * layout.cs) + 'px';
    hand.style.top = (r.top + layout.oy + (hy + 0.55) * layout.cs) + 'px';
  }
  function advanceTutorial() {
    if (G.n === 1) positionTutorial();
    else if (G.tapped >= 2) $('#tutorial').classList.add('hidden');
  }

  // ---------- Seviye sonu ----------
  function levelScore(n, stars, secs, arrows) {
    const mult = [0, 0.5, 0.75, 1][stars];
    return Math.round((100 + 15 * n) * mult + Math.max(0, 20 + arrows * 2 - secs) * 3);
  }

  function finishLevel(win) {
    G.done = true;
    const elapsed = G.start ? performance.now() - G.start : 0;
    G.elapsed = elapsed;
    const n = G.n;
    if (!win) {
      setTimeout(() => {
        sfx.fail(); buzz(200);
        modal._locked = true;
        modal(`<h2>💔 Canlar bitti</h2><p>Seviye ${n} — sıranı iyi planla!</p>
          <div class="btns"><button class="btn" id="m-home">Menü</button><button class="btn primary" id="m-retry">Tekrar</button></div>`);
        $('#m-retry').onclick = () => { modal._locked = false; startLevel(n); };
        $('#m-home').onclick = () => { modal._locked = false; closeModal(); show('levels'); };
      }, 600);
      return;
    }
    const stars = Math.max(1, 3 - G.mistakes);
    const secs = Math.round(elapsed / 1000);
    const score = levelScore(n, stars, secs, G.total);
    const prev = save.best[n];
    let newBest = false, bonusHint = false;
    if (!prev || score > prev.score) {
      save.best[n] = { stars: Math.max(stars, prev ? prev.stars : 0), score: Math.max(score, prev ? prev.score : 0) };
      newBest = true;
    }
    if (stars === 3 && (!prev || prev.stars < 3)) { save.hints++; bonusHint = true; }
    if (n === save.unlocked) save.unlocked = n + 1;
    persist();
    submitScore();
    setTimeout(() => {
      sfx.win(); buzz(40); confetti();
      const chapterDone = n % PER_CHAPTER === 0;
      modal._locked = true;
      modal(`<h2>${['', 'İyi!', 'Süper!', 'Mükemmel!'][stars]}</h2>
        <div class="stars">${[1, 2, 3].map(i => `<span class="${i > stars ? 'off' : ''}" style="animation-delay:${i * 0.15}s">⭐</span>`).join('')}</div>
        <div class="score">${score.toLocaleString('tr-TR')}</div>
        <p>⏱ ${fmtTime(elapsed)} · ${G.total} ok${newBest && prev ? ' · Yeni rekor!' : ''}${bonusHint ? '<br>💡 +1 ipucu kazandın' : ''}${chapterDone ? '<br>🎉 Yeni bölüm açıldı: ' + chapterOf(n + 1).name : ''}</p>
        <div class="btns"><button class="btn" id="m-retry">↻</button><button class="btn primary" id="m-next" style="flex:3">Sonraki ➜</button></div>`);
      $('#m-retry').onclick = () => { modal._locked = false; startLevel(n); };
      $('#m-next').onclick = () => { modal._locked = false; startLevel(n + 1); };
    }, 450);
  }

  function submitScore() {
    if (!window.Leaderboard.enabled() || !save.name) return;
    window.Leaderboard.submit({ id: save.id, name: save.name, score: totalScore(), level: save.unlocked - 1, stars: totalStars() });
  }

  // ---------- Çizim ----------
  function startLoop() { stopLoop(); const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt * 255)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function draw(now) {
    if (!G) return;
    const { cs, ox, oy, dpr } = layout;
    if (G.start && !G.done) $('#hud-time').textContent = fmtTime(now - G.start);
    else if (!G.start) $('#hud-time').textContent = '0:00';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, layout.w, layout.h);
    // sarsıntı
    const sh = now - G.shake < 300 ? (1 - (now - G.shake) / 300) * 6 : 0;
    if (sh) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    // tahta
    const ch = G.ch;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(ox - 8, oy - 4, cs * G.cols + 16, cs * G.rows + 16, 22); ctx.fill();
    ctx.fillStyle = ch.board; rr(ox - 8, oy - 8, cs * G.cols + 16, cs * G.rows + 16, 22); ctx.fill();
    // boş hücre noktaları
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) {
      if (G.grid[y * G.cols + x] === -1) { ctx.beginPath(); ctx.arc(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
    // duvarlar
    for (const [x, y] of G.walls) {
      const px = ox + x * cs + cs * 0.08, py = oy + y * cs + cs * 0.08, s = cs * 0.84;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(px, py + 3, s, s, cs * 0.18); ctx.fill();
      ctx.fillStyle = ch.wall; rr(px, py, s, s, cs * 0.18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px + s * 0.25, py + s * 0.5); ctx.lineTo(px + s * 0.75, py + s * 0.5);
      ctx.moveTo(px + s * 0.5, py + s * 0.25); ctx.lineTo(px + s * 0.5, py + s * 0.75); ctx.stroke();
    }

    // oklar
    for (const a of G.arrows) {
      let off = 0, alpha = 1;
      if (a.fly) {
        const t = now - a.fly.t0;
        if (a.fly.type === 'exit') {
          const p = Math.min(1, t / a.fly.dur);
          off = a.fly.dist * (p * p * 0.55 + p * 0.45);
          if (p >= 1) { a.fly = null; a.gone = true; }
        } else {
          if (t < a.fly.fwd) off = a.fly.k * easeOut(t / a.fly.fwd);
          else if (t < a.fly.fwd + a.fly.back) off = a.fly.k * (1 - easeInOut((t - a.fly.fwd) / a.fly.back));
          else a.fly = null;
        }
      }
      if (!a.alive && !a.fly) continue;
      drawArrow(a, off, alpha, now);
    }

    // parçacıklar
    G.particles = G.particles.filter(p => now - p.t0 < p.life);
    for (const p of G.particles) {
      const k = (now - p.t0) / p.life;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c;
      const px = p.x + p.vx * k * 60, py = p.y + p.vy * k * 60 + (p.g ? k * k * 260 : 0);
      if (p.g) { ctx.save(); ctx.translate(px, py); ctx.rotate(k * 10 + p.vx); ctx.fillRect(-4, -2.5, 8, 5); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(px, py, p.r * (1 - k), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function drawArrow(a, off, alpha, now) {
    const { cs, ox, oy } = layout;
    const dx = DX[a.d], dy = DY[a.d];
    let color = G.ch.colors[a.d];
    const flashing = now - a.flash < 450;
    if (flashing) color = ((now - a.flash) / 75 | 0) % 2 ? '#ff2d55' : '#ffffff';
    const [tx, ty] = a.cells[0], [hx, hy] = a.cells[a.cells.length - 1];
    const ofx = dx * off * cs, ofy = dy * off * cs;
    let tcx = ox + (tx + 0.5) * cs + ofx, tcy = oy + (ty + 0.5) * cs + ofy;
    let hcx = ox + (hx + 0.5) * cs + ofx, hcy = oy + (hy + 0.5) * cs + ofy;
    // dokunma sekmesi
    let sc = 1;
    const pt = now - a.pop; if (pt < 160) sc = 1 + Math.sin(pt / 160 * Math.PI) * 0.12;
    // ipucu nabzı
    const ht = a.hint ? now - a.hint : 1e9;
    const hinting = ht < 2400;
    const sx = tcx - dx * cs * 0.3, sy = tcy - dy * cs * 0.3;   // kuyruk ucu
    const tipx = hcx + dx * cs * 0.36, tipy = hcy + dy * cs * 0.36; // ok ucu
    const bx = tipx - dx * cs * 0.34, by = tipy - dy * cs * 0.34;  // başın tabanı
    const hw = cs * 0.27 * sc, lw = cs * 0.2 * sc;
    const px = -dy, py = dx; // dik vektör
    ctx.globalAlpha = alpha;
    const shape = (col, yo) => {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(sx, sy + yo); ctx.lineTo(bx + dx * 2, by + dy * 2 + yo); ctx.stroke();
      ctx.lineWidth = cs * 0.08;
      ctx.beginPath(); ctx.moveTo(tipx, tipy + yo); ctx.lineTo(bx + px * hw, by + py * hw + yo); ctx.lineTo(bx - px * hw, by - py * hw + yo); ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    if (hinting) {
      const k = 0.5 + 0.5 * Math.sin(ht / 120);
      ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 18 + k * 16; shape('#ffffff', 0); ctx.restore();
    }
    shape(shade(color.startsWith('#') ? color : '#ffffff', -0.28), cs * 0.06);
    shape(color, 0);
    // parlama
    ctx.globalAlpha = alpha * 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 0.25;
    const so = lw * 0.2, sox = dx !== 0 ? 0 : -so, soy = dx !== 0 ? -so : 0;
    ctx.beginPath(); ctx.moveTo(sx + sox, sy + soy); ctx.lineTo(bx + sox - dx * cs * 0.04, by + soy - dy * cs * 0.04); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function spawnTrail(a) {
    const { cs, ox, oy } = layout;
    const col = G.ch.colors[a.d];
    for (const [x, y] of a.cells) {
      for (let i = 0; i < 4; i++) {
        G.particles.push({ x: ox + (x + 0.5) * cs, y: oy + (y + 0.5) * cs, vx: (Math.random() - 0.5) * 1.2 - DX[a.d] * 0.6,
          vy: (Math.random() - 0.5) * 1.2 - DY[a.d] * 0.6, r: cs * (0.06 + Math.random() * 0.06), c: col, t0: performance.now(), life: 450 });
      }
    }
  }
  function confetti() {
    const now = performance.now();
    for (let i = 0; i < 90; i++) {
      G.particles.push({ x: layout.w / 2, y: layout.h * 0.35, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 6 - 1,
        c: G.ch.colors[i % 4], t0: now + Math.random() * 120, life: 1300 + Math.random() * 700, g: true, r: 4 });
    }
  }

  // ---------- Liderlik ----------
  async function renderLeaderboard() {
    const me = $('#lb-me'), list = $('#lb-list');
    me.innerHTML = `<span class="rank">#…</span><span class="nm">${esc(save.name || 'İsimsiz')}<small>Seviye ${save.unlocked - 1} · ⭐ ${totalStars()}</small></span><span class="sc">${totalScore().toLocaleString('tr-TR')}</span>`;
    if (!window.Leaderboard.enabled()) {
      me.querySelector('.rank').textContent = '—';
      list.innerHTML = `<div class="lb-empty">🌍 Küresel liderlik tablosu henüz bağlanmadı.<br><br>Geliştirici: <b>config.js</b> içine Firebase Realtime Database adresini ekleyin veya GitHub'da <b>FIREBASE_DB_URL</b> secret'ını tanımlayın.</div>`;
      return;
    }
    if (!save.name) { askName(() => renderLeaderboard()); return; }
    list.innerHTML = `<div class="lb-empty">Yükleniyor…</div>`;
    await window.Leaderboard.flush();
    submitScore();
    try {
      const rows = await window.Leaderboard.top(100);
      if (!rows.length) { list.innerHTML = `<div class="lb-empty">Henüz kimse yok — ilk sen ol! 🚀</div>`; }
      else {
        list.innerHTML = rows.map((r, i) => `<div class="lb-row ${r.id === save.id ? 'me' : ''}">
          <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
          <span class="nm">${esc(r.name || '?')}<small>Seviye ${r.level || 0} · ⭐ ${r.stars || 0}</small></span>
          <span class="sc">${Number(r.score).toLocaleString('tr-TR')}</span></div>`).join('');
      }
      const idx = rows.findIndex(r => r.id === save.id);
      let rank = idx >= 0 ? idx + 1 : await window.Leaderboard.rankOf(totalScore());
      me.querySelector('.rank').textContent = rank ? '#' + rank : '—';
    } catch (e) {
      list.innerHTML = `<div class="lb-empty">📡 Bağlantı kurulamadı.<br>İnternetini kontrol edip ↻ ile yenile.</div>`;
    }
  }
  $('#btn-lb-refresh').addEventListener('click', () => { sfx.click(); renderLeaderboard(); });
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- İsim & ayarlar ----------
  function askName(after) {
    modal._locked = !save.name;
    modal(`<h2>👋 Adın ne?</h2><p>Liderlik tablosunda bu isimle görüneceksin.</p>
      <input id="m-name" maxlength="16" placeholder="Oyuncu adı" value="${esc(save.name)}">
      <div class="btns"><button class="btn primary" id="m-ok">Kaydet</button></div>`);
    const inp = $('#m-name'); setTimeout(() => inp.focus(), 100);
    const done = () => {
      const v = inp.value.trim().replace(/\s+/g, ' ').slice(0, 16);
      if (v.length < 2) { toast('En az 2 karakter'); return; }
      save.name = v; persist(); modal._locked = false; closeModal(); renderHome(); submitScore();
      if (after) after();
    };
    $('#m-ok').onclick = done;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
  }
  function openSettings() {
    const row = (k, label) => `<div class="setting"><span>${label}</span><button class="toggle ${save[k] ? 'on' : ''}" data-k="${k}"></button></div>`;
    modal._locked = false;
    modal(`<h2>Ayarlar</h2>
      ${row('sound', '🔊 Ses')}${row('vibrate', '📳 Titreşim')}
      <div class="setting"><span>👤 ${esc(save.name || 'İsimsiz')}</span><button class="btn" id="m-rename" style="padding:8px 14px">Değiştir</button></div>
      <p style="font-size:12px">Arrow Dance · oyuncu kimliği ${save.id.slice(0, 8)}</p>
      <div class="btns"><button class="btn primary" id="m-close">Tamam</button></div>`);
    document.querySelectorAll('.toggle').forEach(t => t.onclick = () => { save[t.dataset.k] = !save[t.dataset.k]; t.classList.toggle('on'); persist(); sfx.click(); });
    $('#m-rename').onclick = () => askName();
    $('#m-close').onclick = closeModal;
  }
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !modal._locked) closeModal(); });

  // ---------- Başlat ----------
  show('home');
  if (!save.name) setTimeout(() => askName(), 400);
  window.Leaderboard.flush();
  window.__arrow = { startLevel, save, get G() { return G; }, tapArrow };
})();
