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
    const cols = Math.min(5 + Math.floor((n - 1) / 3), 12);
    return {
      cols,
      rows: Math.min(Math.round(cols * 1.5), 18),
      density: Math.min(0.55 + n * 0.012, 0.9),
      maxLen: n < 3 ? 2 : n < 6 ? 4 : n < 12 ? 6 : n < 25 ? 8 : n < 50 ? 10 : 12,
      turn: n < 3 ? 0 : Math.min(0.72 + n * 0.008, 0.93), // kıvrılma olasılığı
      walls: n < 11 ? 0 : Math.min(1 + Math.floor((n - 11) / 4), 14),
      chainBias: Math.min(0.5 + n * 0.02, 0.97),
      targetDepth: Math.min(3 + Math.floor(n * 0.6), 32),
    };
  }

  // Ok hücreleri: kuyruktan başa doğru
  function cellsOf(x, y, d, len) {
    const c = [];
    for (let k = len - 1; k >= 0; k--) c.push([x - DX[d] * k, y - DY[d] * k]);
    return c;
  }

  // Kıvrımlı ok: baştan geriye doğru rastgele yürüyerek gövde oluşturur.
  // Son parça her zaman başın yönündedir (ok başı gövdeyle aynı yöne bakar).
  function snakeCells(x, y, d, L, occ, cols, rows, rng, turn) {
    const cells = [[x, y]], used = new Set([y * cols + x]);
    let bd = (d + 2) % 4, cx = x, cy = y; // geriye yürüme yönü
    for (let i = 1; i < L; i++) {
      let opts;
      if (i === 1) opts = [bd];
      else if (rng() < turn) opts = rng() < 0.5 ? [(bd + 1) % 4, (bd + 3) % 4, bd] : [(bd + 3) % 4, (bd + 1) % 4, bd];
      else opts = [bd, (bd + 1) % 4, (bd + 3) % 4];
      let moved = false;
      for (const nd of opts) {
        const nx = cx + DX[nd], ny = cy + DY[nd], k = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || occ[k] !== -1 || used.has(k)) continue;
        cx = nx; cy = ny; bd = nd; cells.push([nx, ny]); used.add(k); moved = true; break;
      }
      if (!moved) break;
    }
    return cells.reverse(); // kuyruk -> baş
  }

  function bends(c) {
    let b = 0;
    for (let i = 2; i < c.length; i++)
      if (c[i][0] - c[i - 1][0] !== c[i - 1][0] - c[i - 2][0] || c[i][1] - c[i - 1][1] !== c[i - 1][1] - c[i - 2][1]) b++;
    return b;
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
        const cells = snakeCells(x, y, d, want, occ, cols, rows, rng, p.turn);
        const a = { x, y, d, len: cells.length, cells };
        arrows.push(a);
        const ok = analyze(cols, rows, walls, arrows).solvable;
        arrows.pop();
        if (!ok) continue;
        // Zorluk puanı: kendi yolu kapalı mı + gövdesi kaç okun yolunu kesiyor
        let score = firstBlock(occ, cols, rows, a) ? 1 : 0;
        const mine = new Set(cells.map(([cx, cy]) => cy * cols + cx));
        for (const b of arrows) {
          let bx = b.x + DX[b.d], by = b.y + DY[b.d];
          while (bx >= 0 && by >= 0 && bx < cols && by < rows) {
            if (mine.has(by * cols + bx)) { score++; break; }
            if (occ[by * cols + bx] !== -1) break;
            bx += DX[b.d]; by += DY[b.d];
          }
        }
        cands.push({ a, score: score + bends(cells) * 1.2 });
      }
      if (!cands.length) { fails++; continue; }
      let pick = cands[0];
      if (rng() < p.chainBias) for (const c of cands) if (c.score > pick.score) pick = c;
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
    for (const a of lv.arrows) {
      for (let i = 1; i < a.cells.length; i++) {
        const [px, py] = a.cells[i - 1], [qx, qy] = a.cells[i];
        if (Math.abs(px - qx) + Math.abs(py - qy) !== 1) return 'kopuk gövde';
      }
      const h = a.cells[a.cells.length - 1];
      if (h[0] !== a.x || h[1] !== a.y || a.len !== a.cells.length) return 'baş uyumsuz';
      if (a.cells.length > 1) {
        const t = a.cells[a.cells.length - 2];
        if (h[0] - t[0] !== DX[a.d] || h[1] - t[1] !== DY[a.d]) return 'baş yönü uyumsuz';
      }
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
    for (let attempt = 0; attempt < 8; attempt++) {
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
