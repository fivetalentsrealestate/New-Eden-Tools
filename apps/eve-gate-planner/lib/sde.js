// Downloads CCP's official Static Data Export (SDE), pulls out the map and the
// jump-capable ships, and writes one compact universe.json that loads instantly afterwards.
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const yauzl = require('yauzl');

const SDE_URL = 'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
const LY = 9.46e15; // metres per light-year, as CCP defines it for jump range
const r4 = (v) => Math.round(v * 1e4) / 1e4; // 0.0001 LY precision keeps the data file small
const SHIP_CATEGORY = 6;

const MAP_FILES = ['mapSolarSystems.jsonl', 'mapStargates.jsonl', 'mapRegions.jsonl', 'mapConstellations.jsonl'];

function enName(n) {
  if (!n) return '';
  if (typeof n === 'string') return n;
  return n.en || Object.values(n)[0] || '';
}

async function download(url, dest, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': 'New Eden Tools (github.com/fivetalentsrealestate/New-Eden-Tools)' } });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let got = 0;
  const reader = Readable.fromWeb(res.body);
  reader.on('data', (chunk) => {
    got += chunk.length;
    onProgress && onProgress({ stage: 'download', got, total });
  });
  await pipeline(reader, fs.createWriteStream(dest));
}

function openZip(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => (err ? reject(err) : resolve(zip)))
  );
}

// Streams the listed .jsonl files out of the zip and calls onRecord(fileName, obj) per line.
async function readFiles(zipFile, wanted, onRecord, onProgress) {
  const zip = await openZip(zipFile);
  await new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', (entry) => {
      const base = path.posix.basename(entry.fileName);
      if (!wanted.includes(base)) return zip.readEntry();
      onProgress && onProgress({ stage: 'extract', file: base });
      zip.openReadStream(entry, (err, stream) => {
        if (err) return reject(err);
        const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
        rl.on('line', (line) => {
          if (!line.trim()) return;
          try { onRecord(base, JSON.parse(line)); } catch (e) { /* skip bad line */ }
        });
        rl.on('close', () => zip.readEntry());
        stream.on('error', reject);
      });
    });
    zip.readEntry();
  });
}

// Turns raw SDE records into the compact structure the apps use.
function buildUniverse(raw) {
  const regions = {};
  for (const r of raw.regions) regions[r._key] = enName(r.name);
  const constellations = {};
  for (const c of raw.constellations) constellations[c._key] = enName(c.name);

  const systems = [];
  const keep = new Set();
  for (const s of raw.systems) {
    const id = s._key;
    // Known space + Pochven + Zarzakh only (drops wormholes, abyssal and other instanced space)
    if (id >= 31000000) continue;
    if (!s.position) continue;
    keep.add(id);
    systems.push({
      id,
      n: enName(s.name),
      // positions converted to light-years; x = east/west, z = north/south
      x: r4(s.position.x / LY),
      y: r4(s.position.y / LY),
      z: r4(s.position.z / LY),
      x2: s.position2D ? r4(s.position2D.x / LY) : null,
      y2: s.position2D ? r4(s.position2D.y / LY) : null,
      s: typeof s.securityStatus === 'number' ? Math.round(s.securityStatus * 1e6) / 1e6 : 0,
      r: s.regionID,
      c: s.constellationID
    });
  }

  const seen = new Set();
  const jumps = [];
  for (const g of raw.stargates) {
    const a = g.solarSystemID;
    const b = g.destination && g.destination.solarSystemID;
    if (!b || !keep.has(a) || !keep.has(b)) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jumps.push(a < b ? [a, b] : [b, a]);
  }

  const out = { version: 2, builtAt: new Date().toISOString(), regions, constellations, systems, jumps };
  if (raw.ships) {
    out.ships = raw.ships;          // [{ id, n, g (group), fuel (per LY), fuelType, range (base LY) }]
    out.fuelTypes = raw.fuelTypes;  // { typeID: { n, vol } }
  }
  return out;
}

async function buildFromSde(dataDir, onProgress) {
  fs.mkdirSync(dataDir, { recursive: true });
  const zipPath = path.join(dataDir, 'sde-latest-jsonl.zip');
  await download(SDE_URL, zipPath, onProgress);

  // Pass 1: attribute names and ship groups (small files)
  const attrId = {};
  const groups = {};
  await readFiles(zipPath, ['dogmaAttributes.jsonl', 'groups.jsonl'], (file, rec) => {
    if (file === 'dogmaAttributes.jsonl') attrId[rec.name] = rec._key;
    else groups[rec._key] = { n: enName(rec.name), cat: rec.categoryID };
  }, onProgress);
  const A_FUEL = attrId.jumpDriveConsumptionAmount;
  const A_TYPE = attrId.jumpDriveConsumptionType;
  const A_RANGE = attrId.jumpDriveRange;

  // Pass 2: map + every type's jump drive attributes
  const raw = { systems: [], stargates: [], regions: [], constellations: [] };
  const jumpers = new Map();
  await readFiles(zipPath, [...MAP_FILES, 'typeDogma.jsonl'], (file, rec) => {
    if (file === 'mapSolarSystems.jsonl') raw.systems.push(rec);
    else if (file === 'mapStargates.jsonl') raw.stargates.push(rec);
    else if (file === 'mapRegions.jsonl') raw.regions.push(rec);
    else if (file === 'mapConstellations.jsonl') raw.constellations.push(rec);
    else if (file === 'typeDogma.jsonl' && A_FUEL) {
      const get = (id) => { const a = (rec.dogmaAttributes || []).find((x) => x.attributeID === id); return a ? a.value : 0; };
      const fuel = get(A_FUEL);
      if (fuel > 0) jumpers.set(rec._key, { fuel, fuelType: get(A_TYPE), range: get(A_RANGE) });
    }
  }, onProgress);
  if (!raw.systems.length) throw new Error('The SDE download did not contain map data (mapSolarSystems.jsonl missing).');

  // Pass 3: names for those ships and their isotopes
  if (jumpers.size) {
    const fuelIds = new Set([...jumpers.values()].map((j) => j.fuelType));
    raw.ships = [];
    raw.fuelTypes = {};
    await readFiles(zipPath, ['types.jsonl'], (_file, t) => {
      if (fuelIds.has(t._key)) raw.fuelTypes[t._key] = { n: enName(t.name), vol: t.volume || 0 };
      const j = jumpers.get(t._key);
      const g = j && groups[t.groupID];
      if (j && t.published && g && g.cat === SHIP_CATEGORY && j.range > 0) {
        raw.ships.push({ id: t._key, n: enName(t.name), g: g.n, fuel: j.fuel, fuelType: j.fuelType, range: j.range });
      }
    }, onProgress);
    raw.ships.sort((a, b) => a.g.localeCompare(b.g) || a.n.localeCompare(b.n));
  }

  onProgress && onProgress({ stage: 'build' });
  const universe = buildUniverse(raw);
  fs.writeFileSync(path.join(dataDir, 'universe.json'), JSON.stringify(universe));
  try { fs.unlinkSync(zipPath); } catch (e) { /* ignore */ }
  return universe;
}

// needShips: the jump planner needs ship fuel data, which older downloads didn't include.
function loadCached(dataDir, { needShips = false } = {}) {
  const f = path.join(dataDir, 'universe.json');
  if (!fs.existsSync(f)) return null;
  try {
    const u = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (needShips && !(u.ships && u.ships.length)) return null;
    return u;
  } catch (e) { return null; }
}

module.exports = { buildFromSde, loadCached, buildUniverse, SDE_URL };
