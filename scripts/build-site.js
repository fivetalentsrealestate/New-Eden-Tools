// Assembles the public website in _site/:
//   /            landing page (site/)
//   /market/     New Eden Market Finder
//   /jump/       EVE Jump Planner (jump drives, fuel, sovereignty)
//   /router/     redirect to /jump/ (the app's old name was EVE Router)
//   /gates/      EVE Gate Planner (stargate routes)
//   /data/       universe.json built from CCP's Static Data Export
//
// Usage:  node scripts/build-site.js                 (downloads the SDE, ~1 minute)
//         node scripts/build-site.js --data file.json (reuse an existing universe.json)
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildFromSde } = require('../apps/eve-jump-planner/lib/sde');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

async function main() {
  const i = process.argv.indexOf('--data');
  const dataArg = i > -1 ? process.argv[i + 1] : null;

  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'site'), OUT);
  copyDir(path.join(ROOT, 'apps/market-finder'), path.join(OUT, 'market'));
  copyDir(path.join(ROOT, 'apps/eve-jump-planner/renderer'), path.join(OUT, 'jump'));
  copyDir(path.join(ROOT, 'apps/eve-gate-planner/renderer'), path.join(OUT, 'gates'));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

  const dataDir = path.join(OUT, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  if (dataArg) {
    fs.copyFileSync(dataArg, path.join(dataDir, 'universe.json'));
    console.log(`Using map data from ${dataArg}`);
  } else {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sde-'));
    let last = 0;
    const u = await buildFromSde(tmp, (p) => {
      if (p.stage === 'download' && p.got - last > 20 * 1048576) { last = p.got; console.log(`  downloaded ${(p.got / 1048576).toFixed(0)} MB`); }
      if (p.stage === 'extract') console.log(`  reading ${p.file}`);
    });
    fs.copyFileSync(path.join(tmp, 'universe.json'), path.join(dataDir, 'universe.json'));
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`Map data: ${u.systems.length} systems, ${u.jumps.length} stargate connections, ${(u.ships || []).length} jump-capable ships`);
    if (u.systems.length < 5000) throw new Error('Map data looks incomplete — refusing to publish it.');
    if (!u.ships || u.ships.length < 20) throw new Error('Jump-capable ship data missing — refusing to publish it.');
  }
  const kb = (fs.statSync(path.join(dataDir, 'universe.json')).size / 1024).toFixed(0);
  console.log(`Site built in _site/ (map data ${kb} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
