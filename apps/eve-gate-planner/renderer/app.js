/* global Gates, SpecialSystems */
'use strict';

const G = window.Gates;
const SP = window.SpecialSystems;

// ---------- state ----------
const state = {
  systems: [],
  byId: new Map(),
  byName: new Map(),
  jumps: [],
  jumpIds: [],
  graph: null,
  regions: {},
  constellations: {},
  regionLabels: [],
  sov: null,
  kills: null,
  allianceColor: new Map(),
  trig: new Set(),
  eden: new Set(),
  bridges: [],
  bridgeText: '',
  waypoints: [],
  avoid: new Set(),
  route: null,
  blocked: new Map(),
  colorMode: 'sec',
  layout: '3d',
  showHigh: true,
  selected: null,
  hover: null,
  highlightAlliance: null,
  cam: { x: 0, y: 0, k: 1 },
  fitK: 1,
  medianGate: 1
};

const $ = (id) => document.getElementById(id);
const canvas = $('map');
const ctx = canvas.getContext('2d');

// ---------- helpers ----------
const SEC_COLORS = {
  '1.0': '#2fefef', '0.9': '#48f0c0', '0.8': '#00ef47', '0.7': '#00f000', '0.6': '#8fef2f',
  '0.5': '#efef00', '0.4': '#d77700', '0.3': '#f06000', '0.2': '#f04800', '0.1': '#d73000'
};
function secColor(s) {
  const d = G.displaySec(s);
  if (d <= 0) return '#f00000';
  return SEC_COLORS[d.toFixed(1)] || '#f00000';
}
function secHtml(s) {
  return `<span class="sec" style="color:${secColor(s)}">${G.displaySec(s).toFixed(1)}</span>`;
}
function esc(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function allianceColor(id) {
  if (!state.allianceColor.has(id)) {
    const h = (id * 0.618033988749895 * 360) % 360;
    const l = 52 + ((id >> 3) % 3) * 8;
    state.allianceColor.set(id, `hsl(${h.toFixed(0)}, 72%, ${l}%)`);
  }
  return state.allianceColor.get(id);
}
function withAlpha(hsl, a) { return hsl.replace('hsl(', 'hsla(').replace(')', `, ${a})`); }
function sovOf(sys) { return state.sov && state.sov.systems[sys.id]; }
function nameOf(id) { return state.sov && state.sov.names[id] ? state.sov.names[id].name : `#${id}`; }
function sovLabel(sys) {
  const o = sovOf(sys);
  if (!o) return '';
  if (o.a) return nameOf(o.a);
  if (o.f) return nameOf(o.f);
  return '';
}
function killsOf(sys) { return (state.kills && state.kills.systems[sys.id]) || null; }
function store(key, val) { try { localStorage.setItem('gp.' + key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
function recall(key, def) { try { const v = localStorage.getItem('gp.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
function findSystem(text) { return text ? state.byName.get(text.trim().toLowerCase()) || null : null; }
function cleanErr(e) { return String(e && e.message ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); }

// ---------- data load ----------
function setLoading(title, msg, pct) {
  $('loadTitle').textContent = title;
  $('loadMsg').textContent = msg;
  if (pct != null) $('loadBar').style.width = `${Math.max(2, Math.min(100, pct))}%`;
}

window.api.onProgress((p) => {
  if (p.stage === 'download') {
    const mb = (p.got / 1048576).toFixed(1);
    const tot = p.total ? ` of ${(p.total / 1048576).toFixed(1)} MB` : ' MB';
    setLoading('Downloading map data from CCP…', `First run only: ${mb}${tot}`, p.total ? (p.got / p.total) * 85 : 40);
  } else if (p.stage === 'extract') {
    setLoading('Unpacking…', `Reading ${p.file}`, 90);
  } else if (p.stage === 'build') {
    setLoading('Building the map…', 'Almost there', 97);
  }
});

async function loadUniverse(refresh) {
  $('loading').classList.remove('hidden');
  $('retry').hidden = true;
  setLoading(refresh ? 'Updating map data…' : 'Loading New Eden…', 'Starting up', 5);
  try {
    const u = await window.api.getUniverse(refresh);
    ingest(u);
    $('loading').classList.add('hidden');
    $('dataStatus').textContent = `${state.systems.length.toLocaleString()} systems · data ${new Date(u.builtAt).toLocaleDateString()}`;
    return true;
  } catch (e) {
    setLoading("Couldn't load map data", `${cleanErr(e)}. Check your internet connection — the first run downloads CCP's static data.`, 0);
    $('retry').hidden = false;
    return false;
  }
}

async function loadSov(refresh) {
  $('sovStatus').textContent = 'Loading sovereignty…';
  try {
    state.sov = await window.api.getSov(refresh);
    $('sovStatus').textContent = (state.sov.offline ? 'Offline — cached ' : 'Updated ') + new Date(state.sov.fetchedAt).toLocaleString();
    renderSovList();
    if (state.selected) renderSystem(state.selected);
    if (state.route) renderRoute();
    draw();
  } catch (e) {
    $('sovStatus').textContent = 'Could not reach ESI: ' + cleanErr(e);
  }
}

async function loadKills(refresh) {
  $('killsStatus').textContent = 'loading…';
  try {
    state.kills = await window.api.getKills(refresh);
    const t = new Date(state.kills.fetchedAt);
    $('killsStatus').textContent = (state.kills.offline ? 'offline, ' : '') + `as of ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (state.route && $('optPods').checked) plan(true);
    else if (state.route) renderRoute();
    draw();
  } catch (e) {
    $('killsStatus').textContent = 'ESI unavailable';
  }
}

function ingest(u) {
  state.regions = u.regions;
  state.constellations = u.constellations || {};
  state.systems = u.systems;
  state.byId = new Map(u.systems.map((s) => [s.id, s]));
  state.byName = new Map(u.systems.map((s) => [s.n.toLowerCase(), s]));
  state.jumpIds = u.jumps.filter(([a, b]) => state.byId.has(a) && state.byId.has(b));
  state.jumps = state.jumpIds.map(([a, b]) => [state.byId.get(a), state.byId.get(b)]);

  const ids = (names) => new Set(names.map((n) => findSystem(n)).filter(Boolean).map((s) => s.id));
  state.trig = ids(SP.TRIGLAVIAN_MINOR_VICTORY);
  state.eden = ids([...SP.EDENCOM_FORTRESS, ...SP.EDENCOM_MINOR_VICTORY]);

  const frag = document.createDocumentFragment();
  [...state.systems].sort((a, b) => a.n.localeCompare(b.n)).forEach((s) => {
    const o = document.createElement('option');
    o.value = s.n;
    frag.appendChild(o);
  });
  $('systemList').replaceChildren(frag);

  state.bridgeText = recall('bridges', '');
  applyBridgeText(state.bridgeText);
  applyLayout();
  fit();
  restoreForm();
}

function applyBridgeText(text) {
  const r = G.parseBridges(text, state.byName);
  state.bridges = r.pairs;
  state.graph = G.buildGraph(state.jumpIds, state.bridges);
  $('bridgeCount').textContent = String(state.bridges.length);
  return r;
}

function applyLayout() {
  const use2d = state.layout === '2d';
  for (const s of state.systems) {
    if (use2d && s.x2 != null) { s.wx = s.x2; s.wy = -s.y2; } else { s.wx = s.x; s.wy = -s.z; }
  }
  const lens = state.jumps
    .filter(([a, b]) => a.r === b.r)
    .map(([a, b]) => Math.hypot(a.wx - b.wx, a.wy - b.wy))
    .sort((a, b) => a - b);
  state.medianGate = lens.length ? lens[lens.length >> 1] || 1 : 1;
  const acc = new Map();
  for (const s of state.systems) {
    if (!acc.has(s.r)) acc.set(s.r, { x: 0, y: 0, n: 0 });
    const a = acc.get(s.r); a.x += s.wx; a.y += s.wy; a.n++;
  }
  state.regionLabels = [...acc.entries()]
    .filter(([id]) => state.regions[id])
    .map(([id, a]) => ({ name: state.regions[id], x: a.x / a.n, y: a.y / a.n }));
}

// ---------- camera ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
function viewSize() { const r = canvas.getBoundingClientRect(); return { W: r.width, H: r.height }; }
function toScreen(wx, wy) {
  const { W, H } = viewSize();
  return [(wx - state.cam.x) * state.cam.k + W / 2, (wy - state.cam.y) * state.cam.k + H / 2];
}
function toWorld(sx, sy) {
  const { W, H } = viewSize();
  return [(sx - W / 2) / state.cam.k + state.cam.x, (sy - H / 2) / state.cam.k + state.cam.y];
}
function fitTo(list, maxZoom, padX = 60, padY = 110) {
  if (!list.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of list) { minX = Math.min(minX, s.wx); maxX = Math.max(maxX, s.wx); minY = Math.min(minY, s.wy); maxY = Math.max(maxY, s.wy); }
  const { W, H } = viewSize();
  state.cam.x = (minX + maxX) / 2;
  state.cam.y = (minY + maxY) / 2;
  const k = Math.min((W - padX) / (maxX - minX || 1e-9), (H - padY) / (maxY - minY || 1e-9));
  state.cam.k = maxZoom ? Math.min(maxZoom, k) : k;
  draw();
}
function fit() {
  fitTo(state.systems.filter(visible));
  state.fitK = state.cam.k;
}
function centerOn(sys, zoomTo) {
  state.cam.x = sys.wx; state.cam.y = sys.wy;
  if (zoomTo) state.cam.k = Math.max(state.cam.k, zoomTo);
  draw();
}

// ---------- drawing ----------
let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; render(); });
}
function visible(sys) { return state.showHigh || G.displaySec(sys.s) < 0.5; }

function systemFill(sys) {
  if (state.colorMode === 'sov') {
    const o = sovOf(sys);
    if (o && o.a) {
      if (state.highlightAlliance && o.a !== state.highlightAlliance) return 'rgba(120,130,150,.25)';
      return allianceColor(o.a);
    }
    if (state.highlightAlliance) return 'rgba(120,130,150,.18)';
    return G.displaySec(sys.s) >= 0.5 ? 'rgba(150,160,180,.35)' : 'rgba(150,160,180,.5)';
  }
  return secColor(sys.s);
}

function routeSystems() {
  if (!state.route || !state.route.legs) return [];
  const out = [];
  state.route.legs.forEach((l, i) => l.path.forEach((id, j) => { if (i === 0 || j > 0) out.push(state.byId.get(id)); }));
  return out;
}

function render() {
  const { W, H } = viewSize();
  ctx.clearRect(0, 0, W, H);
  if (!state.systems.length) return;
  const k = state.cam.k;
  const pad = 40;
  const onScreen = (x, y) => x > -pad && y > -pad && x < W + pad && y < H + pad;
  for (const s of state.systems) { const p = toScreen(s.wx, s.wy); s.sx = p[0]; s.sy = p[1]; }

  // Sovereignty territory glow
  if (state.colorMode === 'sov' && state.sov) {
    const rad = Math.min(26, Math.max(5, state.medianGate * k * 0.9));
    for (const s of state.systems) {
      const o = sovOf(s);
      if (!o || !o.a || !onScreen(s.sx, s.sy)) continue;
      if (state.highlightAlliance && o.a !== state.highlightAlliance) continue;
      ctx.fillStyle = withAlpha(allianceColor(o.a), state.highlightAlliance ? 0.22 : 0.13);
      ctx.beginPath(); ctx.arc(s.sx, s.sy, rad, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Kills heat (last hour)
  if ($('showKills').checked && state.kills) {
    for (const s of state.systems) {
      const kl = killsOf(s);
      if (!kl || !(kl.ship || kl.pod) || !visible(s) || !onScreen(s.sx, s.sy)) continue;
      const n = kl.ship + kl.pod;
      const r = Math.min(34, 4 + Math.sqrt(n) * 4) * Math.min(1.6, Math.max(0.6, k * state.medianGate / 25));
      const grd = ctx.createRadialGradient(s.sx, s.sy, 0, s.sx, s.sy, r);
      grd.addColorStop(0, kl.pod ? 'rgba(255,60,80,.55)' : 'rgba(255,150,60,.45)');
      grd.addColorStop(1, 'rgba(255,60,80,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Gates
  ctx.lineWidth = 1;
  const intra = new Path2D(), inter = new Path2D();
  for (const [a, b] of state.jumps) {
    if (!visible(a) || !visible(b)) continue;
    if (!onScreen(a.sx, a.sy) && !onScreen(b.sx, b.sy)) continue;
    const path = a.r === b.r ? intra : inter;
    path.moveTo(a.sx, a.sy); path.lineTo(b.sx, b.sy);
  }
  ctx.strokeStyle = 'rgba(90,110,140,.35)'; ctx.stroke(intra);
  ctx.strokeStyle = 'rgba(160,100,220,.35)'; ctx.stroke(inter);

  // Jump bridges
  if ($('showBridges').checked && state.bridges.length) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(79,209,139,.75)';
    for (const [ia, ib] of state.bridges) {
      const a = state.byId.get(ia), b = state.byId.get(ib);
      if (!a || !b) continue;
      const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      const dx = b.sx - a.sx, dy = b.sy - a.sy;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy);
      ctx.quadraticCurveTo(mx - dy * 0.2, my + dx * 0.2, b.sx, b.sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Systems
  const dotR = Math.max(1.4, Math.min(5, k * state.medianGate * 0.12));
  for (const s of state.systems) {
    if (!visible(s) || !onScreen(s.sx, s.sy)) continue;
    ctx.fillStyle = systemFill(s);
    ctx.beginPath(); ctx.arc(s.sx, s.sy, dotR, 0, Math.PI * 2); ctx.fill();
  }

  // Invasion systems (only marked when their avoid option is on)
  const mark = (set, color, shape) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    const r = dotR + 4;
    for (const id of set) {
      const s = state.byId.get(id);
      if (!s || !visible(s) || !onScreen(s.sx, s.sy)) continue;
      ctx.beginPath();
      if (shape === 'tri') { ctx.moveTo(s.sx, s.sy - r); ctx.lineTo(s.sx + r, s.sy + r * 0.8); ctx.lineTo(s.sx - r, s.sy + r * 0.8); ctx.closePath(); }
      else { ctx.moveTo(s.sx, s.sy - r); ctx.lineTo(s.sx + r, s.sy); ctx.lineTo(s.sx, s.sy + r); ctx.lineTo(s.sx - r, s.sy); ctx.closePath(); }
      ctx.stroke();
    }
  };
  if ($('optTrig').checked) mark(state.trig, '#ff7b72', 'tri');
  if ($('optEden').checked) mark(state.eden, '#7fb8ff', 'dia');

  // Avoided systems
  ctx.strokeStyle = '#ff5d6c'; ctx.lineWidth = 1.5;
  for (const [id, why] of state.blocked) {
    if (why !== 'list' && why !== 'pod') continue;
    const s = state.byId.get(id);
    if (!s || !visible(s) || !onScreen(s.sx, s.sy)) continue;
    const r = 4 + dotR * 0.6;
    ctx.beginPath(); ctx.moveTo(s.sx - r, s.sy - r); ctx.lineTo(s.sx + r, s.sy + r); ctx.moveTo(s.sx + r, s.sy - r); ctx.lineTo(s.sx - r, s.sy + r); ctx.stroke();
  }

  // Route
  if (state.route && state.route.legs) {
    ctx.lineCap = 'round';
    for (const pass of [{ w: 7, c: 'rgba(255,209,102,.18)' }, { w: 2.4, c: '#ffd166' }]) {
      for (const leg of state.route.legs) {
        for (let i = 1; i < leg.path.length; i++) {
          const a = state.byId.get(leg.path[i - 1]), b = state.byId.get(leg.path[i]);
          const jb = leg.types[i - 1] === 'bridge';
          ctx.strokeStyle = jb && pass.w < 5 ? '#4fd18b' : pass.c;
          ctx.lineWidth = pass.w;
          ctx.setLineDash(jb && pass.w < 5 ? [6, 4] : []);
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
    const rs = routeSystems();
    const big = k * state.medianGate > 18;
    for (const s of rs) {
      ctx.fillStyle = secColor(s.s);
      ctx.beginPath(); ctx.arc(s.sx, s.sy, big ? 4.5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // start, waypoints, destination markers
    const stops = [state.route.legs[0].from, ...state.route.legs.map((l) => l.to)].map((id) => state.byId.get(id));
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    stops.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#4fd18b' : i === stops.length - 1 ? '#ff5d6c' : '#ffd166';
      ctx.beginPath(); ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05070b';
      ctx.fillText(i === 0 ? 'S' : i === stops.length - 1 ? 'D' : String(i), s.sx, s.sy + 0.5);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Labels
  const showSysNames = k * state.medianGate > 38;
  if (showSysNames) {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(216,225,238,.75)';
    const taken = new Set();
    // route systems get their labels first
    const order = [...routeSystems(), ...state.systems];
    const done = new Set();
    for (const s of order) {
      if (done.has(s.id)) continue;
      done.add(s.id);
      if (!visible(s) || s.sx < 0 || s.sy < 0 || s.sx > W || s.sy > H) continue;
      const cx = Math.floor(s.sx / 64), cy = Math.floor(s.sy / 14);
      if (taken.has(`${cx},${cy}`) || taken.has(`${cx + 1},${cy}`)) continue;
      taken.add(`${cx},${cy}`); taken.add(`${cx + 1},${cy}`);
      ctx.fillText(s.n, s.sx + dotR + 4, s.sy + 3.5);
    }
  } else if (state.route && state.route.legs) {
    ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#fff';
    const stops = [state.route.legs[0].from, ...state.route.legs.map((l) => l.to)].map((id) => state.byId.get(id));
    for (const s of stops) ctx.fillText(s.n, s.sx + 12, s.sy + 4);
  }
  if (k * state.medianGate < 70) {
    ctx.font = `600 ${showSysNames ? 15 : 12}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = showSysNames ? 'rgba(143,123,255,.35)' : 'rgba(200,210,230,.5)';
    for (const r of state.regionLabels) {
      const [x, y] = toScreen(r.x, r.y);
      if (x < -100 || y < -20 || x > W + 100 || y > H + 20) continue;
      ctx.fillText(r.name.toUpperCase(), x, y);
    }
    ctx.textAlign = 'left';
  }

  for (const [sys, col] of [[state.hover, 'rgba(255,255,255,.6)'], [state.selected, '#4fc3f7']]) {
    if (!sys) continue;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sys.sx, sys.sy, dotR + 7, 0, Math.PI * 2); ctx.stroke();
  }
  if (state.selected && !showSysNames) {
    ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(state.selected.n, state.selected.sx + dotR + 10, state.selected.sy + 4);
  }
  renderLegend();
}

function renderLegend() {
  const el = $('legend');
  const extra = [];
  if ($('showKills').checked) extra.push('<span class="lg"><span class="dot" style="background:rgba(255,60,80,.8)"></span>kills, last hour</span>');
  if ($('showBridges').checked && state.bridges.length) extra.push('<span class="lg"><span class="dot" style="background:#4fd18b;border-radius:2px;height:2px;width:14px"></span>jump bridge</span>');
  if ($('optTrig').checked) extra.push('<span class="lg" style="color:#ff7b72">▲ Triglavian</span>');
  if ($('optEden').checked) extra.push('<span class="lg" style="color:#7fb8ff">◆ EDENCOM</span>');
  if (state.colorMode === 'sec') {
    el.innerHTML = ['1.0', '0.8', '0.6', '0.5', '0.4', '0.2', '0.1'].map((d) =>
      `<span class="lg"><span class="dot" style="background:${SEC_COLORS[d]}"></span>${d}</span>`).join('') +
      '<span class="lg"><span class="dot" style="background:#f00000"></span>0.0 / null</span>' + extra.join('');
  } else {
    el.innerHTML = (state.sov ? '<span>Nullsec coloured by sovereignty holder. Pick an alliance in the Sovereignty tab to isolate it.</span>' : '<span>Sovereignty not loaded yet.</span>') + extra.join('');
  }
}

// ---------- map interaction ----------
// Pointer input: mouse drag / touch drag pans, two-finger pinch zooms, click or tap selects.
let drag = null;
let pinch = null;
const pointers = new Map();
const isPhone = () => window.matchMedia('(max-width: 820px)').matches;
function localXY(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function pinchInfo() {
  const [a, b] = [...pointers.values()];
  const r = canvas.getBoundingClientRect();
  return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top };
}
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    drag = { x: e.clientX, y: e.clientY, cx: state.cam.x, cy: state.cam.y, moved: false, touch: e.pointerType !== 'mouse' };
  } else if (pointers.size === 2) {
    const p = pinchInfo();
    pinch = { d: p.d, k: state.cam.k, world: toWorld(p.mx, p.my) };
    if (drag) drag.moved = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const p = pinchInfo();
    state.cam.k = Math.min(state.fitK * 120, Math.max(state.fitK * 0.5, pinch.k * (p.d / pinch.d)));
    const [nx, ny] = toWorld(p.mx, p.my);
    state.cam.x += pinch.world[0] - nx; state.cam.y += pinch.world[1] - ny;
    draw();
    return;
  }
  if (drag && pointers.size === 1) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > (drag.touch ? 8 : 3)) { drag.moved = true; canvas.classList.add('dragging'); }
    if (drag.moved) {
      state.cam.x = drag.cx - dx / state.cam.k;
      state.cam.y = drag.cy - dy / state.cam.k;
      $('tooltip').hidden = true;
      draw();
    }
    return;
  }
  if (e.pointerType === 'mouse') {
    const [x, y] = localXY(e);
    const hit = pick(x, y);
    if (hit !== state.hover) { state.hover = hit; draw(); }
    showTooltip(hit, x, y);
  }
});
function endPointer(e) {
  const wasTap = drag && !drag.moved && pointers.size === 1 && e.type === 'pointerup';
  if (wasTap) {
    const [x, y] = localXY(e);
    const hit = pick(x, y, drag.touch ? 22 : 10);
    if (hit) select(hit);
  }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 1) {
    // one finger lifted after a pinch: carry on panning with the other
    const [p] = [...pointers.values()];
    drag = { x: p.x, y: p.y, cx: state.cam.x, cy: state.cam.y, moved: true, touch: true };
  } else if (pointers.size === 0) {
    drag = null;
    canvas.classList.remove('dragging');
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('mouseleave', () => { state.hover = null; $('tooltip').hidden = true; draw(); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const [wx, wy] = toWorld(mx, my);
  state.cam.k = Math.min(state.fitK * 120, Math.max(state.fitK * 0.5, state.cam.k * Math.exp(-e.deltaY * 0.0015)));
  const [nx, ny] = toWorld(mx, my);
  state.cam.x += wx - nx; state.cam.y += wy - ny;
  draw();
}, { passive: false });
canvas.addEventListener('dblclick', (e) => {
  const r = canvas.getBoundingClientRect();
  const hit = pick(e.clientX - r.left, e.clientY - r.top);
  if (hit) centerOn(hit, state.cam.k * 2.5);
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F') fit();
  if (e.key === 'Escape') { state.selected = null; draw(); }
});
window.addEventListener('resize', resize);

function pick(mx, my, radius = 10) {
  let best = null, bd = radius * radius;
  for (const s of state.systems) {
    if (!visible(s) || s.sx == null) continue;
    const dx = s.sx - mx, dy = s.sy - my, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function flagsHtml(sys) {
  const out = [];
  const kl = killsOf(sys);
  if (kl && kl.pod) out.push(`<span class="tag pod">${kl.pod} pod</span>`);
  if (kl && kl.ship) out.push(`<span class="tag kill">${kl.ship} ship</span>`);
  if (state.trig.has(sys.id)) out.push('<span class="tag trig">Triglavian</span>');
  if (state.eden.has(sys.id)) out.push('<span class="tag eden">EDENCOM</span>');
  if (state.avoid.has(sys.id)) out.push('<span class="tag pod">avoided</span>');
  return out.join(' ');
}

function showTooltip(sys, x, y) {
  const tip = $('tooltip');
  if (!sys) { tip.hidden = true; return; }
  const sov = sovLabel(sys);
  const flags = flagsHtml(sys);
  tip.innerHTML = `<div class="t">${esc(sys.n)} ${secHtml(sys.s)}</div>
    <div class="m">${esc(state.regions[sys.r] || '')} · ${esc(state.constellations[sys.c] || '')}</div>
    ${sov ? `<div>${esc(sov)}</div>` : ''}${flags ? `<div style="margin-top:4px">${flags}</div>` : ''}`;
  tip.hidden = false;
  const { W, H } = viewSize();
  tip.style.left = `${Math.min(W - tip.offsetWidth - 8, x + 14)}px`;
  tip.style.top = `${Math.min(H - tip.offsetHeight - 8, y + 14)}px`;
}

function select(sys, opts = {}) {
  state.selected = sys;
  renderSystem(sys);
  if (!opts.stay) { switchTab('system'); if (isPhone()) setSheet(true); }
  if (opts.center) centerOn(sys, state.fitK * 6);
  draw();
}

// ---------- tabs ----------
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
    if (t.dataset.tab === name) $('sheetLabel').textContent = t.textContent;
  });
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ---------- system panel ----------
function renderSystem(sys) {
  const el = $('systemInfo');
  el.className = '';
  const o = sovOf(sys);
  const gates = (state.graph.get(sys.id) || [])
    .map((e) => ({ s: state.byId.get(e.to), jb: e.type === 'bridge' }))
    .filter((x) => x.s)
    .sort((a, b) => a.s.n.localeCompare(b.s.n));
  const kl = killsOf(sys);
  el.innerHTML = `
    <div class="sys-title">${esc(sys.n)} ${secHtml(sys.s)}</div>
    <div class="kv">
      <span class="k">Region</span><span>${esc(state.regions[sys.r] || '—')}</span>
      <span class="k">Constellation</span><span>${esc(state.constellations[sys.c] || '—')}</span>
      <span class="k">True sec</span><span>${sys.s.toFixed(3)}</span>
      <span class="k">Sovereignty</span><span>${o && o.a ? `<span class="link" data-alliance="${o.a}">${esc(nameOf(o.a))}</span>` : o && o.f ? esc(nameOf(o.f)) : '—'}</span>
      <span class="k">Kills (1h)</span><span>${kl ? `${kl.ship} ships · ${kl.pod} pods · ${kl.npc} NPCs` : state.kills ? 'None' : '—'}</span>
      ${state.trig.has(sys.id) ? '<span class="k">Invasion</span><span style="color:#ff7b72">Triglavian minor victory</span>' : ''}
      ${state.eden.has(sys.id) ? '<span class="k">Invasion</span><span style="color:#7fb8ff">EDENCOM system</span>' : ''}
    </div>
    <div>
      <div class="note" style="margin-bottom:6px">Connections (${gates.length})</div>
      <div class="gate-list">${gates.map((g) => `<span class="link" data-sys="${g.s.id}">${g.jb ? '⇢ ' : ''}${esc(g.s.n)}</span>`).join('') || '<span class="note">None</span>'}</div>
    </div>
    <div class="btn-row">
      <button data-act="from">Set start</button>
      <button data-act="wp">Add waypoint</button>
      <button data-act="to">Set destination</button>
    </div>
    <div class="btn-row">
      <button data-act="avoid" class="ghost">${state.avoid.has(sys.id) ? 'Remove from avoidance list' : 'Add to avoidance list'}</button>
    </div>
    <div class="btn-row">
      <button class="ghost small" data-ext="https://evemaps.dotlan.net/system/${encodeURIComponent(sys.n.replace(/ /g, '_'))}">Dotlan</button>
      <button class="ghost small" data-ext="https://zkillboard.com/system/${sys.id}/">zKillboard</button>
    </div>`;
  el.querySelectorAll('[data-sys]').forEach((a) => a.addEventListener('click', () => select(state.byId.get(+a.dataset.sys), { center: true })));
  el.querySelectorAll('[data-alliance]').forEach((a) => a.addEventListener('click', () => {
    setColorMode('sov'); toggleAlliance(+a.dataset.alliance, true); switchTab('sov');
  }));
  el.querySelectorAll('[data-ext]').forEach((b) => b.addEventListener('click', () => window.api.openExternal(b.dataset.ext)));
  el.querySelector('[data-act=from]').addEventListener('click', () => { $('from').value = sys.n; afterStopsChange(); switchTab('route'); });
  el.querySelector('[data-act=to]').addEventListener('click', () => { $('to').value = sys.n; afterStopsChange(); switchTab('route'); });
  el.querySelector('[data-act=wp]').addEventListener('click', () => { state.waypoints.push(sys.id); renderWaypoints(); afterStopsChange(); switchTab('route'); });
  el.querySelector('[data-act=avoid]').addEventListener('click', () => {
    if (state.avoid.has(sys.id)) state.avoid.delete(sys.id); else state.avoid.add(sys.id);
    renderAvoid(); renderSystem(sys); onOptionsChange();
  });
}

// ---------- route form ----------
function mode() { return document.querySelector('input[name=mode]:checked').value; }

function saveForm() {
  store('form', {
    from: $('from').value, to: $('to').value, waypoints: state.waypoints, mode: mode(),
    penalty: +$('penalty').value, bridges: $('optBridges').checked, pods: $('optPods').checked,
    podMin: +$('podMin').value, trig: $('optTrig').checked, eden: $('optEden').checked,
    avoidOn: $('optAvoid').checked, stop: $('optStop').checked, avoid: [...state.avoid]
  });
}
function restoreForm() {
  const f = recall('form', null);
  if (f) {
    $('from').value = f.from || '';
    $('to').value = f.to || '';
    state.waypoints = (f.waypoints || []).filter((id) => state.byId.has(id));
    const r = document.querySelector(`input[name=mode][value=${f.mode}]`);
    if (r) r.checked = true;
    if (f.penalty != null) $('penalty').value = f.penalty;
    $('optBridges').checked = !!f.bridges;
    $('optPods').checked = !!f.pods;
    if (f.podMin) $('podMin').value = f.podMin;
    $('optTrig').checked = !!f.trig;
    $('optEden').checked = !!f.eden;
    $('optAvoid').checked = f.avoidOn !== false;
    $('optStop').checked = f.stop !== false;
    state.avoid = new Set((f.avoid || []).filter((id) => state.byId.has(id)));
  }
  renderWaypoints();
  renderAvoid();
  updatePenaltyUi();
  if (findSystem($('from').value) && findSystem($('to').value)) plan(true);
}

function updatePenaltyUi() {
  $('penaltyVal').textContent = $('penalty').value;
  const off = mode() === 'shorter';
  $('penalty').disabled = off;
  $('penaltyRow').classList.toggle('disabled', off);
}

function renderWaypoints() {
  $('waypoints').innerHTML = state.waypoints.map((id, i) => {
    const s = state.byId.get(id);
    return `<div class="stop-row wp-row">
      <span class="stop-dot wp">${i + 1}</span>
      <span class="name">${esc(s.n)} ${secHtml(s.s)}</span>
      <button class="ghost" data-up="${i}" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="ghost" data-down="${i}" title="Move down" ${i === state.waypoints.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="ghost" data-del="${i}" title="Remove">×</button>
    </div>`;
  }).join('');
  const move = (i, d) => { const w = state.waypoints; [w[i], w[i + d]] = [w[i + d], w[i]]; renderWaypoints(); afterStopsChange(); };
  $('waypoints').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, -1)));
  $('waypoints').querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, 1)));
  $('waypoints').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    state.waypoints.splice(+b.dataset.del, 1); renderWaypoints(); afterStopsChange();
  }));
}

