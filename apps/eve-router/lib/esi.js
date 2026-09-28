// Live sovereignty from CCP's public ESI API (no login needed).
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://esi.evetech.net';
const HEADERS = {
  'User-Agent': 'EVE Router Desktop (personal map tool)',
  'X-Compatibility-Date': '2025-12-16',
  'Accept': 'application/json'
};

async function getJson(paths, opts = {}) {
  let lastErr;
  for (const p of paths) {
    try {
      const res = await fetch(BASE + p, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
      if (res.ok) return await res.json();
      lastErr = new Error(`ESI ${p} -> HTTP ${res.status}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Resolve alliance / corporation / faction ids to names, 1000 at a time.
async function resolveNames(ids, cache) {
  const todo = [...new Set(ids)].filter((id) => id && !cache[id]);
  for (let i = 0; i < todo.length; i += 1000) {
    const chunk = todo.slice(i, i + 1000);
    try {
      const out = await getJson(['/universe/names', '/latest/universe/names/'], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      for (const r of out) cache[r.id] = { name: r.name, category: r.category };
    } catch (e) {
      // One bad id makes ESI reject the whole batch; fall back to one-by-one.
      for (const id of chunk) {
        try {
          const out = await getJson(['/universe/names', '/latest/universe/names/'], {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([id])
          });
          for (const r of out) cache[r.id] = { name: r.name, category: r.category };
        } catch (_) { /* skip */ }
      }
    }
  }
  return cache;
}

async function fetchSovereignty(dataDir) {
  const namesFile = path.join(dataDir, 'names-cache.json');
  let names = {};
  try { names = JSON.parse(fs.readFileSync(namesFile, 'utf8')); } catch (e) { /* first run */ }

  const map = await getJson(['/sovereignty/map', '/latest/sovereignty/map/']);
  const ids = [];
  const systems = {};
  for (const s of map) {
    if (!s.alliance_id && !s.faction_id) continue;
    systems[s.system_id] = { a: s.alliance_id || null, co: s.corporation_id || null, f: s.faction_id || null };
    if (s.alliance_id) ids.push(s.alliance_id);
    if (s.faction_id) ids.push(s.faction_id);
  }
  await resolveNames(ids, names);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(namesFile, JSON.stringify(names));

  const result = { fetchedAt: new Date().toISOString(), systems, names };
  fs.writeFileSync(path.join(dataDir, 'sov.json'), JSON.stringify(result));
  return result;
}

function loadCachedSov(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, 'sov.json'), 'utf8')); } catch (e) { return null; }
}

module.exports = { fetchSovereignty, loadCachedSov };
