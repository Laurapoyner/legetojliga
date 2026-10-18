// Fletning af spillets data mellem flere enheder. Bruges både i browseren og på serveren.
//
// Hver enhed sender kun det, den selv har ændret siden sidste synkronisering (en "patch").
// Serveren fletter patchen ind i familiens fælles data. XP regnes altid ud fra XP-loggen,
// så to enheder, der giver point samtidig, aldrig overskriver hinanden.

export const ARRAYS = ['children', 'toys', 'activities', 'submissions', 'xpLog', 'battles', 'careLog'];
// Poster i disse lister ændres aldrig efter de er oprettet
const IMMUTABLE = new Set(['xpLog', 'careLog']);
const MAX_CARELOG = 4000;

const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function makePatch(base, cur) {
  const patch = { arrays: {}, removed: {}, maps: {}, settings: {} };
  base = base || {};
  for (const key of ARRAYS) {
    const before = new Map((base[key] || []).map((r) => [r.id, r]));
    const changed = [];
    for (const r of cur[key] || []) {
      const old = before.get(r.id);
      if (!old) changed.push(r);
      else if (!IMMUTABLE.has(key) && !same(old, r)) changed.push(r);
    }
    if (changed.length) patch.arrays[key] = clone(changed);
    // careLog trimmes lokalt – det skal ikke slette noget på serveren
    if (key !== 'careLog' && key !== 'xpLog') {
      const now = new Set((cur[key] || []).map((r) => r.id));
      const gone = [...before.keys()].filter((id) => !now.has(id));
      if (gone.length) patch.removed[key] = gone;
    }
  }
  for (const key of ['missionClaims', 'achievements', 'achSeen']) {
    const b = base[key] || {};
    const c = cur[key] || {};
    const diff = {};
    for (const k of Object.keys(c)) if (!same(b[k], c[k])) diff[k] = clone(c[k]);
    if (Object.keys(diff).length) patch.maps[key] = diff;
  }
  const bs = base.settings || {};
  for (const [k, v] of Object.entries(cur.settings || {})) if (!same(bs[k], v)) patch.settings[k] = clone(v);
  if (!same(base.family, cur.family)) patch.family = clone(cur.family);
  if ((base.demo || false) !== (cur.demo || false)) patch.demo = !!cur.demo;
  return patch;
}

export function isEmptyPatch(p) {
  return (
    !p ||
    (!Object.keys(p.arrays || {}).length &&
      !Object.keys(p.removed || {}).length &&
      !Object.keys(p.maps || {}).length &&
      !Object.keys(p.settings || {}).length &&
      p.family === undefined &&
      p.demo === undefined)
  );
}

const SUB_RANK = { pending: 0, approved: 1, rejected: 1 };
const BATTLE_RANK = { pending: 0, cancelled: 1, declined: 1, expired: 1, done: 2 };

function mergeRecord(key, server, incoming) {
  if (!server) return incoming;
  if (key === 'submissions') {
    if ((SUB_RANK[server.status] ?? 0) > (SUB_RANK[incoming.status] ?? 0)) return server;
    const out = { ...incoming };
    if (server.status === incoming.status && server.seen) out.seen = true;
    if (server.photosDeleted) out.photosDeleted = true;
    return out;
  }
  if (key === 'battles') {
    if ((BATTLE_RANK[server.status] ?? 0) > (BATTLE_RANK[incoming.status] ?? 0)) return server;
    const out = { ...incoming };
    if (server.status === incoming.status) {
      out.seen = { ...(incoming.seen || {}) };
      for (const [c, v] of Object.entries(server.seen || {})) if (v) out.seen[c] = true;
    }
    return out;
  }
  if (key === 'toys') {
    const out = { ...incoming };
    if (server.deleted) out.deleted = true;
    const sc = server.care || {};
    const ic = incoming.care || {};
    const care = (sc.at || 0) > (ic.at || 0) ? { ...sc } : { ...ic };
    care.last = { ...(sc.last || {}) };
    for (const [a, t] of Object.entries(ic.last || {})) care.last[a] = Math.max(care.last[a] || 0, t);
    out.care = care;
    out.seenLevel = Math.max(server.seenLevel || 0, incoming.seenLevel || 0) || incoming.seenLevel;
    return out;
  }
  return incoming;
}

