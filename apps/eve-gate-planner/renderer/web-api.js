// Browser / phone version of window.api.
// The desktop (Electron) app defines window.api in preload.js; this file only fills in
// when the page is opened as a website, so the same UI code runs in both places.
(function () {
  'use strict';
  if (window.api) return; // running inside the desktop app

  const ESI = 'https://esi.evetech.net';
  const DATA_URL = '../data/universe.json';
  let progressCb = null;

  const cacheGet = (k) => { try { return JSON.parse(localStorage.getItem('esi.' + k)); } catch (e) { return null; } };
  const cachePut = (k, v) => { try { localStorage.setItem('esi.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } };

  // Try the current ESI route with a compatibility date, then plain, then the legacy /latest/ route.
  async function esi(paths, opts = {}) {
    let lastErr;
    for (const p of paths) {
      for (const withDate of [true, false]) {
        try {
          const headers = { Accept: 'application/json', ...(opts.headers || {}) };
          if (withDate && !p.startsWith('/latest')) headers['X-Compatibility-Date'] = '2025-12-16';
          const res = await fetch(ESI + p, { ...opts, headers });
          if (res.ok) return await res.json();
          lastErr = new Error(`ESI ${p} -> HTTP ${res.status}`);
          break; // server answered: don't retry the same route without the header
        } catch (e) {
          lastErr = e; // network / CORS error: retry without the custom header
          if (p.startsWith('/latest')) break;
        }
      }
    }
    throw lastErr;
  }

  async function resolveNames(ids, names) {
    const todo = [...new Set(ids)].filter((id) => id && !names[id]);
    const post = (chunk) => esi(['/universe/names', '/latest/universe/names/'], {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(chunk)
    });
    for (let i = 0; i < todo.length; i += 1000) {
      const chunk = todo.slice(i, i + 1000);
      try {
        for (const r of await post(chunk)) names[r.id] = { name: r.name, category: r.category };
      } catch (e) {
        for (const id of chunk) {
          try { for (const r of await post([id])) names[r.id] = { name: r.name, category: r.category }; } catch (_) { /* skip */ }
        }
      }
    }
    return names;
  }

  async function cached(key, maxAgeMs, refresh, fetcher) {
    const c = cacheGet(key);
    const fresh = c && Date.now() - new Date(c.fetchedAt).getTime() < maxAgeMs;
    if (fresh && !refresh) return c;
    try {
      const v = await fetcher();
      cachePut(key, v);
      return v;
    } catch (e) {
      if (c) return { ...c, offline: true, error: String(e.message || e) };
      throw e;
    }
  }

  async function getUniverse() {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Map data missing (HTTP ${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !progressCb) return res.json();
    const reader = res.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      progressCb({ stage: 'download', got, total });
    }
    return JSON.parse(new TextDecoder().decode(await new Blob(parts).arrayBuffer()));
  }

  async function getSov(refresh) {
    return cached('sov', 60 * 60 * 1000, refresh, async () => {
      const map = await esi(['/sovereignty/map', '/latest/sovereignty/map/']);
      const systems = {}, ids = [];
      for (const s of map) {
        if (!s.alliance_id && !s.faction_id) continue;
        systems[s.system_id] = { a: s.alliance_id || null, co: s.corporation_id || null, f: s.faction_id || null };
        if (s.alliance_id) ids.push(s.alliance_id);
        if (s.faction_id) ids.push(s.faction_id);
      }
      const names = await resolveNames(ids, cacheGet('names') || {});
      cachePut('names', names);
      return { fetchedAt: new Date().toISOString(), systems, names };
    });
  }

  async function getKills(refresh) {
    return cached('kills', 10 * 60 * 1000, refresh, async () => {
      const rows = await esi(['/universe/system_kills', '/latest/universe/system_kills/']);
      const systems = {};
      for (const r of rows) {
        if (!r.ship_kills && !r.pod_kills && !r.npc_kills) continue;
        systems[r.system_id] = { ship: r.ship_kills || 0, pod: r.pod_kills || 0, npc: r.npc_kills || 0 };
      }
      return { fetchedAt: new Date().toISOString(), systems };
    });
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(String(text)); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = String(text); document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
  }

  window.api = {
    web: true,
    getUniverse,
    getSov,
    getKills,
    openExternal: async (url) => { if (/^https:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    copy,
    onProgress: (cb) => { progressCb = cb; }
  };

  // Installable app + offline support on phones
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
