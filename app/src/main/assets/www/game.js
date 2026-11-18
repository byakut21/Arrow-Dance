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
    id: null, name: '', unlocked: 1, best: {}, hints: 3, sound: true, vibrate: true, tried: {}, won: {}, voted: {}, attempts: {},
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
  function closeModal() { $('#modal').classList.add('hidden'); modal._onBack = null; }
  const modalOpen = () => !$('#modal').classList.contains('hidden');

  // Android geri tuşu: true => uygulama içinde işlendi
  window.onAndroidBack = function () {
    if (modalOpen()) { if (modal._onBack) { const f = modal._onBack; modal._onBack = null; f(); } else if (!modal._locked) closeModal(); return true; }
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
  // Kamera (yakınlaştırma / kaydırma): ekran = taban * s + (x, y)
  const cam = { s: 1, x: 0, y: 0 };
  const MAX_ZOOM = 4;
  function resetCam() { cam.s = 1; cam.x = 0; cam.y = 0; }
  function clampCam() {
    cam.s = Math.max(1, Math.min(MAX_ZOOM, cam.s));
    const bw = layout.cs * G.cols, bh = layout.cs * G.rows;
    // tahtanın en az yarısı ekranda kalsın
    const minX = layout.w * 0.5 - (layout.ox + bw) * cam.s, maxX = layout.w * 0.5 - layout.ox * cam.s;
    const minY = layout.h * 0.5 - (layout.oy + bh) * cam.s, maxY = layout.h * 0.5 - layout.oy * cam.s;
    if (cam.s === 1) { cam.x = 0; cam.y = 0; return; }
    cam.x = Math.max(minX, Math.min(maxX, cam.x));
    cam.y = Math.max(minY, Math.min(maxY, cam.y));
  }
  function zoomAt(newS, sx, sy) {
    newS = Math.max(1, Math.min(MAX_ZOOM, newS));
    const bx = (sx - cam.x) / cam.s, by = (sy - cam.y) / cam.s;
    cam.s = newS; cam.x = sx - bx * newS; cam.y = sy - by * newS;
    clampCam(); positionTutorial();
  }

  function startLevel(n, opts = {}) {
    closeModal();
    const lv = generateLevel(n);
    const ch = chapterOf(n);
    setTheme(ch);
    const grid = new Int16Array(lv.cols * lv.rows).fill(-1);
    lv.walls.forEach(([x, y]) => { grid[y * lv.cols + x] = -2; });
    const arrows = lv.arrows.map((a, i) => ({ ...a, i, alive: true, fly: null, flash: 0, pop: 0, hint: 0, path: buildPath(a, lv.cols, lv.rows) }));
    arrows.forEach(a => a.cells.forEach(([x, y]) => { grid[y * lv.cols + x] = a.i; }));
    G = {
      n, ch, cols: lv.cols, rows: lv.rows, walls: lv.walls, arrows, grid,
      left: arrows.length, total: arrows.length, hearts: 3, mistakes: 0,
      start: 0, elapsed: 0, done: false, particles: [], shake: 0, tapped: 0, depth: lv.depth || 1,
    };
    save.attempts[n] = (save.attempts[n] || 0) + 1; persist();
    $('#hud-chapter').textContent = `${chapterIndex(n) + 1}. ${ch.name}`;
    $('#hud-level').textContent = 'Seviye ' + n;
    updateHud();
    show('game');
    resetCam();
    resize();
    setupTutorial();
    startLoop();
    if (!opts.noIntro && n > 2) showIntro(n);
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
    const pad = 10;
    layout.cs = Math.min((r.width - pad * 2) / G.cols, (r.height - pad * 2) / G.rows, 46);
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

  // Dokunma: kısa dokunuş = oku gönder, basılı tut = rotayı göster,
  // tek parmak sürükle = kaydır, iki parmak = yakınlaştır
  const ptrs = new Map();
  let gesture = null; // {sx, sy, t, moved, pinch, holdTimer, d0, s0, mx0, my0, cx0, cy0}
  let preview = null; // basılı tutulan ok
  const LONG_MS = 450;   // basılı tutma eşiği
  const MOVE_PX = 18;    // bu kadar kayarsa dokunma değil sürükleme

  function localPt(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  // En yakın oku bul: parmağın okun gövde çizgisine uzaklığına göre.
  // İnce çizgiye tam basmak gerekmez, yakınına dokunmak yeter.
  function arrowAtScreen(sx, sy) {
    const s = cam.s, cs = layout.cs;
    const bx = (sx - cam.x) / s, by = (sy - cam.y) / s;       // tahta koordinatı (px)
    const gx = (bx - layout.ox) / cs - 0.5, gy = (by - layout.oy) / cs - 0.5; // hücre birimi
    // tolerans: en az ~26 ekran pikseli ya da 0.75 hücre
    const tol = Math.max(26 / (cs * s), 0.75);
    let best = null, bestD = Infinity;
    for (const a of G.arrows) {
      if (!a.alive) continue;
      const c = a.cells;
      // gövde parçaları + ok ucu
      const pts = c.slice();
      pts.push([a.x + DX[a.d] * 0.35, a.y + DY[a.d] * 0.35]);
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[Math.min(i + 1, pts.length - 1)];
        const vx = x2 - x1, vy = y2 - y1, L2 = vx * vx + vy * vy;
        let t = L2 ? ((gx - x1) * vx + (gy - y1) * vy) / L2 : 0; t = Math.max(0, Math.min(1, t));
        const d = Math.hypot(gx - (x1 + vx * t), gy - (y1 + vy * t));
        if (d < bestD) { bestD = d; best = a; }
      }
    }
    return bestD <= tol ? best : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (!G || modalOpen()) return;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    const [x, y] = localPt(e);
    ptrs.set(e.pointerId, [x, y]);
    if (ptrs.size === 1) {
      gesture = { sx: x, sy: y, t: performance.now(), moved: false, pinch: false, lx: x, ly: y };
      const a = G.done ? null : arrowAtScreen(x, y);
      if (a && a.alive && !a.fly) {
        gesture.holdTimer = setTimeout(() => {
          if (gesture && !gesture.moved && !gesture.pinch) { preview = a; a.pop = performance.now(); buzz(8); markSeenHold(); }
        }, LONG_MS);
      }
    } else if (ptrs.size === 2 && gesture) {
      clearTimeout(gesture.holdTimer); preview = null;
      const [[x1, y1], [x2, y2]] = [...ptrs.values()];
      Object.assign(gesture, { pinch: true, moved: true, d0: Math.hypot(x2 - x1, y2 - y1), s0: cam.s,
        mx0: (x1 + x2) / 2, my0: (y1 + y2) / 2, cx0: cam.x, cy0: cam.y });
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const [x, y] = localPt(e);
    ptrs.set(e.pointerId, [x, y]);
    if (gesture.pinch && ptrs.size >= 2) {
      const [[x1, y1], [x2, y2]] = [...ptrs.values()];
      const d = Math.hypot(x2 - x1, y2 - y1), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ns = Math.max(1, Math.min(MAX_ZOOM, gesture.s0 * d / gesture.d0));
      // iki parmağın ortası aynı tahta noktasında kalsın
      const bx = (gesture.mx0 - gesture.cx0) / gesture.s0, by = (gesture.my0 - gesture.cy0) / gesture.s0;
      cam.s = ns; cam.x = mx - bx * ns; cam.y = my - by * ns;
      clampCam(); positionTutorial();
      return;
    }
    if (preview) return; // rota gösterilirken kaydırma yok
    if (!gesture.moved && Math.hypot(x - gesture.sx, y - gesture.sy) > (cam.s > 1 ? MOVE_PX : 40)) { gesture.moved = true; clearTimeout(gesture.holdTimer); }
    if (gesture.moved && cam.s > 1) {
      cam.x += x - gesture.lx; cam.y += y - gesture.ly; clampCam(); positionTutorial();
    }
    gesture.lx = x; gesture.ly = y;
  });

  function endPointer(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (!gesture) return;
    if (ptrs.size > 0) { // pinch bitti, kalan parmakla kaydırmaya geç
      const [[x, y]] = [...ptrs.values()]; gesture.lx = x; gesture.ly = y; gesture.pinch = false; return;
    }
    clearTimeout(gesture.holdTimer);
    const wasTap = !gesture.moved && !gesture.pinch && !preview;
    if (wasTap && G && !G.done && e.type === 'pointerup') {
      const a = arrowAtScreen(gesture.sx, gesture.sy);
      if (a) tapArrow(a);
    }
    preview = null; gesture = null;
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => {
    if (!G) return; e.preventDefault();
    const [x, y] = localPt(e); zoomAt(cam.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, y);
  }, { passive: false });
  $('#btn-zoom-in').addEventListener('click', () => { if (G) { sfx.click(); zoomAt(cam.s * 1.5, layout.w / 2, layout.h / 2); } });
  $('#btn-zoom-out').addEventListener('click', () => { if (G) { sfx.click(); zoomAt(cam.s / 1.5, layout.w / 2, layout.h / 2); } });
  $('#btn-zoom-fit').addEventListener('click', () => { if (G) { sfx.click(); resetCam(); positionTutorial(); } });
  function markSeenHold() {
    if (!save.seenHold) { save.seenHold = true; persist(); }
  }

  function tapArrow(a) {
    if (!a.alive || a.fly) return;
    const now = performance.now();
    if (!G.start) {
      G.start = now;
      if (!save.tried[G.n]) { save.tried[G.n] = 1; persist(); window.Leaderboard.inc(G.n, 'tried'); }
    }
    a.pop = now; a.hint = 0;
    const p = pathInfo(a);
    if (!p.blocked) {
      // Serbest! Ok tahtadan uçup gider
      a.alive = false;
      a.cells.forEach(([x, y]) => { G.grid[y * G.cols + x] = -1; });
      const dist = p.k + a.len + 1.5;
      a.fly = { type: 'exit', t0: now, dur: 90 + dist * 20, dist };
      G.left--; G.tapped++;
      sfx.whoosh(G.tapped); buzz(12);
      spawnTrail(a);
      updateHud();
      if (G.left === 0) finishLevel(true);
      advanceTutorial();
    } else {
      // Çarpışma: ileri gider, çarpar, geri döner
      const fwd = 60 + p.k * 18;
      a.fly = { type: 'bump', t0: now, fwd, back: 150, k: p.k + 0.28 };
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

  $('#btn-restart').addEventListener('click', () => { sfx.click(); if (G) startLevel(G.n, { noIntro: true }); });
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
    else if (!save.seenBend && G.arrows.some(a => isBent(a))) {
      save.seenBend = true; persist();
      $('#tutorial-text').textContent = 'Kıvrımlı oklar! Gövde, başı takip ederek kayar.'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none';
    }
    else if (!save.seenHold && G.n >= 3) {
      $('#tutorial-text').textContent = 'Oka basılı tut: rotasını gör. İki parmakla yakınlaştır.'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none';
    }
    else if (G.n === 11) { $('#tutorial-text').textContent = 'Taş bloklar hiç kalkmaz — yolunu ona göre seç.'; t.classList.remove('hidden'); $('#tutorial .hand').style.display = 'none'; }
    else t.classList.add('hidden');
  }
  function isBent(a) {
    const c = a.cells;
    for (let i = 2; i < c.length; i++) if (c[i][0] - c[i - 1][0] !== c[i - 1][0] - c[i - 2][0] || c[i][1] - c[i - 1][1] !== c[i - 1][1] - c[i - 2][1]) return true;
    return false;
  }
  function positionTutorial() {
    if (!G || G.n !== 1) return;
    const hand = $('#tutorial .hand'); hand.style.display = '';
    const free = G.arrows.find(a => a.alive && !pathInfo(a).blocked);
    if (!free) { hand.style.display = 'none'; return; }
    const r = canvas.getBoundingClientRect();
    const [hx, hy] = free.cells[free.cells.length - 1];
    hand.style.left = (r.left + cam.x + (layout.ox + (hx + 0.45) * layout.cs) * cam.s) + 'px';
    hand.style.top = (r.top + cam.y + (layout.oy + (hy + 0.55) * layout.cs) * cam.s) + 'px';
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
      window.Leaderboard.inc(n, 'fails');
      setTimeout(() => {
        sfx.fail(); buzz(200);
        modal._locked = true;
        modal(`<h2>💔 Canlar bitti</h2><p>Seviye ${n} — sıranı iyi planla!</p>
          <div class="btns"><button class="btn" id="m-home">Menü</button><button class="btn primary" id="m-retry">Tekrar</button></div>`);
        $('#m-retry').onclick = () => { modal._locked = false; startLevel(n, { noIntro: true }); };
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
    if (!save.won[n]) { save.won[n] = 1; window.Leaderboard.inc(n, 'won'); }
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
        ${save.voted[n] ? '' : `<div class="vote" id="m-vote"><small>Bu bölüm nasıldı?</small><div>
          <button class="btn" data-v="easy">😌 Kolay</button><button class="btn" data-v="mid">🙂 Orta</button><button class="btn" data-v="hard">😤 Zor</button></div></div>`}
        <div class="btns"><button class="btn" id="m-retry">↻</button><button class="btn primary" id="m-next" style="flex:3">Sonraki ➜</button></div>`);
      document.querySelectorAll('#m-vote [data-v]').forEach(b => b.onclick = async () => {
        const v = b.dataset.v; save.voted[n] = v; persist(); sfx.click();
        window.Leaderboard.inc(n, v);
        const box = $('#m-vote'); box.innerHTML = '<small>Teşekkürler! 🙏</small>';
        const st = await window.Leaderboard.stats(n);
        if (st && box.isConnected) {
          const V = st.easy + st.mid + st.hard;
          if (V > 0) box.innerHTML = `<small>Teşekkürler! Bu bölümü zor bulanlar: <b>%${Math.round(st.hard / V * 100)}</b> (${V} oy)</small>`;
        }
      });
      $('#m-retry').onclick = () => { modal._locked = false; startLevel(n, { noIntro: true }); };
      $('#m-next').onclick = () => { modal._locked = false; startLevel(n + 1); };
    }, 450);
  }

  // ---------- Bölüm arası not ----------
  const TIPS = [
    'Oka basılı tut: rotası yeşilse yol açık, kırmızıysa engel var.',
    'Önce kenara bakan okları bul — genelde ilk onlar çıkar.',
    'Kıvrımlı okun sadece BAŞININ önü açık olmalı; gövde onu takip eder.',
    'Taşlar hiç kalkmaz. Taşa bakan ok o yönden asla çıkamaz.',
    'Takıldıysan iki parmakla yakınlaştır, gövdeleri daha net gör.',
    'Hatasız bitirirsen 3 yıldız ve +1 ipucu kazanırsın.',
    'Bir okun önünü kapatan oku bul, önce onu çıkar.',
  ];
  const DIFF = ['Çok kolay', 'Kolay', 'Orta', 'Zor', 'Çok zor'];
  function difficultyOf(g) {
    // çözüm derinliği + ok sayısı + kıvrımlara göre 1..5
    const bendsTotal = g.arrows.reduce((s, a) => s + (isBent(a) ? 1 : 0), 0);
    const score = g.depth * 1.0 + g.total * 0.08 + bendsTotal * 0.05;
    return Math.max(1, Math.min(5, Math.round(score / 6)));
  }
  function showIntro(n) {
    const d = difficultyOf(G);
    const best = save.best[n];
    const tries = save.attempts[n] || 1;
    const tip = TIPS[(n * 7) % TIPS.length];
    modal._locked = true;
    modal._onBack = () => { modal._locked = false; closeModal(); show('levels'); };
    modal(`<small class="intro-ch">${chapterIndex(n) + 1}. ${G.ch.name}</small>
      <h2>Seviye ${n}</h2>
      <div class="intro-diff">${'★'.repeat(d)}<span>${'★'.repeat(5 - d)}</span> <b>${DIFF[d - 1]}</b></div>
      <div class="intro-stats" id="m-stats">${window.Leaderboard.enabled() ? '<div class="st muted">🌍 Dünya istatistikleri yükleniyor…</div>' : ''}</div>
      <div class="intro-me">${best ? `Rekorun: ${'⭐'.repeat(best.stars)} · ${best.score.toLocaleString('tr-TR')} puan` : tries > 1 ? `${tries}. denemen — bu sefer olacak! 💪` : `${G.total} ok · ilk denemen`}</div>
      <p class="intro-tip">💡 ${tip}</p>
      <div class="btns"><button class="btn primary" id="m-go">Başla ➜</button></div>`);
    $('#m-go').onclick = () => { modal._locked = false; closeModal(); sfx.click(); };
    if (!window.Leaderboard.enabled()) return;
    window.Leaderboard.stats(n).then(st => {
      const box = $('#m-stats'); if (!box || !box.isConnected) return;
      if (!st) { box.innerHTML = '<div class="st muted">📡 Dünya istatistiklerine ulaşılamadı</div>'; return; }
      if (!st.tried) { box.innerHTML = '<div class="st">🌍 Bu bölümü henüz kimse denemedi — <b>ilk sen ol!</b></div>'; return; }
      const notDone = Math.max(0, st.tried - st.won);
      const V = st.easy + st.mid + st.hard;
      let html = `<div class="st">👥 <b>${st.tried.toLocaleString('tr-TR')}</b> kişi denedi, <b>${notDone.toLocaleString('tr-TR')}</b> kişi tamamlayamadı</div>`;
      html += `<div class="st">✅ Tamamlama oranı: <b>%${Math.round(st.won / st.tried * 100)}</b></div>`;
      if (V > 0) html += `<div class="st">😤 Zor bulanlar: <b>%${Math.round(st.hard / V * 100)}</b> <small>(${V} oy)</small></div>`;
      box.innerHTML = html;
    });
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
    ctx.translate(cam.x, cam.y); ctx.scale(cam.s, cam.s);

    // tahta
    const ch = G.ch;
    ctx.fillStyle = 'rgba(0,0,0,.18)'; rr(ox - 8, oy - 4, cs * G.cols + 16, cs * G.rows + 16, 22); ctx.fill();
    ctx.fillStyle = ch.board; rr(ox - 8, oy - 8, cs * G.cols + 16, cs * G.rows + 16, 22); ctx.fill();
    // boş hücre noktaları
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) {
      if (G.grid[y * G.cols + x] === -1) { ctx.beginPath(); ctx.arc(ox + (x + 0.5) * cs, oy + (y + 0.5) * cs, cs * 0.07, 0, Math.PI * 2); ctx.fill(); }
    }
    // taş bloklar
    for (const [x, y] of G.walls) drawStone(x, y);

    // oklar
    for (const a of G.arrows) {
      let off = 0, alpha = 1;
      if (a.fly) {
        const t = now - a.fly.t0;
        if (a.fly.type === 'exit') {
          const p = Math.min(1, t / a.fly.dur);
          off = a.fly.dist * (p * p * 0.35 + p * 0.65);
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

    if (preview) drawPreview(preview, now);

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

  // Basılı tutulan okun rotası
  function drawPreview(a, now) {
    if (!a.alive || a.fly) { preview = null; return; }
    const { cs, ox, oy } = layout;
    const p = pathInfo(a);
    const dx = DX[a.d], dy = DY[a.d];
    const cx = (gx) => ox + (gx + 0.5) * cs, cy = (gy) => oy + (gy + 0.5) * cs;
    const sx = cx(a.x) + dx * cs * 0.45, sy = cy(a.y) + dy * cs * 0.45;
    let ex, ey;
    if (p.blocked) { ex = cx(a.x + dx * (p.k + 1)) - dx * cs * 0.5; ey = cy(a.y + dy * (p.k + 1)) - dy * cs * 0.5; }
    else { ex = cx(a.x + dx * (p.k + 1)) + dx * cs * 0.1; ey = cy(a.y + dy * (p.k + 1)) + dy * cs * 0.1; }
    const col = p.blocked ? '#ff3b5c' : '#3ddc84';
    // yolun zemini
    ctx.save();
    ctx.globalAlpha = 0.18; ctx.fillStyle = col;
    for (let k = 1; k <= p.k; k++) {
      const gx = a.x + dx * k, gy = a.y + dy * k;
      rr(ox + gx * cs + cs * 0.12, oy + gy * cs + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.18); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // kesik çizgi (akan)
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, cs * 0.08); ctx.lineCap = 'round';
    ctx.setLineDash([cs * 0.18, cs * 0.16]); ctx.lineDashOffset = -(now / 25) % (cs * 0.34);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    if (p.blocked) {
      // engel: kırmızı çerçeve + X
      const bx = a.x + dx * (p.k + 1), by = a.y + dy * (p.k + 1);
      const pulse = 0.5 + 0.5 * Math.sin(now / 90);
      ctx.lineWidth = Math.max(2, cs * 0.07); ctx.strokeStyle = col;
      ctx.globalAlpha = 0.6 + 0.4 * pulse;
      rr(ox + bx * cs + cs * 0.04, oy + by * cs + cs * 0.04, cs * 0.92, cs * 0.92, cs * 0.22); ctx.stroke();
      if (p.v >= 0) { // engelleyen okun tüm gövdesini işaretle
        ctx.globalAlpha = 0.25 + 0.2 * pulse; ctx.fillStyle = col;
        for (const [gx, gy] of G.arrows[p.v].cells) { rr(ox + gx * cs + cs * 0.08, oy + gy * cs + cs * 0.08, cs * 0.84, cs * 0.84, cs * 0.2); ctx.fill(); }
      }
      ctx.globalAlpha = 1; ctx.lineWidth = Math.max(2, cs * 0.09);
      const m = cs * 0.2, qx = ex + dx * cs * 0.02, qy = ey + dy * cs * 0.02;
      ctx.beginPath(); ctx.moveTo(qx - m, qy - m); ctx.lineTo(qx + m, qy + m); ctx.moveTo(qx + m, qy - m); ctx.lineTo(qx - m, qy + m); ctx.stroke();
    } else {
      // çıkış: küçük ok ucu
      ctx.fillStyle = col; const hw = cs * 0.16, px = -dy, py = dx;
      ctx.beginPath(); ctx.moveTo(ex + dx * hw * 1.4, ey + dy * hw * 1.4); ctx.lineTo(ex + px * hw, ey + py * hw); ctx.lineTo(ex - px * hw, ey - py * hw); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // Dokulu, çatlaklı taş (her hücre için sabit rastgele şekil)
  function drawStone(x, y) {
    const { cs, ox, oy } = layout;
    let seed = (x * 73856093) ^ (y * 19349663) ^ (G.n * 83492791);
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const cx = ox + (x + 0.5) * cs, cy = oy + (y + 0.5) * cs, R = cs * 0.43;
    const N = 9, pts = [];
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + rnd() * 0.3;
      const r = R * (0.82 + rnd() * 0.18);
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 0.92]);
    }
    const poly = (dx, dy) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0] + dx, pts[0][1] + dy);
      for (let i = 1; i < N; i++) {
        const [px, py] = pts[i], [qx, qy] = pts[(i + 1) % N];
        ctx.quadraticCurveTo(px + dx, py + dy, (px + qx) / 2 + dx, (py + qy) / 2 + dy);
      }
      ctx.closePath();
    };
    // gölge
    ctx.fillStyle = 'rgba(0,0,0,.35)'; poly(0, cs * 0.07); ctx.fill();
    // gövde
    const g = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    g.addColorStop(0, '#a9adb8'); g.addColorStop(0.55, '#7c808c'); g.addColorStop(1, '#565a66');
    ctx.fillStyle = g; poly(0, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(30,32,40,.55)'; ctx.lineWidth = Math.max(1, cs * 0.03); ctx.stroke();
    // üst parlama
    ctx.save(); poly(0, 0); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.ellipse(cx - R * 0.25, cy - R * 0.45, R * 0.55, R * 0.25, -0.4, 0, Math.PI * 2); ctx.fill();
    // benekler
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(40,42,52,.35)' : 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.arc(cx + (rnd() - 0.5) * R * 1.4, cy + (rnd() - 0.5) * R * 1.4, cs * (0.015 + rnd() * 0.025), 0, Math.PI * 2); ctx.fill();
    }
    // çatlaklar
    ctx.strokeStyle = 'rgba(35,37,46,.75)'; ctx.lineWidth = Math.max(1, cs * 0.025); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let c = 0; c < 2; c++) {
      let a = rnd() * Math.PI * 2, px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
      ctx.beginPath(); ctx.moveTo(px, py);
      const steps = 3 + (rnd() * 2 | 0);
      for (let k = 0; k < steps; k++) {
        const ta = Math.atan2(cy - py, cx - px) + (rnd() - 0.5) * 1.4;
        const len = R * (0.18 + rnd() * 0.2);
        px += Math.cos(ta) * len; py += Math.sin(ta) * len; ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Okun izleyeceği yol: gövde hücreleri (kuyruk->baş) + baştan ileri uzanan ışın
  function buildPath(a, cols, rows) {
    const pts = a.cells.map(([x, y]) => [x, y]);
    const ext = cols + rows + a.len + 6;
    for (let j = 1; j <= ext; j++) pts.push([a.x + DX[a.d] * j, a.y + DY[a.d] * j]);
    return pts;
  }
  function pointAt(path, t) {
    const i = Math.max(0, Math.min(path.length - 2, Math.floor(t))), f = t - i;
    return [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f];
  }

  function drawArrow(a, off, alpha, now) {
    const { cs, ox, oy } = layout;
    const dx = DX[a.d], dy = DY[a.d];
    let color = G.ch.colors[a.d];
    const flashing = now - a.flash < 450;
    if (flashing) color = ((now - a.flash) / 75 | 0) % 2 ? '#ff2d55' : '#ffffff';
    const L = a.len, t0 = off, t1 = off + L - 1;
    // gövde noktaları (hücre biriminde)
    const pts = [pointAt(a.path, t0)];
    for (let i = Math.floor(t0) + 1; i < t1; i++) pts.push(a.path[i]);
    pts.push(pointAt(a.path, t1));
    const toPx = ([x, y]) => [ox + (x + 0.5) * cs, oy + (y + 0.5) * cs];
    const P = pts.map(toPx);
    // kuyruk yönü (ilk parçanın yönü)
    let tdx = dx, tdy = dy;
    if (L > 1) {
      const nxt = pointAt(a.path, Math.min(Math.floor(t0) + 1, t1));
      const ddx = nxt[0] - pts[0][0], ddy = nxt[1] - pts[0][1], m = Math.hypot(ddx, ddy);
      if (m > 0.01) { tdx = ddx / m; tdy = ddy / m; }
    }
    let sc = 1;
    const pt = now - a.pop; if (pt < 160) sc = 1 + Math.sin(pt / 160 * Math.PI) * 0.12;
    const ht = a.hint ? now - a.hint : 1e9;
    const hinting = ht < 2400 || preview === a;
    const [hcx, hcy] = P[P.length - 1];
    const tipx = hcx + dx * cs * 0.32, tipy = hcy + dy * cs * 0.32;
    const bx = tipx - dx * cs * 0.27, by = tipy - dy * cs * 0.27;
    const hw = cs * 0.2 * sc, lw = cs * 0.12 * sc;
    const px = -dy, py = dx;
    P[0] = [P[0][0] - tdx * cs * 0.28, P[0][1] - tdy * cs * 0.28];
    P[P.length - 1] = [bx + dx * 2, by + dy * 2];
    ctx.globalAlpha = alpha;
    const shape = (col, yo, w) => {
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.lineWidth = w || lw;
      ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1] + yo);
      for (let i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1] + yo);
      ctx.stroke();
      ctx.lineWidth = cs * 0.06;
      ctx.beginPath(); ctx.moveTo(tipx, tipy + yo); ctx.lineTo(bx + px * hw, by + py * hw + yo); ctx.lineTo(bx - px * hw, by - py * hw + yo); ctx.closePath();
      ctx.fill(); ctx.stroke();
    };
    if (hinting) {
      const k = 0.5 + 0.5 * Math.sin(ht / 120);
      ctx.save(); ctx.shadowColor = '#fff'; ctx.shadowBlur = 18 + k * 16; shape('#ffffff', 0); ctx.restore();
    }
    shape(shade(color.startsWith('#') ? color : '#ffffff', -0.28), cs * 0.045);
    shape(color, 0);
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
