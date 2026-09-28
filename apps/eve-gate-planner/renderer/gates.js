// Stargate route planning that mirrors EVE's autopilot settings.
// Works in the app (window.Gates) and in Node for tests (module.exports).
(function (root) {
  'use strict';

  // ---- security helpers ----
  // Displayed security, EVE style (0.0 < x < 0.05 shows as 0.1)
  function displaySec(s) {
    if (s > 0 && s < 0.05) return 0.1;
    return Math.round(s * 10) / 10;
  }
  function secClass(s) {
    const d = displaySec(s);
    if (d >= 0.5) return 'high';
    if (d > 0) return 'low';
    return 'null';
  }

  // ---- cost per jump, straight from CCP's published route-calculation guide ----
  //   penalty_cost = exp(0.15 × security_penalty)
  //   Shorter:      every jump costs 1
  //   Safer:        null (≤0.0) 2×penalty, low (<0.45) penalty, high 0.90
  //   Less secure:  null (≤0.0) 2×penalty, low (<0.45) 0.90,   high penalty
  function costFn(mode, securityPenalty) {
    const p = Math.exp(0.15 * securityPenalty);
    if (mode === 'safer') {
      return (sec) => (sec <= 0 ? 2 * p : sec < 0.45 ? p : 0.9);
    }
    if (mode === 'lesssecure') {
      return (sec) => (sec <= 0 ? 2 * p : sec < 0.45 ? 0.9 : p);
    }
    return () => 1;
  }

  // ---- graph ----
  // jumps: [[idA, idB], ...] stargates, bridges: [[idA, idB], ...] jump bridges (both directions)
  function buildGraph(jumps, bridges) {
    const g = new Map();
    const add = (a, b, type) => {
      if (!g.has(a)) g.set(a, []);
      g.get(a).push({ to: b, type });
    };
    for (const [a, b] of jumps) { add(a, b, 'gate'); add(b, a, 'gate'); }
    for (const [a, b] of bridges || []) { add(a, b, 'bridge'); add(b, a, 'bridge'); }
    return g;
  }

  class Heap {
    constructor() { this.a = []; }
    push(item, pri) {
      const a = this.a; a.push([pri, item]);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    }
    pop() {
      const a = this.a; const top = a[0]; const last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  // Dijkstra for one leg. Returns { path: [ids], types: [edgeType per hop] } or null.
  function shortest(graph, secOf, fromId, toId, cost, useBridges, blocked) {
    if (fromId === toId) return { path: [fromId], types: [] };
    const best = new Map([[fromId, 0]]);
    const prev = new Map();
    const heap = new Heap();
    heap.push(fromId, 0);
    while (heap.size) {
      const [c, cur] = heap.pop();
      if (c > (best.get(cur) ?? Infinity)) continue;
      if (cur === toId) break;
      for (const e of graph.get(cur) || []) {
        if (e.type === 'bridge' && !useBridges) continue;
        if (blocked.has(e.to) && e.to !== toId) continue;
        // tiny per-jump term: among equal-cost routes, take the one with fewer jumps
        const nc = c + cost(secOf(e.to)) + 1e-6;
        if (nc < (best.get(e.to) ?? Infinity)) {
          best.set(e.to, nc);
          prev.set(e.to, [cur, e.type]);
          heap.push(e.to, nc);
        }
      }
    }
    if (!prev.has(toId)) return null;
    const path = [toId], types = [];
    while (path[0] !== fromId) {
      const [p, t] = prev.get(path[0]);
      path.unshift(p); types.unshift(t);
    }
    return { path, types };
  }

  /**
   * opts: {
   *   systems: Map id -> {s (true sec), n (name)}, graph,
   *   stops: [fromId, ...waypointIds, toId],
   *   mode: 'shorter'|'safer'|'lesssecure', penalty: 0-100, useBridges: bool,
   *   avoid: Map id -> reason  (never applied to your own start / waypoints / destination)
   * }
   * Returns { legs: [{ from, to, path, types }], jumps } or { error, legIndex }.
   */
  function planRoute(opts) {
    const { systems, graph, stops } = opts;
    const cost = costFn(opts.mode, opts.penalty);
    const secOf = (id) => (systems.get(id) ? systems.get(id).s : 0);
    const stopSet = new Set(stops);
    const blocked = new Set([...(opts.avoid ? opts.avoid.keys() : [])].filter((id) => !stopSet.has(id)));
    const legs = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      const r = shortest(graph, secOf, a, b, cost, !!opts.useBridges, blocked);
      if (!r) {
        const na = systems.get(a) ? systems.get(a).n : a, nb = systems.get(b) ? systems.get(b).n : b;
        // Would it work without the avoid rules? Helps explain the failure.
        const loose = shortest(graph, secOf, a, b, cost, !!opts.useBridges, new Set());
        return {
          error: loose
            ? `No route from ${na} to ${nb} without passing through systems you're avoiding. Untick an avoid option or remove a system from your avoidance list.`
            : `${nb} can't be reached from ${na} by stargate${opts.useBridges ? ' or jump bridge' : ''}.`,
          legIndex: i
        };
      }
      legs.push({ from: a, to: b, path: r.path, types: r.types });
    }
    return { legs, jumps: legs.reduce((n, l) => n + l.types.length, 0) };
  }

  // ---- jump bridge list parsing ----
  // Accepts lines like "1DQ1-A » 8WA-Z6", "1DQ1-A <-> 8WA-Z6", "1DQ1-A,8WA-Z6", or Ansiblex
  // structure names like "1DQ1-A » 8WA-Z6 - Serenity Now". Takes the first two system names found.
  function parseBridges(text, byNameLower) {
    const pairs = [], unmatched = [];
    const seen = new Set();
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const tokens = line.split(/\s*(?:<->|<=>|<>|-->|->|=>|»|›|↔|→|,|;|\t|\|)\s*|\s+/).filter(Boolean);
      const found = [];
      for (let i = 0; i < tokens.length && found.length < 2; i++) {
        // try 3-, 2-, then 1-word names (e.g. "Promised Land")
        for (let w = 3; w >= 1; w--) {
          const cand = tokens.slice(i, i + w).join(' ').toLowerCase();
          const sys = byNameLower.get(cand);
          if (sys && !found.includes(sys.id)) { found.push(sys.id); i += w - 1; break; }
        }
      }
      if (found.length === 2) {
        const key = found[0] < found[1] ? `${found[0]}-${found[1]}` : `${found[1]}-${found[0]}`;
        if (!seen.has(key)) { seen.add(key); pairs.push(found); }
      } else {
        unmatched.push(line);
      }
    }
    return { pairs, unmatched };
  }

  const api = { displaySec, secClass, costFn, buildGraph, planRoute, parseBridges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gates = api;
})(typeof window !== 'undefined' ? window : globalThis);
