// Live intel shared by EVE Gate Planner and EVE Jump Planner:
//   • danger rating for a system from CCP's last-hour kills/jumps and zKillboard's last 7 days
//   • zKillboard 7-day kill counts, fetched gently (one system at a time) and cached for an hour
//   • "My pilots": where your own characters are right now, using the logins saved by the
//     Character Export page (same website, so the same browser storage). Website only.
// This file is identical in both apps. Edit one, copy it to the other.
(function () {
  'use strict';

  const ESI = 'https://esi.evetech.net/latest';
  const SSO = 'https://login.eveonline.com/v2/oauth/token';
  const LS_CHARS = 'net.export.chars';
  const LS_CLIENT = 'net.export.clientId';
  const BUILT_IN_CLIENT_ID = 'b019f00753ac4cdd9e4f6caf48a0bf4e'; // same public ID as the Character Export page
  const clientId = () => load(LS_CLIENT, '') || BUILT_IN_CLIENT_ID;
  const ZK_TTL = 60 * 60 * 1000;

  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- danger rating ----------
  // act  = { ship, pod, npc, jumps } for the last hour (CCP), may be null
  // week = zKillboard kills in the last 7 days (number), may be undefined
  // sec  = true security status
  function danger(sec, act, week) {
    const ship = (act && act.ship) || 0, pod = (act && act.pod) || 0, jumps = (act && act.jumps) || 0;
    const hs = Math.round(sec * 10) / 10 >= 0.5;
    const why = [];
    let level = 0; // 0 none, 1 caution, 2 danger
    const bump = (l, text) => { level = Math.max(level, l); why.push(text); };

    if ((ship >= 1 && pod >= 1) || ship + pod >= 4) bump(2, `${ship} ship${ship === 1 ? '' : 's'}, ${pod} pod${pod === 1 ? '' : 's'} killed in the last hour`);
    else if (ship + pod >= (hs ? 2 : 1)) bump(1, `${ship + pod} kill${ship + pod === 1 ? '' : 's'} in the last hour`);

    if (week != null) {
      if (week >= (hs ? 100 : 40)) bump(2, `${week >= 200 ? '200+' : week} kills in the last 7 days (camp or hot spot)`);
      else if (week >= (hs ? 40 : 10)) bump(1, `${week} kills in the last 7 days`);
    }
    if (!hs && jumps >= 150) bump(1, `busy: ${jumps} jumps in the last hour`);
    return { level, why, label: level === 2 ? 'Danger' : level === 1 ? 'Caution' : '' };
  }

  // ---------- zKillboard, last 7 days ----------
  const zk = new Map(); // id -> count
  const zkPending = new Set();
  let zkQueue = [], zkRunning = false, zkListener = null;

  function zkCached(id) {
    if (zk.has(id)) return zk.get(id);
    const c = load('li.zk.' + id, null);
    if (c && Date.now() - c.t < ZK_TTL) { zk.set(id, c.n); return c.n; }
    return undefined;
  }

  async function zkRun() {
    if (zkRunning) return;
    zkRunning = true;
    while (zkQueue.length) {
      const id = zkQueue.shift();
      try {
        const res = await fetch(`https://zkillboard.com/api/kills/solarSystemID/${id}/pastSeconds/604800/`, { headers: { Accept: 'application/json' } });
        if (res.ok) {
          const rows = await res.json();
          const n = Array.isArray(rows) ? rows.length : 0;
          zk.set(id, n); save('li.zk.' + id, { n, t: Date.now() });
          if (zkListener) zkListener(id, n);
        } else if (res.status === 429) { zkQueue.unshift(id); await sleep(5000); continue; }
      } catch (e) { /* offline or blocked: just skip */ }
      zkPending.delete(id);
      await sleep(1100); // zKillboard asks for gentle use
    }
    zkRunning = false;
  }

  // Ask for 7-day counts. Calls onUpdate(id, count) as each arrives.
  function zkWeek(ids, onUpdate) {
    zkListener = onUpdate;
    const out = {};
    for (const id of ids) {
      const c = zkCached(id);
      if (c !== undefined) out[id] = c;
      else if (!zkPending.has(id)) { zkPending.add(id); zkQueue.push(id); }
    }
    zkRun();
    return out;
  }

  // ---------- my pilots (website only) ----------
  function pilotsAvailable() {
    const chars = load(LS_CHARS, {});
    return !!(window.api && window.api.web && clientId() && Object.keys(chars).length);
  }

  async function token(c) {
    if (c.access && c.exp - 60000 > Date.now()) return c.access;
    const res = await fetch(SSO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh, client_id: clientId() })
    });
    if (!res.ok) throw new Error('login expired, add the character again on the Character Export page');
    const t = await res.json();
    const p = JSON.parse(atob(t.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const chars = load(LS_CHARS, {});
    chars[c.id] = { ...(chars[c.id] || c), access: t.access_token, refresh: t.refresh_token, exp: p.exp * 1000 };
    save(LS_CHARS, chars);
    return t.access_token;
  }

  async function esi(path, tok) {
    const res = await fetch(ESI + path, { headers: { Accept: 'application/json', Authorization: 'Bearer ' + tok } });
    if (!res.ok) throw new Error(res.status === 403 ? 'location permission missing' : `ESI ${res.status}`);
    return res.json();
  }

  const typeNames = {};
  async function names(ids) {
    const need = [...new Set(ids)].filter((id) => id && !typeNames[id]);
    if (!need.length) return;
    try {
      const res = await fetch(ESI + '/universe/names/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(need) });
      if (res.ok) for (const r of await res.json()) typeNames[r.id] = r.name;
    } catch (e) { /* names are a nice-to-have */ }
  }

  // Returns [{ id, name, systemId, docked, stationName, shipType, shipName, error }]
  async function loadPilots() {
    const chars = Object.values(load(LS_CHARS, {})).sort((a, b) => a.name.localeCompare(b.name));
    const out = await Promise.all(chars.map(async (c) => {
      try {
        const tok = await token(c);
        const [loc, ship] = await Promise.all([esi(`/characters/${c.id}/location/`, tok), esi(`/characters/${c.id}/ship/`, tok)]);
        return { id: c.id, name: c.name, systemId: loc.solar_system_id, stationId: loc.station_id || null,
          structureId: loc.structure_id || null, docked: !!(loc.station_id || loc.structure_id), shipTypeId: ship.ship_type_id, shipName: ship.ship_name };
      } catch (e) { return { id: c.id, name: c.name, error: String(e.message || e) }; }
    }));
    await names(out.flatMap((p) => [p.shipTypeId, p.stationId]));
    for (const p of out) {
      if (p.shipTypeId) p.shipType = typeNames[p.shipTypeId] || 'Ship';
      if (p.stationId) p.stationName = typeNames[p.stationId] || null;
    }
    return out;
  }

  window.LiveIntel = { danger, zkWeek, zkCached, pilotsAvailable, loadPilots };
})();
