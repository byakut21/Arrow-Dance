/* Küresel liderlik tablosu — Firebase Realtime Database REST API (SDK gerekmez) */
(function () {
  'use strict';
  const cfg = window.ARROW_CONFIG || {};
  const base = () => (cfg.firebaseDbUrl || '').replace(/\/+$/, '');
  const QUEUE_KEY = 'arrowdance_lb_pending';

  async function put(entry) {
    const r = await fetch(`${base()}/leaderboard/${encodeURIComponent(entry.id)}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: entry.name, score: entry.score, level: entry.level,
        stars: entry.stars, ts: Date.now(),
      }),
    });
    return r.ok;
  }

  window.Leaderboard = {
    enabled() { return !!base(); },

    // Skoru gönderir; çevrimdışıysa sıraya alır ve sonra tekrar dener.
    async submit(entry) {
      if (!this.enabled()) return false;
      try {
        const ok = await put(entry);
        if (ok) localStorage.removeItem(QUEUE_KEY);
        else localStorage.setItem(QUEUE_KEY, JSON.stringify(entry));
        return ok;
      } catch (e) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(entry));
        return false;
      }
    },

    async flush() {
      const raw = localStorage.getItem(QUEUE_KEY);
      if (raw) { try { await this.submit(JSON.parse(raw)); } catch (e) { /* sonra */ } }
    },

    async top(limit = 100) {
      if (!this.enabled()) throw new Error('disabled');
      let r = await fetch(`${base()}/leaderboard.json?orderBy=%22score%22&limitToLast=${limit}`);
      if (!r.ok) r = await fetch(`${base()}/leaderboard.json`); // indeks tanımlı değilse
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = (await r.json()) || {};
      return Object.entries(data)
        .map(([id, v]) => ({ id, ...v }))
        .filter(e => typeof e.score === 'number')
        .sort((a, b) => b.score - a.score || (a.ts || 0) - (b.ts || 0))
        .slice(0, limit);
    },

    // ---- Bölüm istatistikleri (gerçek oyuncu verisi) ----
    // stats/{seviye} = { tried, won, fails, easy, mid, hard }
    inc(level, field) {
      if (!this.enabled()) return;
      try {
        fetch(`${base()}/stats/${level}.json`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: { '.sv': { increment: 1 } } }),
        }).catch(() => {});
      } catch (e) { /* çevrimdışı */ }
    },
    async stats(level) {
      if (!this.enabled()) return null;
      const ctl = window.AbortController ? new AbortController() : null;
      const to = setTimeout(() => ctl && ctl.abort(), 3500);
      try {
        const r = await fetch(`${base()}/stats/${level}.json`, ctl ? { signal: ctl.signal } : {});
        if (!r.ok) return null;
        const d = (await r.json()) || {};
        const num = (k) => (typeof d[k] === 'number' ? d[k] : 0);
        return { tried: num('tried'), won: num('won'), fails: num('fails'), easy: num('easy'), mid: num('mid'), hard: num('hard') };
      } catch (e) { return null; } finally { clearTimeout(to); }
    },

    // Oyuncunun sırası (kendi skorundan yüksek kaç kişi var + 1)
    async rankOf(score) {
      if (!this.enabled()) return null;
      try {
        const r = await fetch(`${base()}/leaderboard.json?orderBy=%22score%22&startAt=${score + 1}&shallow=false`);
        if (!r.ok) return null;
        const data = (await r.json()) || {};
        return Object.keys(data).length + 1;
      } catch (e) { return null; }
    },
  };
})();
