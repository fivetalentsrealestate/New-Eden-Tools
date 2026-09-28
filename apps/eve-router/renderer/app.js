/* global Planner */
'use strict';

// ---------- state ----------
const P = window.Planner;
const state = {
  systems: [],
  byId: new Map(),
  byName: new Map(),
  adj: new Map(),
  jumps: [],
  regions: {},
  constellations: {},
  regionLabels: [],
  sov: null,
  allianceColor: new Map(),
  colorMode: 'sec',
  layout: '3d',
  showGates: true,
  showHigh: true,
  selected: null,
  hover: null,
  highlightAlliance: null,
  route: null,
  rangeSet: null,
  avoid: new Set(),
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
  const d = P.displaySec(s);
  if (d <= 0) return '#f00000';
  return SEC_COLORS[d.toFixed(1)] || '#f00000';
}
function secHtml(s) {
  const d = P.displaySec(s);
  return `<span class="sec" style="color:${secColor(s)}">${d.toFixed(1)}</span>`;
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
function store(key, val) { try { localStorage.setItem('er.' + key, JSON.stringify(val)); } catch (e) { /* ignore */ } }
function recall(key, def) { try { const v = localStorage.getItem('er.' + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
function fmtMin(m) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}
function findSystem(text) {
  if (!text) return null;
  return state.byName.get(text.trim().toLowerCase()) || null;
}

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
    const msg = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
    setLoading("Couldn't load map data", `${msg}. Check your internet connection — the first run downloads CCP's static data.`, 0);
    $('retry').hidden = false;
    return false;
  }
}

async function loadSov(refresh) {
  $('sovStatus').textContent = 'Loading sovereignty…';
  try {
    state.sov = await window.api.getSov(refresh);
    const when = new Date(state.sov.fetchedAt);
    $('sovStatus').textContent = (state.sov.offline ? 'Offline — cached ' : 'Updated ') + when.toLocaleString();
    renderSovList();
    if (state.selected) renderSystem(state.selected);
    if (state.route && !state.route.error) renderRoute();
    draw();
  } catch (e) {
    $('sovStatus').textContent = 'Could not reach ESI: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
}

function ingest(u) {
  state.regions = u.regions;
  state.constellations = u.constellations || {};
  state.systems = u.systems;
  state.byId = new Map(u.systems.map((s) => [s.id, s]));
  state.byName = new Map(u.systems.map((s) => [s.n.toLowerCase(), s]));
  state.jumps = u.jumps.map(([a, b]) => [state.byId.get(a), state.byId.get(b)]).filter(([a, b]) => a && b);
  state.adj = new Map();
  for (const [a, b] of state.jumps) {
    if (!state.adj.has(a.id)) state.adj.set(a.id, []);
    if (!state.adj.has(b.id)) state.adj.set(b.id, []);
    state.adj.get(a.id).push(b);
    state.adj.get(b.id).push(a);
  }
  // datalist for every search box
  const frag = document.createDocumentFragment();
  [...state.systems].sort((a, b) => a.n.localeCompare(b.n)).forEach((s) => {
    const o = document.createElement('option');
    o.value = s.n;
    frag.appendChild(o);
  });
  $('systemList').replaceChildren(frag);

  applyLayout();
  fit();
  restoreForm();
}

function applyLayout() {
  const use2d = state.layout === '2d';
  for (const s of state.systems) {
    if (use2d && s.x2 != null) { s.wx = s.x2; s.wy = -s.y2; } else { s.wx = s.x; s.wy = -s.z; }
  }
  // median gate length on screen-space world coords → drives label density & blob size
  const lens = state.jumps
    .filter(([a, b]) => a.r === b.r)
    .map(([a, b]) => Math.hypot(a.wx - b.wx, a.wy - b.wy))
    .sort((a, b) => a - b);
  state.medianGate = lens.length ? lens[lens.length >> 1] || 1 : 1;
  // region labels at their centroid
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
function fit() {
  const pts = state.systems.filter((s) => s.id < 31000000 && !(P.displaySec(s.s) >= 0.5 && !state.showHigh));
  if (!pts.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of pts) { minX = Math.min(minX, s.wx); maxX = Math.max(maxX, s.wx); minY = Math.min(minY, s.wy); maxY = Math.max(maxY, s.wy); }
  const { W, H } = viewSize();
  state.cam.x = (minX + maxX) / 2;
  state.cam.y = (minY + maxY) / 2;
  state.cam.k = Math.min((W - 60) / (maxX - minX || 1), (H - 110) / (maxY - minY || 1));
  state.fitK = state.cam.k;
  draw();
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

function visible(sys) { return state.showHigh || P.displaySec(sys.s) < 0.5; }

function systemFill(sys) {
  if (state.colorMode === 'sov') {
    const o = sovOf(sys);
    if (o && o.a) {
      if (state.highlightAlliance && o.a !== state.highlightAlliance) return 'rgba(120,130,150,.25)';
      return allianceColor(o.a);
    }
    if (state.highlightAlliance) return 'rgba(120,130,150,.18)';
    return P.displaySec(sys.s) >= 0.5 ? 'rgba(150,160,180,.35)' : 'rgba(150,160,180,.5)';
  }
  return secColor(sys.s);
}

function render() {
  const { W, H } = viewSize();
  ctx.clearRect(0, 0, W, H);
  if (!state.systems.length) return;
  const k = state.cam.k;
  const pad = 40;
  const onScreen = (x, y) => x > -pad && y > -pad && x < W + pad && y < H + pad;

  // screen positions this frame
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

  // Gates
  if (state.showGates) {
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
  }

  // Jump range highlight
  if (state.rangeSet && $('showRange').checked) {
    ctx.strokeStyle = 'rgba(255,179,71,.75)';
    ctx.lineWidth = 1.2;
    const r = Math.max(3.5, Math.min(7, k * state.medianGate * 0.22));
    for (const s of state.rangeSet) {
      if (!onScreen(s.sx, s.sy)) continue;
      ctx.beginPath(); ctx.arc(s.sx, s.sy, r + 2.5, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // Systems
  const dotR = Math.max(1.4, Math.min(5, k * state.medianGate * 0.12));
  for (const s of state.systems) {
    if (!visible(s) || !onScreen(s.sx, s.sy)) continue;
    ctx.fillStyle = systemFill(s);
    ctx.beginPath(); ctx.arc(s.sx, s.sy, dotR, 0, Math.PI * 2); ctx.fill();
    if (state.avoid.has(s.id)) {
      ctx.strokeStyle = '#ff5d6c'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.sx - 5, s.sy - 5); ctx.lineTo(s.sx + 5, s.sy + 5); ctx.moveTo(s.sx + 5, s.sy - 5); ctx.lineTo(s.sx - 5, s.sy + 5); ctx.stroke();
    }
  }

  // Route
  if (state.route && state.route.legs && state.route.legs.length) {
    const legs = state.route.legs;
    ctx.lineCap = 'round';
    for (const pass of [{ w: 7, c: 'rgba(255,209,102,.18)' }, { w: 2.2, c: '#ffd166' }]) {
      ctx.strokeStyle = pass.c; ctx.lineWidth = pass.w;
      ctx.beginPath();
      ctx.moveTo(legs[0].from.sx, legs[0].from.sy);
      for (const l of legs) ctx.lineTo(l.to.sx, l.to.sy);
      ctx.stroke();
    }
    const stops = [legs[0].from, ...legs.map((l) => l.to)];
    ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    stops.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#4fd18b' : i === stops.length - 1 ? '#ff5d6c' : '#ffd166';
      ctx.beginPath(); ctx.arc(s.sx, s.sy, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#05070b';
      ctx.fillText(i === 0 ? 'S' : String(i), s.sx, s.sy + 0.5);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Labels
  const showSysNames = k * state.medianGate > 38;
  if (showSysNames) {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(216,225,238,.75)';
    // skip labels that would overlap one already drawn
    const taken = new Set();
    for (const s of state.systems) {
      if (!visible(s) || s.sx < 0 || s.sy < 0 || s.sx > W || s.sy > H) continue;
      const cx = Math.floor(s.sx / 64), cy = Math.floor(s.sy / 14);
      if (taken.has(`${cx},${cy}`) || taken.has(`${cx + 1},${cy}`)) continue;
      taken.add(`${cx},${cy}`); taken.add(`${cx + 1},${cy}`);
      ctx.fillText(s.n, s.sx + dotR + 3, s.sy + 3.5);
    }
  }
  if (k * state.medianGate < 70) {
    ctx.font = `600 ${showSysNames ? 15 : 12}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = showSysNames ? 'rgba(143,123,255,.35)' : 'rgba(200,210,230,.55)';
    for (const r of state.regionLabels) {
      const [x, y] = toScreen(r.x, r.y);
      if (x < -100 || y < -20 || x > W + 100 || y > H + 20) continue;
      ctx.fillText(r.name.toUpperCase(), x, y);
    }
    ctx.textAlign = 'left';
  }

  // Selection / hover rings
  for (const [sys, col] of [[state.hover, 'rgba(255,255,255,.6)'], [state.selected, '#3fb6ff']]) {
    if (!sys) continue;
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sys.sx, sys.sy, dotR + 6, 0, Math.PI * 2); ctx.stroke();
  }
  if (state.selected && !showSysNames) {
    ctx.font = '600 12px "Segoe UI", sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(state.selected.n, state.selected.sx + dotR + 9, state.selected.sy + 4);
  }

  renderLegend();
}

function renderLegend() {
  const el = $('legend');
  if (state.colorMode === 'sec') {
    el.innerHTML = ['1.0', '0.8', '0.6', '0.5', '0.4', '0.2', '0.1'].map((d) =>
      `<span class="lg"><span class="dot" style="background:${SEC_COLORS[d]}"></span>${d}</span>`).join('') +
      '<span class="lg"><span class="dot" style="background:#f00000"></span>0.0 / null</span>' +
      '<span class="lg"><span class="dot" style="background:rgba(160,100,220,.8);border-radius:2px;height:2px;width:14px"></span>region gate</span>';
  } else {
    el.innerHTML = state.sov
      ? '<span>Nullsec systems coloured by alliance holding sovereignty. Grey = NPC / empire / unclaimed. Pick an alliance in the Sovereignty tab to isolate it.</span>'
      : '<span>Sovereignty data not loaded yet.</span>';
  }
}

// ---------- interaction ----------
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
  const f = Math.exp(-e.deltaY * 0.0015);
  state.cam.k = Math.min(state.fitK * 120, Math.max(state.fitK * 0.5, state.cam.k * f));
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
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
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

function showTooltip(sys, x, y) {
  const tip = $('tooltip');
  if (!sys) { tip.hidden = true; return; }
  const sov = sovLabel(sys);
  const start = findSystem($('from').value);
  const dist = start && start !== sys ? `<div class="m">${P.dist(start, sys).toFixed(2)} LY from ${esc(start.n)}</div>` : '';
  tip.innerHTML = `<div class="t">${esc(sys.n)} ${secHtml(sys.s)}</div>
    <div class="m">${esc(state.regions[sys.r] || '')} · ${esc(state.constellations[sys.c] || '')}</div>
    ${sov ? `<div>${esc(sov)}</div>` : ''}${dist}
    ${P.canJumpTo(sys) ? '' : '<div class="m">No cyno / jump destination</div>'}`;
  tip.hidden = false;
  const { W, H } = viewSize();
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  tip.style.left = `${Math.min(W - tw - 8, x + 14)}px`;
  tip.style.top = `${Math.min(H - th - 8, y + 14)}px`;
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
  const gates = (state.adj.get(sys.id) || []).slice().sort((a, b) => a.n.localeCompare(b.n));
  const start = findSystem($('from').value);
  el.innerHTML = `
    <div class="sys-title">${esc(sys.n)} ${secHtml(sys.s)}</div>
    <div class="kv">
      <span class="k">Region</span><span>${esc(state.regions[sys.r] || '—')}</span>
      <span class="k">Constellation</span><span>${esc(state.constellations[sys.c] || '—')}</span>
      <span class="k">True sec</span><span>${sys.s.toFixed(3)}</span>
      <span class="k">Sovereignty</span><span>${o && o.a ? `<span class="link" data-alliance="${o.a}">${esc(nameOf(o.a))}</span>` : o && o.f ? esc(nameOf(o.f)) : '—'}</span>
      <span class="k">Jump drives</span><span>${P.canJumpTo(sys) ? '<span style="color:var(--ok)">Cyno allowed</span>' : '<span style="color:var(--danger)">Can\'t jump here</span>'}</span>
      ${start && start !== sys ? `<span class="k">From ${esc(start.n)}</span><span>${P.dist(start, sys).toFixed(2)} LY</span>` : ''}
    </div>
    <div>
      <div class="note" style="margin-bottom:6px">Stargates (${gates.length})</div>
      <div class="gate-list">${gates.map((g) => `<span class="link" data-sys="${g.id}">${esc(g.n)}</span>`).join('') || '<span class="note">None</span>'}</div>
    </div>
    <div class="btn-row">
      <button data-act="from">Set as start</button>
      <button data-act="to">Set as destination</button>
      <button data-act="avoid" class="ghost">${state.avoid.has(sys.id) ? 'Un-avoid' : 'Avoid'}</button>
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
  el.querySelector('[data-act=from]').addEventListener('click', () => { $('from').value = sys.n; onFormChange(); switchTab('jump'); });
  el.querySelector('[data-act=to]').addEventListener('click', () => { $('to').value = sys.n; onFormChange(); switchTab('jump'); });
  el.querySelector('[data-act=avoid]').addEventListener('click', () => {
    if (state.avoid.has(sys.id)) state.avoid.delete(sys.id); else state.avoid.add(sys.id);
    renderAvoid(); renderSystem(sys); draw();
  });
}

// ---------- jump planner ----------
function currentShip() { return P.SHIPS.find((s) => s.id === $('ship').value) || P.SHIPS[0]; }
function currentRange() {
  if ($('customRangeOn').checked) return Math.max(0.1, parseFloat($('customRange').value) || 0);
  return P.shipRange(currentShip(), +$('jdc').value);
}
function updateRangeReadout() {
  const r = currentRange();
  $('rangeVal').textContent = r.toFixed(2);
  if (!$('customRangeOn').checked) $('customRange').value = r.toFixed(2);
}
function updateRangeSet() {
  const start = findSystem($('from').value);
  state.rangeSet = start ? P.inRange(state.systems, start, currentRange()) : null;
}
function onFormChange() {
  updateRangeReadout();
  updateRangeSet();
  store('form', {
    ship: $('ship').value, jdc: $('jdc').value, mode: $('mode').value,
    from: $('from').value, to: $('to').value,
    customOn: $('customRangeOn').checked, custom: $('customRange').value,
    avoid: [...state.avoid]
  });
  draw();
}
function restoreForm() {
  const f = recall('form', null);
  if (!f) { onFormChange(); return; }
  if (f.ship) $('ship').value = f.ship;
  if (f.jdc) $('jdc').value = f.jdc;
  if (f.mode) $('mode').value = f.mode;
  $('from').value = f.from || '';
  $('to').value = f.to || '';
  $('customRangeOn').checked = !!f.customOn;
  $('customRange').disabled = !f.customOn;
  if (f.custom) $('customRange').value = f.custom;
  state.avoid = new Set((f.avoid || []).filter((id) => state.byId.has(id)));
  renderAvoid();
  onFormChange();
}

P.SHIPS.forEach((s) => {
  const o = document.createElement('option');
  o.value = s.id; o.textContent = `${s.name} (${s.max} LY max)`;
  $('ship').appendChild(o);
});
['ship', 'jdc', 'mode', 'customRange'].forEach((id) => $(id).addEventListener('change', onFormChange));
$('customRange').addEventListener('input', onFormChange);
$('customRangeOn').addEventListener('change', () => { $('customRange').disabled = !$('customRangeOn').checked; onFormChange(); });
['from', 'to'].forEach((id) => $(id).addEventListener('change', () => {
  onFormChange();
  const s = findSystem($(id).value);
  if (s) select(s, { stay: true });
}));
$('showRange').addEventListener('change', draw);
$('swap').addEventListener('click', () => { const a = $('from').value; $('from').value = $('to').value; $('to').value = a; onFormChange(); });
$('clearRoute').addEventListener('click', () => { state.route = null; $('routeResult').innerHTML = ''; draw(); });

function renderAvoid() {
  $('avoidChips').innerHTML = [...state.avoid].map((id) => {
    const s = state.byId.get(id);
    return s ? `<span class="chip">${esc(s.n)}<button data-id="${id}" title="Remove">×</button></span>` : '';
  }).join('');
  $('avoidChips').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    state.avoid.delete(+b.dataset.id); renderAvoid(); onFormChange();
  }));
}
function addAvoid() {
  const s = findSystem($('avoidInput').value);
  if (!s) return;
  state.avoid.add(s.id); $('avoidInput').value = '';
  renderAvoid(); onFormChange();
}
$('avoidAdd').addEventListener('click', addAvoid);
$('avoidInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addAvoid(); });

function plan() {
  const from = findSystem($('from').value), to = findSystem($('to').value);
  if (!from || !to) {
    state.route = { error: !from ? 'Pick a valid start system.' : 'Pick a valid destination system.' };
    renderRoute(); return;
  }
  const ship = currentShip();
  state.route = P.planRoute(state.systems, from.id, to.id, {
    range: currentRange(), mode: $('mode').value, avoid: state.avoid, fatigueReduction: ship.fatigue
  });
  renderRoute();
  if (state.route.legs) fitToRoute();
  draw();
}
$('plan').addEventListener('click', plan);
['from', 'to'].forEach((id) => $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { onFormChange(); plan(); } }));

function fitToRoute() {
  const pts = [state.route.legs[0].from, ...state.route.legs.map((l) => l.to)];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of pts) { minX = Math.min(minX, s.wx); maxX = Math.max(maxX, s.wx); minY = Math.min(minY, s.wy); maxY = Math.max(maxY, s.wy); }
  const { W, H } = viewSize();
  state.cam.x = (minX + maxX) / 2; state.cam.y = (minY + maxY) / 2;
  state.cam.k = Math.min(state.fitK * 40, Math.min((W - (isPhone() ? 50 : 200)) / (maxX - minX || 1), (H - (isPhone() ? 140 : 200)) / (maxY - minY || 1)));
}

function renderRoute() {
  const el = $('routeResult');
  const r = state.route;
  if (!r) { el.innerHTML = ''; return; }
  if (r.error) { el.innerHTML = `<div class="error">${esc(r.error)}</div>`; return; }
  if (!r.legs.length) { el.innerHTML = '<div class="note">Start and destination are the same system.</div>'; return; }
  const f = r.fatigue;
  el.innerHTML = `
    <div class="route-summary">
      <div class="stat"><div class="k">Jumps</div><div class="v">${r.legs.length}</div></div>
      <div class="stat"><div class="k">Total distance</div><div class="v">${r.totalLy.toFixed(2)} LY</div></div>
      <div class="stat"><div class="k">Fatigue on arrival</div><div class="v">${fmtMin(f.finalFatigue)}</div></div>
      <div class="stat"><div class="k">Waiting on timers</div><div class="v">${fmtMin(f.travelMinutes)}</div></div>
    </div>
    <table class="route-table">
      <thead><tr><th>#</th><th>System</th><th>LY</th><th>Fatigue</th><th>Timer</th></tr></thead>
      <tbody>
        <tr data-sys="${r.legs[0].from.id}"><td>S</td><td>${esc(r.legs[0].from.n)} ${secHtml(r.legs[0].from.s)}<span class="sov">${esc(sovLabel(r.legs[0].from) || state.regions[r.legs[0].from.r] || '')}</span></td><td></td><td></td><td></td></tr>
        ${r.legs.map((l, i) => `<tr data-sys="${l.to.id}">
          <td>${i + 1}</td>
          <td>${esc(l.to.n)} ${secHtml(l.to.s)}<span class="sov">${esc(sovLabel(l.to) || state.regions[l.to.r] || '')}</span></td>
          <td>${l.ly.toFixed(2)}</td>
          <td>${fmtMin(f.steps[i].fatigue)}</td>
          <td>${fmtMin(f.steps[i].cooldown)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <p class="note">Fatigue assumes you start fresh and jump as soon as each activation timer ends. Estimates only — check in game before committing a fleet.</p>`;
  el.querySelectorAll('tr[data-sys]').forEach((tr) => {
    const s = state.byId.get(+tr.dataset.sys);
    tr.addEventListener('mouseenter', () => { state.hover = s; draw(); });
    tr.addEventListener('mouseleave', () => { state.hover = null; draw(); });
    tr.addEventListener('click', () => { state.selected = s; centerOn(s); });
  });
}

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
    if (mine.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const s of mine) { minX = Math.min(minX, s.wx); maxX = Math.max(maxX, s.wx); minY = Math.min(minY, s.wy); maxY = Math.max(maxY, s.wy); }
      const { W, H } = viewSize();
      state.cam.x = (minX + maxX) / 2; state.cam.y = (minY + maxY) / 2;
      state.cam.k = Math.min(state.fitK * 30, Math.min((W - (isPhone() ? 50 : 200)) / (maxX - minX || 1), (H - (isPhone() ? 140 : 200)) / (maxY - minY || 1)));
    }
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
$('showGates').addEventListener('change', (e) => { state.showGates = e.target.checked; draw(); });
$('showHigh').addEventListener('change', (e) => { state.showHigh = e.target.checked; draw(); });
$('fit').addEventListener('click', fit);
$('search').addEventListener('change', () => {
  const s = findSystem($('search').value);
  if (s) { select(s, { center: true }); $('search').value = ''; }
});
$('search').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { const s = findSystem($('search').value); if (s) { select(s, { center: true }); $('search').value = ''; } }
});
$('dataRefresh').addEventListener('click', () => loadUniverse(true));
$('retry').addEventListener('click', () => loadUniverse(false).then((ok) => ok && !state.sov && loadSov(false)));

// ---------- phone panel ----------
function setSheet(open) { $('sidebar').classList.toggle('open', open); }
$('sheetHandle').addEventListener('click', () => setSheet(!$('sidebar').classList.contains('open')));
// the map resizes when a phone rotates or the browser bar shows/hides
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------- go ----------
resize();
loadUniverse(false).then((ok) => ok && loadSov(false));