// Fletter en patch ind i en tilstand (ændrer og returnerer state)
export function applyPatch(state, patch) {
  if (!patch) return state;
  for (const key of ARRAYS) {
    state[key] = state[key] || [];
    const list = state[key];
    const index = new Map(list.map((r, i) => [r.id, i]));
    const removed = new Set(patch.removed?.[key] || []);
    for (const rec of patch.arrays?.[key] || []) {
      if (!rec || !rec.id) continue;
      if (key === 'xpLog' && rec.ref && list.some((e) => e.ref === rec.ref && e.toyId === rec.toyId && e.source === rec.source && e.id !== rec.id)) {
        continue; // samme belønning givet fra to enheder
      }
      const i = index.get(rec.id);
      if (i == null) {
        index.set(rec.id, list.length);
        list.push(clone(rec));
      } else list[i] = clone(mergeRecord(key, list[i], rec));
    }
    if (removed.size) state[key] = list.filter((r) => !removed.has(r.id));
  }
  const maps = patch.maps || {};
  if (maps.missionClaims) {
    state.missionClaims = state.missionClaims || {};
    for (const [day, byChild] of Object.entries(maps.missionClaims)) {
      const cur = (state.missionClaims[day] = state.missionClaims[day] || {});
      for (const [c, ids] of Object.entries(byChild || {})) cur[c] = [...new Set([...(cur[c] || []), ...ids])];
    }
  }
  if (maps.achievements) {
    state.achievements = state.achievements || {};
    for (const [c, got] of Object.entries(maps.achievements)) {
      const cur = (state.achievements[c] = state.achievements[c] || {});
      for (const [a, ts] of Object.entries(got || {})) cur[a] = cur[a] ? Math.min(cur[a], ts) : ts;
    }
  }
  if (maps.achSeen) {
    state.achSeen = state.achSeen || {};
    for (const [c, ts] of Object.entries(maps.achSeen)) state.achSeen[c] = Math.max(state.achSeen[c] || 0, ts);
  }
  state.settings = { ...(state.settings || {}), ...(patch.settings || {}) };
  if (patch.family !== undefined) state.family = clone(patch.family);
  if (patch.demo !== undefined) state.demo = patch.demo;
  recompute(state);
  return state;
}

// Regner XP, træningsbonus og kampstatistik ud fra loggen
export function recompute(state) {
  const xp = new Map();
  const stat = new Map();
  const subs = new Map((state.submissions || []).map((s) => [s.id, s]));
  const acts = new Map((state.activities || []).map((a) => [a.id, a]));
  for (const e of state.xpLog || []) {
    xp.set(e.toyId, Math.max(0, (xp.get(e.toyId) || 0) + e.amount));
    if (e.source === 'training' && e.amount > 0 && e.ref) {
      const s = acts.get(subs.get(e.ref)?.activityId)?.stat;
      if (!s) continue;
      const st = stat.get(e.toyId) || { sty: 0, for: 0, hur: 0 };
      if (s === 'alle') for (const k of ['sty', 'for', 'hur']) st[k] += e.amount / 3;
      else st[s] = (st[s] || 0) + e.amount;
      stat.set(e.toyId, st);
    }
  }
  const rec = new Map();
  for (const b of state.battles || []) {
    if (b.status !== 'done' || !b.result) continue;
    for (const [toyId, side] of [
      [b.challengerToyId, 'a'],
      [b.opponentToyId, 'b'],
    ]) {
      const r = rec.get(toyId) || { battles: 0, wins: 0, losses: 0, draws: 0 };
      r.battles++;
      if (b.result.winner === 'draw') r.draws++;
      else if (b.result.winner === side) r.wins++;
      else r.losses++;
      rec.set(toyId, r);
    }
  }
  for (const t of state.toys || []) {
    t.xp = xp.get(t.id) || 0;
    t.statXp = stat.get(t.id) || { sty: 0, for: 0, hur: 0 };
    t.record = rec.get(t.id) || { battles: 0, wins: 0, losses: 0, draws: 0 };
  }
  if ((state.careLog || []).length > MAX_CARELOG) state.careLog = state.careLog.slice(-MAX_CARELOG);
  return state;
}
