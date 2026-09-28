// Jump drive planning: ship ranges, legal cyno destinations, route search, fatigue, fuel.
// Works both in the app (window.Planner) and in Node for tests (module.exports).
(function (root) {
  'use strict';

  // Fallback ship classes, used only when the map data has no per-hull ship list.
  // max = range with Jump Drive Calibration V (base = half); fuel = isotopes per light-year.
  const SHIPS = [
    { id: 'carrier', name: 'Carrier', group: 'Carrier', max: 7, fuel: 3000 },
    { id: 'dread', name: 'Dreadnought', group: 'Dreadnought', max: 7, fuel: 3000 },
    { id: 'fax', name: 'Force Auxiliary', group: 'Force Auxiliary', max: 7, fuel: 3000 },
    { id: 'lancer', name: 'Lancer Dreadnought', group: 'Lancer Dreadnought', max: 8, fuel: 3000 },
    { id: 'super', name: 'Supercarrier', group: 'Supercarrier', max: 6, fuel: 3000 },
    { id: 'titan', name: 'Titan', group: 'Titan', max: 6, fuel: 3000 },
    { id: 'blops', name: 'Black Ops', group: 'Black Ops', max: 8, fuel: 700 },
    { id: 'jf', name: 'Jump Freighter', group: 'Jump Freighter', max: 10, fuel: 10000 },
    { id: 'rorqual', name: 'Rorqual', group: 'Capital Industrial Ship', max: 10, fuel: 4000 }
  ];

  // Jump fatigue distance reduction by ship group
  const FATIGUE_REDUCTION = { 'Black Ops': 0.75, 'Jump Freighter': 0.9, 'Capital Industrial Ship': 0.9 };
  // Ship skills that also cut jump fuel, 10% per level
  const FUEL_SKILLS = { 'Jump Freighter': 'Jump Freighters' };

  // Turn a hull from the map data ({ n, g, fuel, fuelType, range }) into the planner's ship shape.
  function fromHull(h) {
    return { id: 'h' + h.id, name: h.n, group: h.g, max: h.range * 2, fuel: h.fuel, fuelType: h.fuelType };
  }
  function fatigueReduction(ship) { return FATIGUE_REDUCTION[ship.group] || 0; }
  function fuelSkill(ship) { return FUEL_SKILLS[ship.group] || null; }

  /**
   * Isotopes for one jump:  ceil( LY × fuel/LY × (1 − 10% × Jump Fuel Conservation) × (1 − 10% × ship fuel skill) )
   */
  function fuelPerLy(ship, jfc, shipSkill) {
    return ship.fuel * (1 - 0.1 * jfc) * (fuelSkill(ship) ? 1 - 0.1 * (shipSkill || 0) : 1);
  }
  function fuelForJump(ly, ship, jfc, shipSkill) {
    return Math.ceil(ly * fuelPerLy(ship, jfc, shipSkill) - 1e-9);
  }

  const POCHVEN_REGION = 10000070;
  const ZARZAKH = 30100000;
  const JOVE_REGIONS = new Set([10000004, 10000017, 10000019]); // UUA-F4, J7HZ-F, A821-A

  function shipRange(ship, jdc) {
    return (ship.max / 2) * (1 + 0.2 * jdc);
  }

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

  // Can a cyno be lit here / can a jump drive land here?
  function canJumpTo(sys) {
    if (secClass(sys.s) === 'high') return false;
    if (sys.r === POCHVEN_REGION || JOVE_REGIONS.has(sys.r)) return false;
    if (sys.id === ZARZAKH) return false;
    return true;
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Simple binary heap for Dijkstra
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

  // Spatial grid so neighbour lookups don't scan the whole galaxy every time
  function buildGrid(systems, cell) {
    const g = new Map();
    for (const s of systems) {
      const k = `${Math.floor(s.x / cell)},${Math.floor(s.y / cell)},${Math.floor(s.z / cell)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(s);
    }
    return g;
  }

  function neighbours(grid, cell, sys, range) {
    const out = [];
    const cx = Math.floor(sys.x / cell), cy = Math.floor(sys.y / cell), cz = Math.floor(sys.z / cell);
    const n = Math.ceil(range / cell);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -n; k <= n; k++) {
      const list = grid.get(`${cx + i},${cy + j},${cz + k}`);
      if (!list) continue;
      for (const o of list) {
        if (o === sys) continue;
        const d = dist(sys, o);
        if (d <= range) out.push([o, d]);
      }
    }
    return out;
  }

  /**
   * Find a jump route.
   * opts: { range, mode: 'jumps'|'distance', avoid: Set<id>, fatigueReduction }
   * Returns { legs: [{from,to,ly}], totalLy } or null.
   */
  function planRoute(systems, fromId, toId, opts) {
    const byId = new Map(systems.map((s) => [s.id, s]));
    const from = byId.get(fromId), to = byId.get(toId);
    if (!from || !to) return { error: 'Unknown system.' };
    if (!canJumpTo(to)) return { error: `${to.n} can't be jumped to (high-sec, Pochven, Zarzakh and Jove space block cynos).` };
    const range = opts.range;
    const avoid = opts.avoid || new Set();
    const nodes = systems.filter((s) => s === from || (canJumpTo(s) && !avoid.has(s.id)));
    const cell = Math.max(2, range);
    const grid = buildGrid(nodes, cell);

    const best = new Map([[from.id, 0]]);
    const prev = new Map();
    const heap = new Heap();
    heap.push(from, 0);
    while (heap.size) {
      const [cost, cur] = heap.pop();
      if (cost > (best.get(cur.id) ?? Infinity)) continue;
      if (cur === to) break;
      for (const [nb, d] of neighbours(grid, cell, cur, range)) {
        // 'jumps' = fewest jumps, ties broken by shorter total distance
        const step = opts.mode === 'distance' ? d : 1 + d / 1000;
        const nc = cost + step;
        if (nc < (best.get(nb.id) ?? Infinity)) {
          best.set(nb.id, nc); prev.set(nb.id, cur); heap.push(nb, nc);
        }
      }
    }
    if (!prev.has(to.id) && from !== to) return { error: `No route: ${to.n} is out of reach with ${range.toFixed(2)} LY range.` };

    const path = [to];
    while (path[0] !== from) path.unshift(prev.get(path[0].id));
    const legs = [];
    let totalLy = 0;
    for (let i = 1; i < path.length; i++) {
      const ly = dist(path[i - 1], path[i]);
      totalLy += ly;
      legs.push({ from: path[i - 1], to: path[i], ly });
    }
    return { legs, totalLy, fatigue: fatigueFor(legs, opts.fatigueReduction || 0) };
  }

  /**
   * Fatigue estimate assuming you jump again as soon as the activation timer ends,
   * starting with no fatigue. Minutes.
   *   fatigue  = max(10 × (1+eLY), fatigue × (1+eLY)), capped at 300
   *   cooldown = max(1+eLY, fatigue / 10), capped at 30
   */
  function fatigueFor(legs, reduction) {
    let fatigue = 0;
    const steps = [];
    let elapsed = 0;
    legs.forEach((leg, i) => {
      const e = leg.ly * (1 - reduction);
      fatigue = Math.min(300, Math.max(10 * (1 + e), fatigue * (1 + e)));
      const cooldown = Math.min(30, Math.max(1 + e, fatigue / 10));
      steps.push({ fatigue, cooldown });
      if (i < legs.length - 1) {
        elapsed += cooldown;
        fatigue = Math.max(0, fatigue - cooldown); // decays in real time while you wait
      }
    });
    return { steps, finalFatigue: steps.length ? steps[steps.length - 1].fatigue : 0, travelMinutes: elapsed };
  }

  function inRange(systems, origin, range) {
    return systems.filter((s) => s !== origin && canJumpTo(s) && dist(origin, s) <= range);
  }

  const api = { SHIPS, fromHull, fatigueReduction, fuelSkill, fuelPerLy, fuelForJump, shipRange, displaySec, secClass, canJumpTo, dist, planRoute, fatigueFor, inRange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Planner = api;
})(typeof window !== 'undefined' ? window : globalThis);
