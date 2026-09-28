// Quick self-test for the jump planner and SDE conversion. Run: npm test
'use strict';
const assert = require('assert');
const P = require('../renderer/planner');
const { buildUniverse } = require('../lib/sde');

const LY = 9.46e15;
const sys = (id, name, x, sec, region = 10000001) => ({
  _key: id, name: { en: name }, position: { x: x * LY, y: 0, z: 0 },
  securityStatus: sec, regionID: region, constellationID: 20000001
});

// A line of systems, 3 LY apart, with a high-sec system in the middle and a wormhole to be dropped
const raw = {
  regions: [{ _key: 10000001, name: { en: 'Testland' } }, { _key: 10000070, name: { en: 'Pochven' } }],
  constellations: [{ _key: 20000001, name: { en: 'Alpha' } }],
  systems: [
    sys(30000001, 'A', 0, -0.2),
    sys(30000002, 'B', 3, -0.4),
    sys(30000003, 'C', 6, 0.9),           // high-sec: can't land
    sys(30000004, 'D', 6.5, 0.3),
    sys(30000005, 'E', 9, 0.1),
    sys(30000006, 'F', 12, -1.0),
    sys(30000007, 'P', 15, -1.0, 10000070), // Pochven: can't land
    sys(31000001, 'J123456', 1, -1.0)      // wormhole: dropped
  ],
  stargates: [
    { _key: 1, solarSystemID: 30000001, destination: { solarSystemID: 30000002 } },
    { _key: 2, solarSystemID: 30000002, destination: { solarSystemID: 30000001 } },
    { _key: 3, solarSystemID: 30000001, destination: { solarSystemID: 31000001 } }
  ]
};

const u = buildUniverse(raw);
assert.strictEqual(u.systems.length, 7, 'wormhole system dropped');
assert.deepStrictEqual(u.jumps, [[30000001, 30000002]], 'gates de-duplicated, wormhole gate dropped');
assert.strictEqual(u.regions[10000001], 'Testland');
assert.ok(Math.abs(u.systems[1].x - 3) < 1e-9, 'positions converted to light-years');

// Ranges
const carrier = P.SHIPS.find((s) => s.id === 'carrier');
assert.strictEqual(P.shipRange(carrier, 5), 7);
assert.strictEqual(P.shipRange(carrier, 0), 3.5);
assert.ok(Math.abs(P.shipRange(carrier, 4) - 6.3) < 1e-9);
assert.strictEqual(P.shipRange(P.SHIPS.find((s) => s.id === 'jf'), 5), 10);

// Security display
assert.strictEqual(P.displaySec(0.02), 0.1);
assert.strictEqual(P.secClass(0.46), 'high');
assert.strictEqual(P.secClass(0.44), 'low');
assert.strictEqual(P.secClass(-0.1), 'null');

// Routes
const S = u.systems;
let r = P.planRoute(S, 30000001, 30000006, { range: 3.5, mode: 'jumps' });
assert.ok(r.legs, r.error);
const names = [r.legs[0].from.n, ...r.legs.map((l) => l.to.n)];
assert.ok(!names.includes('C'), 'never lands in high-sec');
assert.deepStrictEqual(names, ['A', 'B', 'D', 'E', 'F']);

r = P.planRoute(S, 30000001, 30000006, { range: 7, mode: 'jumps' });
assert.strictEqual(r.legs.length, 2, '7 LY: A -> D (6.5) -> F (5.5)');

r = P.planRoute(S, 30000001, 30000006, { range: 3.5, mode: 'jumps', avoid: new Set([30000004]) });
assert.ok(r.error, 'avoiding D breaks the only 3.5 LY path');

r = P.planRoute(S, 30000001, 30000003, { range: 10, mode: 'jumps' });
assert.ok(/can't be jumped/.test(r.error), 'high-sec destination refused');
r = P.planRoute(S, 30000006, 30000007, { range: 10, mode: 'jumps' });
assert.ok(r.error, 'Pochven destination refused');

// Starting in high-sec is allowed (e.g. jump freighter)
r = P.planRoute(S, 30000003, 30000006, { range: 7, mode: 'jumps' });
assert.ok(r.legs && r.legs.length === 1);

// Fatigue: one 5 LY jump from fresh = 60 min fatigue, 6 min timer
let f = P.fatigueFor([{ ly: 5 }], 0);
assert.strictEqual(f.steps[0].fatigue, 60);
assert.strictEqual(f.steps[0].cooldown, 6);
// JF 90% reduction: 5 LY counts as 0.5 -> 15 min fatigue
f = P.fatigueFor([{ ly: 5 }], 0.9);
assert.ok(Math.abs(f.steps[0].fatigue - 15) < 1e-9);
// Cap at 5 hours and 30 min timer
f = P.fatigueFor(Array(6).fill({ ly: 7 }), 0);
assert.strictEqual(f.finalFatigue, 300);
assert.strictEqual(f.steps[5].cooldown, 30);

console.log('All planner tests passed ✔');
