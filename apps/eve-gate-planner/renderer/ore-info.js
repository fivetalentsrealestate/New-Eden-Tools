// What asteroid ore to expect in a system.
// CCP doesn't publish belt contents through its API, so this is a rule-based estimate from the
// system's security and which empire's space it is in (EVE University's ore tables), plus the
// number of asteroid belts, which ESI does publish. Ore anomalies spawn randomly; this lists the
// kinds that can appear, not what is there right now.
(function () {
  'use strict';

  const FACTION = {
    Amarr: ['Aridia', 'Derelik', 'Devoid', 'Domain', 'Genesis', 'Kador', 'Khanid', 'Kor-Azor', 'Tash-Murkon', 'The Bleak Lands'],
    Caldari: ['Black Rise', 'Lonetrek', 'The Citadel', 'The Forge'],
    Gallente: ['Essence', 'Everyshore', 'Placid', 'Sinq Laison', 'Solitude', 'Verge Vendor'],
    Minmatar: ['Heimatar', 'Metropolis', 'Molden Heath']
  };
  const DRONE_REGIONS = ['Cobalt Edge', 'Etherium Reach', 'Malpais', 'Oasa', 'Outer Passage', 'Perrigen Falls', 'The Kalevala Expanse', 'The Spire'];
  const factionOf = (region) => Object.keys(FACTION).find((f) => FACTION[f].includes(region)) || null;

  // Mining crystal group for each ore (crystals are cut for a group, e.g. "Coherent Asteroid Mining Crystal")
  const GROUP = {
    Veldspar: 'Simple', Scordite: 'Simple', Pyroxeres: 'Simple', Plagioclase: 'Simple', Mordunium: 'Simple',
    Kernite: 'Coherent', Omber: 'Coherent', Jaspet: 'Coherent', Hemorphite: 'Coherent', Hedbergite: 'Coherent', Ytirium: 'Coherent',
    Gneiss: 'Variegated', 'Dark Ochre': 'Variegated', Crokite: 'Variegated',
    Bistot: 'Complex', Arkonor: 'Complex', Spodumain: 'Complex',
    Mercoxit: 'Mercoxit'
  };

  function beltOres(sec, region) {
    const s = Math.round(sec * 10) / 10;
    const f = factionOf(region);
    if (region === 'Pochven') return { ores: ['Bezdnacine', 'Rakovene', 'Talassonite'], note: 'Pochven ores' };
    if (s >= 0.5) {
      const ores = ['Veldspar', 'Scordite'];
      if (s <= 0.9) {
        if (f === 'Amarr') ores.push('Pyroxeres');
        else if (f === 'Caldari') { ores.push('Pyroxeres'); if (s <= 0.7) ores.push('Plagioclase'); }
        else if (f) ores.push('Plagioclase');
      }
      return { ores, note: f ? null : 'Not empire space: belt mix uncertain' };
    }
    if (sec > 0) {
      const low = { Amarr: ['Pyroxeres', 'Kernite', 'Jaspet'], Caldari: ['Kernite', 'Pyroxeres'], Gallente: ['Omber', 'Jaspet'], Minmatar: ['Kernite', 'Omber'] };
      const deep = { Amarr: 'Hemorphite', Caldari: 'Hedbergite', Gallente: 'Hemorphite', Minmatar: 'Hedbergite' };
      if (!f) return { ores: [], note: 'Lowsec outside the four empires: belt mix not documented' };
      const ores = [...low[f]];
      if (s <= 0.2) ores.push(deep[f]);
      return { ores, note: null };
    }
    if (DRONE_REGIONS.includes(region)) return { ores: ['Arkonor', 'Bistot', 'Mercoxit'], note: 'Drone region' };
    const ores = ['Pyroxeres', 'Kernite'];
    if (sec <= -0.5) ores.push('Bistot');
    if (sec <= -0.6) ores.push('Arkonor');
    if (sec <= -0.8) ores.push('Mercoxit');
    return { ores, note: 'Nullsec belts vary by region; lower true security means richer ore' };
  }

  function oreSites(sec, region, bordersLowsec) {
    const s = Math.round(sec * 10) / 10;
    const out = [];
    if (region === 'Pochven') return ['Pochven ore sites (Bezdnacine, Rakovene, Talassonite, some Spodumain and Mercoxit)'];
    if (s >= 0.5) {
      if (s <= 0.8) out.push('Omber deposit, or Kernite and Omber deposit (rare)');
      if (s === 0.5 && bordersLowsec) out.push('Small Mordunium deposit (rare, high/low border)', 'Border-rare asteroid site: may hold Ytirium');
      return out;
    }
    if (sec > 0) {
      out.push('Jaspet, Gneiss, Dark Ochre or Crokite deposits', 'Hedbergite, Hemorphite and Jaspet deposit', 'Mordunium deposit (non-Faction-Warfare systems)');
      return out;
    }
    out.push('Asteroid clusters (Small to Colossal; richer variants at lower security)', 'Prospecting Arrays where the sov holder has upgraded the hub');
    return out;
  }

  // Asteroid belt count from ESI, cached per session.
  const beltCache = new Map();
  function beltCount(id) {
    if (!beltCache.has(id)) {
      beltCache.set(id, fetch(`https://esi.evetech.net/latest/universe/systems/${id}/`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => (s ? (s.planets || []).reduce((n, p) => n + ((p.asteroid_belts || []).length), 0) : null))
        .catch(() => null));
    }
    return beltCache.get(id);
  }

  window.OreInfo = { beltOres, oreSites, beltCount, group: (ore) => GROUP[ore] || null, factionOf };
})();
