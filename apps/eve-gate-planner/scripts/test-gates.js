// Self-test for the gate route planner. Run: npm test
'use strict';
const assert = require('assert');
const G = require('../renderer/gates');
const SP = require('../renderer/special-systems');

// Test galaxy:
//   A(0.9) - B(0.9) - C(0.9) - D(0.9)      long high-sec road
//   A - X(0.2) - D                          short low-sec cut
//   D - N1(-0.3) - N2(-0.6)                 null-sec tail
//   A - L1(0.3) - L2(0.1) - L3(0.4) - D     long low-sec road (for Less Secure)
//   Z(0.5) isolated
const S = new Map(Object.entries({
  1: { n: 'A', s: 0.9 }, 2: { n: 'B', s: 0.9 }, 3: { n: 'C', s: 0.8 }, 4: { n: 'D', s: 0.7 },
  5: { n: 'X', s: 0.2 }, 6: { n: 'N1', s: -0.3 }, 7: { n: 'N2', s: -0.6 },
  8: { n: 'L1', s: 0.3 }, 9: { n: 'L2', s: 0.1 }, 10: { n: 'L3', s: 0.4 }, 11: { n: 'Z', s: 0.5 },
  12: { n: 'Promised Land', s: 0.6 }
}).map(([k, v]) => [+k, { id: +k, ...v }]));
const jumps = [[1, 2], [2, 3], [3, 4], [1, 5], [5, 4], [4, 6], [6, 7], [1, 8], [8, 9], [9, 10], [10, 4]];
const graph = G.buildGraph(jumps, []);
const names = (r) => r.legs.flatMap((l, i) => l.path.slice(i ? 1 : 0)).map((id) => S.get(id).n).join('-');
const run = (o) => G.planRoute({ systems: S, graph, penalty: 50, ...o });

// Cost function matches CCP's formula
const safer = G.costFn('safer', 50);
assert.ok(Math.abs(safer(0.9) - 0.9) < 1e-12);
assert.ok(Math.abs(safer(0.3) - Math.exp(7.5)) < 1e-6);
assert.ok(Math.abs(safer(-0.2) - 2 * Math.exp(7.5)) < 1e-6);
assert.ok(Math.abs(safer(0.0) - 2 * Math.exp(7.5)) < 1e-6, '0.0 counts as null');
assert.ok(Math.abs(safer(0.45) - 0.9) < 1e-12, '0.45 counts as high-sec');
const less = G.costFn('lesssecure', 50);
assert.ok(Math.abs(less(0.3) - 0.9) < 1e-12 && Math.abs(less(0.8) - Math.exp(7.5)) < 1e-6);
assert.strictEqual(G.costFn('shorter', 50)(-1), 1);

// Modes
assert.strictEqual(names(run({ stops: [1, 4], mode: 'shorter' })), 'A-X-D');
assert.strictEqual(names(run({ stops: [1, 4], mode: 'safer' })), 'A-B-C-D');
assert.strictEqual(names(run({ stops: [1, 4], mode: 'safer', penalty: 0 })), 'A-X-D', 'penalty 0: low-sec costs 1, cheaper than 3 high-sec jumps');
// A -> L3, both 3 jumps: via L1-L2 (all low-sec) or via X-D (enters high-sec D)
assert.strictEqual(names(run({ stops: [1, 10], mode: 'lesssecure' })), 'A-L1-L2-L3');
assert.strictEqual(names(run({ stops: [1, 10], mode: 'safer' })), 'A-B-C-D-L3', 'stays in high-sec until the last jump');
assert.strictEqual(names(run({ stops: [1, 10], mode: 'shorter' })).split('-').length, 4);
assert.strictEqual(run({ stops: [1, 4], mode: 'shorter' }).jumps, 2);

// Avoidance
let r = run({ stops: [1, 4], mode: 'shorter', avoid: new Map([[5, 'list']]) });
assert.strictEqual(names(r), 'A-B-C-D');
r = run({ stops: [1, 7], mode: 'shorter', avoid: new Map([[6, 'pod']]) });
assert.ok(/avoiding/.test(r.error), 'blocked by avoid list explains itself');
r = run({ stops: [1, 5], mode: 'shorter', avoid: new Map([[5, 'list']]) });
assert.strictEqual(names(r), 'A-X', 'destination on the avoid list is still allowed');
r = run({ stops: [1, 11], mode: 'shorter' });
assert.ok(/can't be reached/.test(r.error), 'unreachable system');

// Waypoints
r = run({ stops: [1, 7, 2], mode: 'shorter' });
assert.strictEqual(r.legs.length, 2);
assert.strictEqual(names(r), 'A-X-D-N1-N2-N1-D-C-B');
assert.strictEqual(r.jumps, 8);

// Jump bridges
const withJb = G.buildGraph(jumps, [[1, 7]]);
r = G.planRoute({ systems: S, graph: withJb, stops: [1, 7], mode: 'shorter', penalty: 50, useBridges: true });
assert.strictEqual(names(r), 'A-N2');
assert.deepStrictEqual(r.legs[0].types, ['bridge']);
r = G.planRoute({ systems: S, graph: withJb, stops: [1, 7], mode: 'shorter', penalty: 50, useBridges: false });
assert.strictEqual(names(r), 'A-X-D-N1-N2', 'bridges ignored when the option is off');

// Jump bridge list parsing
const byName = new Map([...S.values()].map((s) => [s.n.toLowerCase(), s]));
const p = G.parseBridges([
  'A » N2',
  'b <-> c - Serenity Now',
  'X->L2',
  'L1,L3',
  'N1\tD',
  'Promised Land » Z',
  '# comment',
  'A » N2 - duplicate',
  'nonsense line'
].join('\n'), byName);
assert.strictEqual(p.pairs.length, 6);
assert.deepStrictEqual(p.pairs[5], [12, 11], 'two-word system names');
assert.deepStrictEqual(p.unmatched, ['nonsense line']);

// Security display
assert.strictEqual(G.displaySec(0.04), 0.1);
assert.strictEqual(G.secClass(0.45), 'high');
assert.strictEqual(G.secClass(0.0), 'null');

// Invasion lists
assert.strictEqual(SP.TRIGLAVIAN_MINOR_VICTORY.length, 28);
assert.strictEqual(SP.EDENCOM_FORTRESS.length, 53);
assert.strictEqual(SP.EDENCOM_MINOR_VICTORY.length, 84);

console.log('All gate planner tests passed ✔');