function addWaypoint() {
  const s = findSystem($('wpInput').value);
  if (!s) return;
  state.waypoints.push(s.id);
  $('wpInput').value = '';
  renderWaypoints();
  afterStopsChange();
}
$('wpInput').addEventListener('change', addWaypoint);
$('wpInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addWaypoint(); });

function afterStopsChange() {
  saveForm();
  if (state.route && findSystem($('from').value) && findSystem($('to').value)) plan(true);
  else draw();
}
['from', 'to'].forEach((id) => {
  $(id).addEventListener('change', () => {
    const s = findSystem($(id).value);
    if (s) select(s, { stay: true });
    afterStopsChange();
  });
  $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') plan(); });
});
$('swap').addEventListener('click', () => {
  const a = $('from').value; $('from').value = $('to').value; $('to').value = a;
  state.waypoints.reverse(); renderWaypoints(); afterStopsChange();
});

function onOptionsChange() {
  updatePenaltyUi();
  saveForm();
  if (state.route) plan(true); else { computeBlocked(); draw(); }
}
document.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', onOptionsChange));
$('penalty').addEventListener('input', () => { $('penaltyVal').textContent = $('penalty').value; });
$('penalty').addEventListener('change', onOptionsChange);
['optBridges', 'optPods', 'optTrig', 'optEden', 'optAvoid', 'optStop', 'podMin'].forEach((id) => $(id).addEventListener('change', onOptionsChange));
$('killsRefresh').addEventListener('click', () => loadKills(true));

function renderAvoid() {
  $('avoidChips').innerHTML = [...state.avoid].map((id) => {
    const s = state.byId.get(id);
    return s ? `<span class="chip">${esc(s.n)}<button data-id="${id}" title="Remove">×</button></span>` : '';
  }).join('');
  $('avoidChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.avoid.delete(+b.dataset.id); renderAvoid(); onOptionsChange();
  }));
}
function addAvoid() {
  const s = findSystem($('avoidInput').value);
  if (!s) return;
  state.avoid.add(s.id);
  $('avoidInput').value = '';
  renderAvoid(); onOptionsChange();
}
$('avoidAdd').addEventListener('click', addAvoid);
$('avoidInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAvoid(); });

// Which systems the current options rule out (id -> reason)
function computeBlocked() {
  const m = new Map();
  if ($('optTrig').checked) for (const id of state.trig) m.set(id, 'trig');
  if ($('optEden').checked) for (const id of state.eden) m.set(id, 'eden');
  if ($('optPods').checked && state.kills) {
    const min = Math.max(1, +$('podMin').value || 1);
    for (const [id, k] of Object.entries(state.kills.systems)) if (k.pod >= min) m.set(+id, 'pod');
  }
  if ($('optAvoid').checked) for (const id of state.avoid) m.set(id, 'list');
  state.blocked = m;
  return m;
}

// ---------- planning ----------
function plan(quiet) {
  const from = findSystem($('from').value), to = findSystem($('to').value);
  if (!from || !to) {
    if (!quiet) { state.route = { error: !from ? 'Pick a valid start system.' : 'Pick a valid destination.' }; renderRoute(); }
    return;
  }
  saveForm();
  const blocked = computeBlocked();
  const res = G.planRoute({
    systems: state.byId,
    graph: state.graph,
    stops: [from.id, ...state.waypoints, to.id],
    mode: mode(),
    penalty: +$('penalty').value,
    useBridges: $('optBridges').checked,
    avoid: blocked
  });
  const firstPlan = !state.route || !state.route.legs;
  state.route = res;
  renderRoute();
  if (res.legs && (firstPlan || !quiet)) fitTo(routeSystems(), state.fitK * 30, isPhone() ? 50 : 200, isPhone() ? 140 : 200);
  draw();
}
$('plan').addEventListener('click', () => plan(false));
$('clearRoute').addEventListener('click', () => { state.route = null; $('routeResult').innerHTML = ''; draw(); });

function routeText() {
  const lines = [];
  let n = 0;
  const stop = $('optStop').checked;
  state.route.legs.forEach((leg, li) => {
    leg.path.forEach((id, j) => {
      if (li > 0 && j === 0) return;
      const s = state.byId.get(id);
      const via = j > 0 && leg.types[j - 1] === 'bridge' ? ' (jump bridge)' : '';
      lines.push(`${n === 0 ? 'Start' : n}. ${s.n} (${G.displaySec(s.s).toFixed(1)})${via}`);
      n++;
    });
    if (li < state.route.legs.length - 1) lines.push(stop ? `   -- Waypoint ${li + 1}: ${state.byId.get(leg.to).n} — autopilot stops here --` : `   (waypoint ${li + 1})`);
  });
  return lines.join('\n');
}

function renderRoute() {
  const el = $('routeResult');
  const r = state.route;
  if (!r) { el.innerHTML = ''; return; }
  if (r.error) { el.innerHTML = `<div class="error">${esc(r.error)}</div>`; return; }

  const all = routeSystems();
  const entered = all.slice(1);
  const cls = { high: 0, low: 0, null: 0 };
  let pods = 0, ships = 0;
  for (const s of entered) cls[G.secClass(s.s)]++;
  for (const s of all) { const k = killsOf(s); if (k) { pods += k.pod; ships += k.ship; } }
  const bridgesUsed = r.legs.reduce((n, l) => n + l.types.filter((t) => t === 'bridge').length, 0);
  const minSec = Math.min(...all.map((s) => s.s));
  const stop = $('optStop').checked;

  let n = 0;
  let rows = '';
  r.legs.forEach((leg, li) => {
    if (r.legs.length > 1) rows += `<div class="leg-head">Leg ${li + 1}: ${esc(state.byId.get(leg.from).n)} → ${esc(state.byId.get(leg.to).n)} · ${leg.types.length} jumps</div>`;
    leg.path.forEach((id, j) => {
      if (li > 0 && j === 0) return;
      const s = state.byId.get(id);
      const jb = j > 0 && leg.types[j - 1] === 'bridge';
      const isEnd = li === r.legs.length - 1 && j === leg.path.length - 1;
      const isWp = !isEnd && j === leg.path.length - 1;
      rows += `<div class="hop" data-sys="${id}">
        <span class="num">${n === 0 ? 'S' : n}</span>
        <span class="bar" style="background:${secColor(s.s)}"></span>
        <span class="nm">${esc(s.n)} ${secHtml(s.s)}<small>${esc(sovLabel(s) || state.regions[s.r] || '')}</small></span>
        <span class="tags">${jb ? '<span class="tag jb">jump bridge</span>' : ''}${isWp ? '<span class="tag">waypoint</span>' : ''}${isEnd ? '<span class="tag">destination</span>' : ''}${flagsHtml(s)}</span>
      </div>`;
      n++;
    });
    if (li < r.legs.length - 1 && stop) {
      rows += `<div class="stop-line">⏸ Waypoint reached: autopilot disengages at ${esc(state.byId.get(leg.to).n)}</div>`;
    }
  });

  const strip = entered.map((s) => `<span style="background:${secColor(s.s)}"></span>`).join('');
  el.innerHTML = `
    <div class="route-summary">
      <div class="stat"><div class="k">Jumps</div><div class="v">${r.jumps}</div></div>
      <div class="stat"><div class="k">Lowest sec</div><div class="v" style="color:${secColor(minSec)}">${G.displaySec(minSec).toFixed(1)}</div></div>
      <div class="stat"><div class="k">High / Low / Null</div><div class="v">${cls.high} / ${cls.low} / ${cls.null}</div></div>
      <div class="stat"><div class="k">Kills on route (1h)</div><div class="v">${state.kills ? `${ships} <small style="font-size:11px;color:var(--muted)">ships</small> ${pods} <small style="font-size:11px;color:var(--muted)">pods</small>` : '—'}</div></div>
      ${bridgesUsed ? `<div class="stat"><div class="k">Jump bridges</div><div class="v" style="color:var(--bridge)">${bridgesUsed}</div></div>` : ''}
    </div>
    <div class="sec-strip">${strip}</div>
    <div class="btn-row"><button id="copyRoute" class="ghost small">Copy route</button></div>
    <div class="route-list">${rows}</div>`;
  el.querySelectorAll('.hop').forEach((row) => {
    const s = state.byId.get(+row.dataset.sys);
    row.addEventListener('mouseenter', () => { state.hover = s; draw(); });
    row.addEventListener('mouseleave', () => { state.hover = null; draw(); });
    row.addEventListener('click', () => { state.selected = s; centerOn(s); });
  });
  $('copyRoute').addEventListener('click', async () => {
    await window.api.copy(routeText());
    $('copyRoute').textContent = 'Copied ✓';
    setTimeout(() => { const b = $('copyRoute'); if (b) b.textContent = 'Copy route'; }, 1500);
  });
}

// ---------- jump bridge editor ----------
$('editBridges').addEventListener('click', (e) => {
  e.preventDefault();
  $('bridgeText').value = state.bridgeText;
  previewBridges();
  $('bridgeModal').hidden = false;
  $('bridgeText').focus();
});
function previewBridges() {
  const r = G.parseBridges($('bridgeText').value, state.byName);
  $('bridgeParse').innerHTML = `${r.pairs.length} bridge${r.pairs.length === 1 ? '' : 's'} recognised` +
    (r.unmatched.length ? `. <span style="color:var(--danger)">${r.unmatched.length} line(s) not understood: ${r.unmatched.slice(0, 3).map(esc).join(' · ')}${r.unmatched.length > 3 ? ' …' : ''}</span>` : '');
}
$('bridgeText').addEventListener('input', previewBridges);
$('bridgeCancel').addEventListener('click', () => { $('bridgeModal').hidden = true; });
$('bridgeSave').addEventListener('click', () => {
  state.bridgeText = $('bridgeText').value;
  store('bridges', state.bridgeText);
  applyBridgeText(state.bridgeText);
  $('bridgeModal').hidden = true;
  if (state.bridges.length && !$('optBridges').checked) $('optBridges').checked = true;
  onOptionsChange();
});

// ---------- sovereignty panel ----------
function renderSovList() {
  if (!state.sov) return;
  const counts = new Map();
  for (const o of Object.values(state.sov.systems)) if (o.a) counts.set(o.a, (counts.get(o.a) || 0) + 1);
  const q = $('sovFilter').value.trim().toLowerCase();
  const rows = [...counts.entries()]
    .map(([id, n]) => ({ id, n, name: nameOf(id) }))
    .filter((r) => !q || r.name.toLowerCase().includes(q))
    .sort((a, b) => b.n - a.n);
  $('sovList').innerHTML = rows.map((r) => `
    <div class="sov-item ${state.highlightAlliance === r.id ? 'on' : ''}" data-id="${r.id}" title="${esc(r.name)}">
      <span class="sw" style="background:${allianceColor(r.id)}"></span>
      <img src="https://images.evetech.net/alliances/${r.id}/logo?size=32" alt="" loading="lazy">
      <span class="nm">${esc(r.name)}</span>
      <span class="ct">${r.n}</span>
    </div>`).join('') || '<div class="note">No alliances match.</div>';
  $('sovList').querySelectorAll('.sov-item').forEach((it) => it.addEventListener('click', () => toggleAlliance(+it.dataset.id)));
  $('sovList').querySelectorAll('img').forEach((img) => img.addEventListener('error', () => { img.style.visibility = 'hidden'; }));
}
function toggleAlliance(id, force) {
  state.highlightAlliance = force || state.highlightAlliance !== id ? id : null;
  setColorMode('sov');
  renderSovList();
  if (state.highlightAlliance) {
    const mine = state.systems.filter((s) => { const o = sovOf(s); return o && o.a === id; });
    fitTo(mine, state.fitK * 30, isPhone() ? 50 : 200, isPhone() ? 140 : 200);
  }
  draw();
}
$('sovFilter').addEventListener('input', renderSovList);
$('sovRefresh').addEventListener('click', () => loadSov(true));

// ---------- toolbar ----------
function setColorMode(v) {
  state.colorMode = v;
  document.querySelectorAll('#colorMode button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  draw();
}
document.querySelectorAll('#colorMode button').forEach((b) => b.addEventListener('click', () => {
  setColorMode(b.dataset.v);
  if (b.dataset.v === 'sec') { state.highlightAlliance = null; renderSovList(); }
}));
document.querySelectorAll('#layoutMode button').forEach((b) => b.addEventListener('click', () => {
  state.layout = b.dataset.v;
  document.querySelectorAll('#layoutMode button').forEach((x) => x.classList.toggle('on', x === b));
  applyLayout(); fit();
}));
['showKills', 'showBridges'].forEach((id) => $(id).addEventListener('change', draw));
$('showHigh').addEventListener('change', (e) => { state.showHigh = e.target.checked; draw(); });
$('fit').addEventListener('click', fit);
function jumpToSearch() {
  const s = findSystem($('search').value);
  if (s) { select(s, { center: true }); $('search').value = ''; }
}
$('search').addEventListener('change', jumpToSearch);
$('search').addEventListener('keydown', (e) => { if (e.key === 'Enter') jumpToSearch(); });
$('dataRefresh').addEventListener('click', () => loadUniverse(true));
$('retry').addEventListener('click', () => loadUniverse(false).then((ok) => ok && startLive()));

// ---------- phone panel ----------
function setSheet(open) { $('sidebar').classList.toggle('open', open); }
$('sheetHandle').addEventListener('click', () => setSheet(!$('sidebar').classList.contains('open')));
// the map resizes when a phone rotates or the browser bar shows/hides
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- go ----------
function startLive() {
  loadSov(false);
  loadKills(false);
  // kills change hourly on ESI; check every 10 minutes while the app is open
  setInterval(() => loadKills(false), 10 * 60 * 1000);
}
resize();
loadUniverse(false).then((ok) => ok && startLive());
