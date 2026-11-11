// Sets the same version on all three desktop apps, which publishes a new release (and lets the
// installed apps update themselves) on the next push to main.
// Usage: node scripts/set-version.js 1.4.1     (or: npm run set-version -- 1.4.1)
'use strict';
const fs = require('fs');
const path = require('path');
const v = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(v || '')) { console.error('Usage: node scripts/set-version.js X.Y.Z'); process.exit(1); }
for (const app of ['eve-jump-planner', 'eve-gate-planner', 'eve-market-finder']) {
  const f = path.join(__dirname, '..', 'apps', app, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(f, 'utf8'));
  pkg.version = v;
  fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${app} -> ${v}`);
}
