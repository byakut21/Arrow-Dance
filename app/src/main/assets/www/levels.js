/* Arrow Dance — seviye üretici
 * Her seviye, seviye numarasından türetilen sabit bir tohumla (seed) üretilir.
 * Böylece herkes aynı bulmacayı oynar ve küresel liderlik tablosu adil olur.
 * Üretilen her bulmacanın çözülebilir olduğu garanti edilir.
 */
(function (root) {
  'use strict';
  // Yönler: 0=Yukarı 1=Sağ 2=Aşağı 3=Sol
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function levelParams(n) {
    return {
      cols: Math.min(4 + Math.floor((n - 1) / 5), 9),
      rows: Math.min(5 + Math.floor((n - 1) / 4), 13),
      density: Math.min(0.55 + n * 0.012, 0.9),
      maxLen: n < 6 ? 1 : n < 16 ? 2 : n < 35 ? 3 : 4,
      walls: n < 11 ? 0 : Math.min(1 + Math.floor((n - 11) / 5), 9),
      chainBias: Math.min(0.35 + n * 0.02, 0.92),
      targetDepth: Math.min(2 + Math.floor(n / 3), 16),
    };
  }

  // Ok hücreleri: kuyruktan başa doğru
  function cellsOf(x, y, d, len) {
    const c = [];
    for (let k = len - 1; k >= 0; k--) c.push([x - DX[d] * k, y - DY[d] * k]);
    return c;
  }

  // Okun önündeki ilk engel. null => yol açık (ok çıkabilir)
  function firstBlock(grid, cols, rows, a) {
    let x = a.x + DX[a.d], y = a.y + DY[a.d], k = 0;
    while (x >= 0 && y >= 0 && x < cols && y < rows) {
      const v = grid[y * cols + x];
      if (v !== -1) return { k, v, x, y };
      x += DX[a.d]; y += DY[a.d]; k++;
    }
    return null;
  }

  function makeGrid(cols, rows, walls, arrows) {
    const grid = new Int16Array(cols * rows).fill(-1);
    for (const w of walls) grid[w[1] * cols + w[0]] = -2;
    arrows.forEach((a, i) => { for (const c of a.cells) grid[c[1] * cols + c[0]] = i; });
    return grid;
  }

  // Açgözlü çözücü: bir okun çıkması başka hiçbir okun yolunu kapatmaz,
  // bu yüzden "çıkabilen herkesi çıkar" yaklaşımı çözülebilirliği kesin belirler.
  function analyze(cols, rows, walls, arrows) {
    const grid = makeGrid(cols, rows, walls, arrows);
    let alive = arrows.map((_, i) => i), rounds = 0, initFree = 0;
    while (alive.length) {
      const free = alive.filter(i => !firstBlock(grid, cols, rows, arrows[i]));
      if (!free.length) return { solvable: false, rounds, initFree };
      if (rounds === 0) initFree = free.length;
      for (const i of free) for (const c of arrows[i].cells) grid[c[1] * cols + c[0]] = -1;
      const fs = new Set(free);
      alive = alive.filter(i => !fs.has(i));
      rounds++;
    }
    return { solvable: true, rounds, initFree };
  }

  function buildOnce(p, rng) {
    const { cols, rows } = p;
    const occ = new Int16Array(cols * rows).fill(-1);
    const walls = [];
    for (let i = 0; i < p.walls; i++) {
      for (let t = 0; t < 30; t++) {
        const x = (rng() * cols) | 0, y = (rng() * rows) | 0;
        if (occ[y * cols + x] === -1) { occ[y * cols + x] = -2; walls.push([x, y]); break; }
      }
    }
    const arrows = [];
    const area = cols * rows - walls.length;
    const target = Math.round(area * p.density);
    let filled = 0, fails = 0;
    const maxFails = area * 6;

    while (filled < target && fails < maxFails) {
      const x = (rng() * cols) | 0, y = (rng() * rows) | 0;
      if (occ[y * cols + x] !== -1) { fails++; continue; }
      // Uzun oklara hafif eğilim
      const want = 1 + Math.floor(Math.pow(rng(), 0.7) * p.maxLen);
      const cands = [];
      for (const d of shuffle([0, 1, 2, 3], rng)) {
        for (let L = want; L >= 1; L--) {
          const cells = cellsOf(x, y, d, L);
          if (!cells.every(([cx, cy]) => cx >= 0 && cy >= 0 && cx < cols && cy < rows && occ[cy * cols + cx] === -1)) continue;
          const a = { x, y, d, len: L, cells };
          arrows.push(a);
          const ok = analyze(cols, rows, walls, arrows).solvable;
          arrows.pop();
          if (ok) {
            const blocked = !!firstBlock(occ, cols, rows, a);
            cands.push({ a, blocked });
            break;
          }
        }
      }
      if (!cands.length) { fails++; continue; }
      let pick;
      const blockedOnes = cands.filter(c => c.blocked);
      if (blockedOnes.length && rng() < p.chainBias) pick = blockedOnes[0];
      else pick = cands[0];
      const idx = arrows.length;
      arrows.push(pick.a);
      for (const c of pick.a.cells) occ[c[1] * cols + c[0]] = idx;
      filled += pick.a.len;
    }
    return { cols, rows, walls, arrows };
  }

  const HANDMADE = {
    1: { cols: 3, rows: 4, walls: [], arrows: [
      { x: 1, y: 0, d: 0, len: 1 }, { x: 1, y: 2, d: 0, len: 2 }, { x: 0, y: 3, d: 1, len: 1 }, { x: 2, y: 3, d: 2, len: 1 } ] },
    2: { cols: 4, rows: 4, walls: [], arrows: [
      { x: 0, y: 0, d: 1, len: 1 }, { x: 3, y: 0, d: 0, len: 1 }, { x: 1, y: 1, d: 3, len: 1 }, { x: 0, y: 1, d: 0, len: 3 },
      { x: 2, y: 1, d: 0, len: 2 }, { x: 2, y: 3, d: 3, len: 2 }, { x: 3, y: 1, d: 0, len: 2 } ] },
  };

  // Seviye geçerli mi? Tüm hücreler tahtada, çakışma yok, çözülebilir.
  function validate(lv) {
    const seen = new Set(lv.walls.map(([x, y]) => y * lv.cols + x));
    for (const a of lv.arrows) for (const [x, y] of a.cells) {
      if (x < 0 || y < 0 || x >= lv.cols || y >= lv.rows) return 'tahta dışında';
      const k = y * lv.cols + x;
      if (seen.has(k)) return 'çakışma';
      seen.add(k);
    }
    return analyze(lv.cols, lv.rows, lv.walls, lv.arrows).solvable ? null : 'çözülemez';
  }

  function generateLevel(n) {
    if (HANDMADE[n]) {
      const h = HANDMADE[n];
      const arrows = h.arrows.map(a => ({ ...a, cells: cellsOf(a.x, a.y, a.d, a.len) }));
      const r = analyze(h.cols, h.rows, h.walls, arrows);
      return { n, cols: h.cols, rows: h.rows, walls: h.walls, arrows, depth: r.rounds };
    }
    const p = levelParams(n);
    const rng = mulberry32((Math.imul(n, 2654435761) ^ 0x5EED1234) >>> 0);
    let best = null, bestScore = -Infinity;
    for (let attempt = 0; attempt < 6; attempt++) {
      const lv = buildOnce(p, rng);
      if (lv.arrows.length < 2) continue;
      const r = analyze(lv.cols, lv.rows, lv.walls, lv.arrows);
      if (!r.solvable) continue;
      const cover = lv.arrows.reduce((s, a) => s + a.len, 0) / (lv.cols * lv.rows);
      const score = -Math.abs(r.rounds - p.targetDepth) * 3 + cover * 10 - r.initFree * 0.3;
      if (score > bestScore) { bestScore = score; best = { ...lv, depth: r.rounds }; }
      if (r.rounds >= p.targetDepth && cover > p.density * 0.85) break;
    }
    best.n = n;
    return best;
  }

  const api = { DX, DY, generateLevel, validate, levelParams, analyze, firstBlock, makeGrid, cellsOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArrowLevels = api;
})(this);
