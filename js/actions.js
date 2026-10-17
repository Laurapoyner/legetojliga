// Alle handlinger i spillet: de ændrer tilstanden, gemmer og sender begivenheder til skærmen.
// Når der kommer en server på, er det disse funktioner, der skal kalde API'et.

import * as store from './store.js';
import { ACTIVITIES, CARE, CLASSES, TOY_TYPES, AVATAR_COLORS, DIFFICULTY } from './catalog.js';
import {
  levelInfo, activityUsage, checkBattleAllowed, validateMoves, battleSnapshot, resolveBattle,
  xpTodayBySource, careCooldownLeft, applyCare, careNow, dailyMissions, missionProgress,
  isMissionClaimed, newAchievements, scaledTarget,
} from './rules.js';
import { uid, dayKey, clamp, createEmitter, randomSeed, fmtDuration, hashStr } from './util.js';

export const bus = createEmitter();
export let S = null;

const STATE_KEY = 'state';
const STATE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  battlesPerToy: 3,
  battlesPerChild: 15,
  battleXpCap: 100,
  xpWin: 20,
  xpLoss: 12,
  xpDraw: 16,
  careXpCap: 15,
  proofPhotoDays: 14,
  challengeHours: 48,
  maxOpenChallenges: 3,
};

export function defaultState() {
  return {
    v: STATE_VERSION,
    createdAt: Date.now(),
    demo: false,
    family: null,
    settings: { ...DEFAULT_SETTINGS },
    children: [],
    toys: [],
    activities: ACTIVITIES.map((a) => ({ ...a, active: true, builtin: true })),
    submissions: [],
    xpLog: [],
    battles: [],
    careLog: [],
    missionClaims: {},
    achievements: {},
  };
}

// Tilføjer nye standardaktiviteter og indstillinger, hvis spillet er blevet opdateret
function migrate(st) {
  const base = defaultState();
  const out = { ...base, ...st };
  out.settings = { ...DEFAULT_SETTINGS, ...(st.settings || {}) };
  const have = new Set((st.activities || []).map((a) => a.id));
  out.activities = [...(st.activities || [])];
  for (const a of base.activities) if (!have.has(a.id)) out.activities.push(a);
  for (const a of out.activities) {
    const fresh = ACTIVITIES.find((x) => x.id === a.id);
    if (fresh && a.builtin) {
      // Behold forældrenes ændringer, men opdater tekster og kamera-opsætning
      a.cam = fresh.cam;
      a.icon = a.icon || fresh.icon;
    }
  }
  for (const k of ['submissions', 'xpLog', 'battles', 'careLog', 'children', 'toys']) out[k] = out[k] || [];
  out.missionClaims = out.missionClaims || {};
  out.achievements = out.achievements || {};
  out.v = STATE_VERSION;
  return out;
}

// ---------- Indlæsning og gemning ----------

let saveTimer = null;
let savePending = false;
export let lastSaveError = null;

export async function loadGame() {
  const mode = await store.initStore();
  const raw = await store.getKV(STATE_KEY);
  S = raw ? migrate(raw) : defaultState();
  cleanup();
  return mode;
}

export function save() {
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 250);
  bus.emit('changed');
}

export async function flushSave() {
  clearTimeout(saveTimer);
  if (!savePending || !S) return;
  savePending = false;
  try {
    await store.setKV(STATE_KEY, S);
    lastSaveError = null;
  } catch (e) {
    lastSaveError = e;
    bus.emit('saveError', e);
  }
}

// ---------- Billeder ----------

const photoCache = new Map();

export async function savePhoto(dataUrl, prefix = 'p') {
  const id = uid(prefix);
  await store.putPhoto(id, dataUrl);
  photoCache.set(id, dataUrl);
  return id;
}

export async function photoUrl(id) {
  if (!id) return null;
  if (photoCache.has(id)) return photoCache.get(id);
  const url = await store.getPhoto(id);
  if (url) photoCache.set(id, url);
  return url;
}

export function cachedPhoto(id) {
  return photoCache.get(id) || null;
}

async function removePhoto(id) {
  if (!id) return;
  photoCache.delete(id);
  await store.deletePhoto(id);
}

// ---------- Familie og PIN ----------

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'f' + hashStr(text).toString(16);
  }
}

export async function setupFamily({ pin, children }) {
  const salt = uid('s');
  S.family = { salt, pinHash: await hashPin(pin, salt), createdAt: Date.now() };
  for (const [i, c] of children.entries()) addChild({ name: c.name, color: c.color || AVATAR_COLORS[i % AVATAR_COLORS.length] }, false);
  save();
  store.requestPersistence();
}

export async function checkPin(pin) {
  if (!S.family) return false;
  return (await hashPin(pin, S.family.salt)) === S.family.pinHash;
}

export async function changePin(pin) {
  const salt = uid('s');
  S.family = { ...S.family, salt, pinHash: await hashPin(pin, salt) };
  save();
}

// ---------- Børn ----------

export function addChild({ name, color, difficulty = 'normal' }, doSave = true) {
  const clean = String(name || '').trim().slice(0, 24);
  if (!clean) return { ok: false, reason: 'Skriv et navn' };
  const child = {
    id: uid('c'),
    name: clean,
    color: color || AVATAR_COLORS[S.children.length % AVATAR_COLORS.length],
    difficulty: DIFFICULTY[difficulty] ? difficulty : 'normal',
    createdAt: Date.now(),
    archived: false,
  };
  S.children.push(child);
  if (doSave) save();
  return { ok: true, child };
}

export function updateChild(id, patch) {
  const c = S.children.find((x) => x.id === id);
  if (!c) return { ok: false, reason: 'Barnet findes ikke' };
  if (patch.name != null) {
    const n = String(patch.name).trim().slice(0, 24);
    if (!n) return { ok: false, reason: 'Navnet må ikke være tomt' };
    c.name = n;
  }
  if (patch.color) c.color = patch.color;
  if (patch.difficulty && DIFFICULTY[patch.difficulty]) c.difficulty = patch.difficulty;
  if (patch.archived != null) c.archived = !!patch.archived;
  save();
  return { ok: true, child: c };
}

export const activeChildren = () => S.children.filter((c) => !c.archived);
export const childById = (id) => S.children.find((c) => c.id === id) || null;

// ---------- Legetøj ----------

export const toyById = (id) => S.toys.find((t) => t.id === id) || null;
export const toysOf = (childId) => S.toys.filter((t) => t.childId === childId && !t.deleted);

export async function createToy({ childId, name, type, cls, photoDataUrl }) {
  if (!childById(childId)) return { ok: false, reason: 'Vælg en spiller' };
  const n = String(name || '').trim().slice(0, 28);
  if (!n) return { ok: false, reason: 'Giv dit legetøj et navn' };
  if (!CLASSES[cls]) return { ok: false, reason: 'Vælg en klasse' };
  const photoId = photoDataUrl ? await savePhoto(photoDataUrl, 'toy') : null;
  const toy = {
    id: uid('t'),
    childId,
    name: n,
    type: TOY_TYPES.some((t) => t.id === type) ? type : 'andet',
    cls,
    photoId,
    xp: 0,
    statXp: { sty: 0, for: 0, hur: 0 },
    care: { energi: 90, glaede: 90, at: Date.now(), last: {} },
    record: { battles: 0, wins: 0, losses: 0, draws: 0 },
    createdAt: Date.now(),
    deleted: false,
  };
  S.toys.push(toy);
  checkAchievements(childId);
  save();
  return { ok: true, toy };
}

export async function updateToy(id, { name, photoDataUrl, type, cls }) {
  const toy = toyById(id);
  if (!toy) return { ok: false, reason: 'Legetøjet findes ikke' };
  if (name != null) {
    const n = String(name).trim().slice(0, 28);
    if (!n) return { ok: false, reason: 'Navnet må ikke være tomt' };
    toy.name = n;
  }
  if (type && TOY_TYPES.some((t) => t.id === type)) toy.type = type;
  if (cls && CLASSES[cls]) toy.cls = cls;
  if (photoDataUrl) {
    const old = toy.photoId;
    toy.photoId = await savePhoto(photoDataUrl, 'toy');
    await removePhoto(old);
  }
  save();
  return { ok: true, toy };
}

export async function deleteToy(id) {
  const toy = toyById(id);
  if (!toy) return { ok: false };
  toy.deleted = true;
  // Kampe, der venter på dette legetøj, aflyses
  for (const b of S.battles) {
    if (b.status === 'pending' && b.challengerToyId === id) {
      b.status = 'cancelled';
      b.decidedAt = Date.now();
    }
  }
  save();
  return { ok: true };
}

// ---------- XP ----------

export function grantXp({ childId, toyId, amount, source, ref = null, note = '', stat = null }) {
  const toy = toyById(toyId);
  amount = Math.round(amount);
  if (!toy || !amount) return { gained: 0, levelUps: [] };
  if (ref && S.xpLog.some((e) => e.ref === ref && e.toyId === toyId && e.source === source)) {
    return { gained: 0, levelUps: [], duplicate: true };
  }
  const before = levelInfo(toy.xp).level;
  const newXp = Math.max(0, (toy.xp || 0) + amount);
  const real = newXp - (toy.xp || 0);
  toy.xp = newXp;
  if (stat && real > 0) {
    toy.statXp = toy.statXp || { sty: 0, for: 0, hur: 0 };
    if (stat === 'alle') for (const k of ['sty', 'for', 'hur']) toy.statXp[k] += real / 3;
    else toy.statXp[stat] = (toy.statXp[stat] || 0) + real;
  }
  const after = levelInfo(toy.xp).level;
  S.xpLog.push({ id: uid('x'), ts: Date.now(), day: dayKey(), childId, toyId, amount: real, source, ref, note });
  const levelUps = after > before ? [{ childId, toyId, from: before, to: after }] : [];
  for (const lu of levelUps) bus.emit('levelup', lu);
  if (after !== before) checkAchievements(childId);
  return { gained: real, levelUps };
}

// ---------- Aktiviteter ----------

export const activityById = (id) => S.activities.find((a) => a.id === id) || null;

export function canDoActivity(childId, act) {
  if (!act || !act.active) return { ok: false, reason: 'Opgaven er ikke aktiv' };
  const u = activityUsage(S, childId, act);
  if (!u.ok) {
    return { ok: false, reason: u.per === 'week' ? 'Den er allerede klaret nok gange denne uge.' : 'Den er allerede klaret nok gange i dag. Prøv igen i morgen!', usage: u };
  }
  return { ok: true, usage: u };
}

export function completeCameraTraining({ childId, toyId, activityId, reps = 0, seconds = 0 }) {
  const act = activityById(activityId);
  const toy = toyById(toyId);
  const child = childById(childId);
  if (!act || act.kind !== 'camera' || !toy || toy.childId !== childId || !child) return { ok: false, reason: 'Træningen kunne ikke gemmes' };
  const can = canDoActivity(childId, act);
  if (!can.ok) return can;
  const target = scaledTarget(act, child.difficulty);
  const achieved = act.cam.unit === 'sec' ? seconds : reps;
  if (achieved < target) return { ok: false, reason: 'Øvelsen er ikke færdig endnu' };
  const now = Date.now();
  const sub = {
    id: uid('s'), childId, toyId, activityId, cat: act.cat, kind: act.kind, via: 'camera', status: 'approved',
    createdAt: now, decidedAt: now, day: dayKey(now), reps: Math.round(reps), seconds: Math.round(seconds), target,
    xp: act.xp, toyLevel: levelInfo(toy.xp).level, photos: [], seen: true,
  };
  S.submissions.push(sub);
  const res = grantXp({ childId, toyId, amount: act.xp, source: 'training', ref: sub.id, stat: act.stat });
  checkAchievements(childId);
  save();
  return { ok: true, sub, ...res };
}

// photos: [{ role: 'foer' | 'efter', dataUrl }]
export async function submitActivity({ childId, toyId, activityId, photos = [], via }) {
  const act = activityById(activityId);
  const toy = toyById(toyId);
  if (!act || !toy || toy.childId !== childId) return { ok: false, reason: 'Vælg et legetøj først' };
  const can = canDoActivity(childId, act);
  if (!can.ok) return can;
  if (act.kind === 'photo' && via !== 'manual' && !photos.some((p) => p.role === 'efter')) {
    return { ok: false, reason: 'Tag et billede, når du er færdig' };
  }
  const saved = [];
  for (const p of photos) saved.push({ role: p.role, id: await savePhoto(p.dataUrl, 'proof') });
  const now = Date.now();
  const sub = {
    id: uid('s'), childId, toyId, activityId, cat: act.cat, kind: act.kind, via: via || act.kind, status: 'pending',
    createdAt: now, day: dayKey(now), xp: act.xp, toyLevel: levelInfo(toy.xp).level, photos: saved, seen: true,
  };
  S.submissions.push(sub);
  save();
  return { ok: true, sub };
}

export function decideSubmission(id, approve, note = '') {
  const sub = S.submissions.find((s) => s.id === id);
  if (!sub || sub.status !== 'pending') return { ok: false, reason: 'Allerede afgjort' };
  sub.status = approve ? 'approved' : 'rejected';
  sub.decidedAt = Date.now();
  sub.note = String(note || '').slice(0, 140);
  sub.seen = false;
  let res = { gained: 0, levelUps: [] };
  if (approve) {
    const act = activityById(sub.activityId);
    const isTraining = sub.cat === 'bevaegelse';
    res = grantXp({
      childId: sub.childId, toyId: sub.toyId, amount: sub.xp, source: isTraining ? 'training' : 'task', ref: sub.id,
      stat: isTraining ? act?.stat || null : null,
    });
    sub.xpGiven = res.gained;
    checkAchievements(sub.childId);
  }
  save();
  return { ok: true, sub, ...res };
}

export function markSubmissionSeen(id) {
  const sub = S.submissions.find((s) => s.id === id);
  if (sub && !sub.seen) {
    sub.seen = true;
    save();
  }
}

// ---------- Pleje ----------

export function doCare({ childId, toyId, actionId }) {
  const toy = toyById(toyId);
  const act = CARE.find((a) => a.id === actionId);
  if (!toy || !act || toy.childId !== childId) return { ok: false, reason: 'Det kan du ikke lige nu' };
  const now = Date.now();
  const left = careCooldownLeft(toy, actionId, now);
  if (left > 0) return { ok: false, reason: `${toy.name} har lige fået det. Prøv igen om ${fmtDuration(left)}` };
  toy.care = applyCare(toy, actionId, now);
  const entry = { id: uid('k'), ts: now, day: dayKey(now), childId, toyId, action: actionId };
  S.careLog.push(entry);
  const used = xpTodayBySource(S, childId, 'care', entry.day, toyId);
  const xp = Math.min(act.xp, Math.max(0, S.settings.careXpCap - used));
  const res = xp > 0 ? grantXp({ childId, toyId, amount: xp, source: 'care', ref: entry.id }) : { gained: 0, levelUps: [] };
  checkAchievements(childId);
  save();
  return { ok: true, msg: act.msg, anim: act.anim, ...res };
}

// ---------- Kampe ----------

export const battleById = (id) => S.battles.find((b) => b.id === id) || null;

export function openChallengesFrom(childId) {
  return S.battles.filter((b) => b.status === 'pending' && b.challengerId === childId);
}

export function createChallenge({ challengerId, toyId, opponentId, moves }) {
  if (challengerId === opponentId) return { ok: false, reason: 'Du kan ikke udfordre dig selv' };
  const opp = childById(opponentId);
  if (!opp || opp.archived) return { ok: false, reason: 'Vælg en modstander' };
  const toy = toyById(toyId);
  if (!toy || toy.childId !== challengerId || toy.deleted) return { ok: false, reason: 'Vælg dit legetøj' };
  const allowed = checkBattleAllowed(S, challengerId, toyId, dayKey());
  if (!allowed.ok) return allowed;
  const bad = validateMoves(moves, levelInfo(toy.xp).level);
  if (bad) return { ok: false, reason: bad };
  if (openChallengesFrom(challengerId).length >= S.settings.maxOpenChallenges) {
    return { ok: false, reason: `Du har allerede ${S.settings.maxOpenChallenges} udfordringer, der venter på svar` };
  }
  const b = {
    id: uid('b'), status: 'pending', createdAt: Date.now(), challengerId, challengerToyId: toyId,
    challengerMoves: moves.slice(), opponentId, opponentToyId: null, opponentMoves: null, seed: randomSeed(),
    day: null, result: null, seen: {},
  };
  S.battles.push(b);
  save();
  return { ok: true, battle: b };
}

export function declineChallenge(id, childId) {
  const b = battleById(id);
  if (!b || b.status !== 'pending' || b.opponentId !== childId) return { ok: false, reason: 'Udfordringen findes ikke længere' };
  b.status = 'declined';
  b.decidedAt = Date.now();
  b.seen = { [b.challengerId]: false, [childId]: true };
  save();
  return { ok: true };
}

export function cancelChallenge(id, childId) {
  const b = battleById(id);
  if (!b || b.status !== 'pending' || b.challengerId !== childId) return { ok: false, reason: 'Udfordringen findes ikke længere' };
  b.status = 'cancelled';
  b.decidedAt = Date.now();
  save();
  return { ok: true };
}

export function acceptChallenge(id, { childId, toyId, moves }) {
  const b = battleById(id);
  if (!b || b.status !== 'pending' || b.opponentId !== childId) return { ok: false, reason: 'Udfordringen findes ikke længere' };
  const day = dayKey();
  const toyB = toyById(toyId);
  if (!toyB || toyB.childId !== childId || toyB.deleted) return { ok: false, reason: 'Vælg dit legetøj' };
  const okB = checkBattleAllowed(S, childId, toyId, day);
  if (!okB.ok) return okB;
  const toyA = toyById(b.challengerToyId);
  const okA = toyA && !toyA.deleted ? checkBattleAllowed(S, b.challengerId, toyA.id, day) : { ok: false };
  if (!okA.ok) {
    b.status = 'expired';
    b.decidedAt = Date.now();
    b.note = 'Udfordrerens legetøj kunne ikke kæmpe mere i dag';
    save();
    return { ok: false, reason: 'Udfordrerens legetøj har kæmpet nok i dag. Udfordringen er lukket.' };
  }
  const bad = validateMoves(moves, levelInfo(toyB.xp).level);
  if (bad) return { ok: false, reason: bad };

  const now = Date.now();
  const a = battleSnapshot(toyA, b.challengerMoves, now);
  const bb = battleSnapshot(toyB, moves, now);
  const result = resolveBattle(a, bb, b.seed);
  b.status = 'done';
  b.completedAt = now;
  b.day = day;
  b.opponentToyId = toyId;
  b.opponentMoves = moves.slice();
  b.snap = { a, b: bb };
  b.result = result;
  b.seen = { [b.challengerId]: false, [childId]: true };

  const s = S.settings;
  const xpFor = (side) => (result.winner === 'draw' ? s.xpDraw : result.winner === side ? s.xpWin : s.xpLoss);
  const give = (cId, tId, side) => {
    const used = xpTodayBySource(S, cId, 'battle', day);
    const want = xpFor(side);
    const amount = Math.max(0, Math.min(want, s.battleXpCap - used));
    const res = amount > 0 ? grantXp({ childId: cId, toyId: tId, amount, source: 'battle', ref: b.id }) : { gained: 0, levelUps: [] };
    return { gained: res.gained, capped: amount < want, levelUps: res.levelUps };
  };
  const ra = give(b.challengerId, toyA.id, 'a');
  const rb = give(childId, toyB.id, 'b');
  b.xp = { a: ra.gained, b: rb.gained, cappedA: ra.capped, cappedB: rb.capped };
  b.levelUps = { a: ra.levelUps[0] || null, b: rb.levelUps[0] || null };

  for (const [toy, side] of [
    [toyA, 'a'],
    [toyB, 'b'],
  ]) {
    toy.record = toy.record || { battles: 0, wins: 0, losses: 0, draws: 0 };
    toy.record.battles++;
    if (result.winner === 'draw') toy.record.draws++;
    else if (result.winner === side) toy.record.wins++;
    else toy.record.losses++;
    // En kamp er hårdt arbejde, men vinderen bliver glad
    const c = careNow(toy, now);
    toy.care = {
      ...(toy.care || {}),
      energi: clamp(c.energi - 10, 30, 100),
      glaede: clamp(c.glaede + (result.winner === side ? 8 : 0), 30, 100),
      at: now,
    };
  }
  checkAchievements(b.challengerId);
  checkAchievements(childId);
  save();
  return { ok: true, battle: b };
}

export function markBattleSeen(id, childId) {
  const b = battleById(id);
  if (b && b.seen && b.seen[childId] === false) {
    b.seen[childId] = true;
    save();
  }
}

// ---------- Missioner ----------

export function claimMission(childId, missionId, toyId) {
  const day = dayKey();
  const m = dailyMissions(S, childId, day).find((x) => x.id === missionId);
  if (!m) return { ok: false, reason: 'Missionen findes ikke i dag' };
  if (isMissionClaimed(S, childId, day, missionId)) return { ok: false, reason: 'Belønningen er allerede hentet' };
  if (missionProgress(S, childId, day, m, { approvedOnly: true }) < m.target) {
    const waiting = missionProgress(S, childId, day, m) >= m.target;
    return { ok: false, reason: waiting ? 'En voksen skal godkende opgaven først' : 'Missionen er ikke klaret endnu' };
  }
  const toy = toyById(toyId);
  if (!toy || toy.childId !== childId) return { ok: false, reason: 'Vælg et legetøj til belønningen' };
  S.missionClaims[day] = S.missionClaims[day] || {};
  S.missionClaims[day][childId] = [...(S.missionClaims[day][childId] || []), missionId];
  const res = grantXp({ childId, toyId, amount: m.xp, source: 'mission', ref: `${day}:${missionId}` });
  checkAchievements(childId);
  save();
  return { ok: true, mission: m, ...res };
}

// ---------- Pokaler ----------

export function checkAchievements(childId) {
  if (!childId) return [];
  const fresh = newAchievements(S, childId);
  if (!fresh.length) return [];
  S.achievements[childId] = S.achievements[childId] || {};
  for (const a of fresh) {
    S.achievements[childId][a.id] = Date.now();
    bus.emit('achievement', { childId, ach: a });
  }
  return fresh;
}

// ---------- Forældre ----------

export function updateSettings(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 0 && n <= 10000) S.settings[k] = n;
  }
  save();
}

const VOICE_IDS = ['da-DK-ChristelNeural', 'da-DK-JeppeNeural'];

export function updateVoice(patch) {
  const cur = { on: true, name: VOICE_IDS[0], rate: 'normal', ...(S.settings.voice || {}) };
  if (patch.on != null) cur.on = !!patch.on;
  if (VOICE_IDS.includes(patch.name)) cur.name = patch.name;
  if (patch.rate === 'slow' || patch.rate === 'normal') cur.rate = patch.rate;
  S.settings.voice = cur;
  save();
  return cur;
}

export function updateActivity(id, patch) {
  const a = activityById(id);
  if (!a) return { ok: false };
  if (patch.title != null && String(patch.title).trim()) a.title = String(patch.title).trim().slice(0, 60);
  if (patch.xp != null) {
    const n = Math.round(Number(patch.xp));
    if (Number.isFinite(n) && n >= 0 && n <= 1000) a.xp = n;
  }
  if (patch.limitCount != null) {
    const n = Math.round(Number(patch.limitCount));
    a.limit = { per: patch.limitPer === 'week' ? 'week' : 'day', count: Number.isFinite(n) && n > 0 ? Math.min(n, 50) : null };
  }
  if (patch.active != null) a.active = !!patch.active;
  save();
  return { ok: true, activity: a };
}

export function addActivity({ title, cat, kind, xp, limitCount, limitPer }) {
  const t = String(title || '').trim().slice(0, 60);
  if (!t) return { ok: false, reason: 'Skriv en titel' };
  const a = {
    id: uid('a'), title: t, cat: cat || 'hjaelp', kind: kind === 'photo' ? 'photo' : 'adult',
    xp: clamp(Math.round(Number(xp) || 20), 0, 1000), stat: cat === 'bevaegelse' ? 'alle' : undefined,
    limit: { per: limitPer === 'week' ? 'week' : 'day', count: Math.max(1, Math.round(Number(limitCount) || 1)) },
    desc: '', icon: 'star', active: true, builtin: false,
  };
  S.activities.push(a);
  save();
  return { ok: true, activity: a };
}

export function removeActivity(id) {
  const a = activityById(id);
  if (!a || a.builtin) return { ok: false, reason: 'Indbyggede opgaver kan kun slås fra' };
  S.activities = S.activities.filter((x) => x.id !== id);
  save();
  return { ok: true };
}

export function adjustXp(toyId, amount, note) {
  const toy = toyById(toyId);
  if (!toy) return { ok: false };
  const n = Math.round(Number(amount));
  if (!Number.isFinite(n) || n === 0) return { ok: false, reason: 'Skriv et tal' };
  const res = grantXp({ childId: toy.childId, toyId, amount: n, source: 'adjust', note: note || 'Rettet af en voksen' });
  save();
  return { ok: true, ...res };
}

// ---------- Oprydning ----------

export function cleanup() {
  if (!S) return;
  const now = Date.now();
  let changed = false;
  const maxAge = (S.settings.challengeHours || 48) * 3600000;
  for (const b of S.battles) {
    if (b.status === 'pending' && now - b.createdAt > maxAge) {
      b.status = 'expired';
      b.decidedAt = now;
      b.seen = { [b.challengerId]: false };
      changed = true;
    }
  }
  const photoMax = (S.settings.proofPhotoDays || 14) * 86400000;
  for (const sub of S.submissions) {
    if (sub.status !== 'pending' && sub.photos?.length && !sub.photosDeleted && now - (sub.decidedAt || sub.createdAt) > photoMax) {
      for (const p of sub.photos) removePhoto(p.id);
      sub.photosDeleted = true;
      changed = true;
    }
  }
  // Hold loggen i en fornuftig størrelse
  const keepLog = 4000;
  if (S.careLog.length > keepLog) {
    S.careLog = S.careLog.slice(-keepLog);
    changed = true;
  }
  if (changed) save();
}

// ---------- Backup ----------

export async function exportBackup() {
  await flushSave();
  const photos = {};
  for (const id of await store.allPhotoIds()) {
    const url = await store.getPhoto(id);
    if (url) photos[id] = url;
  }
  return JSON.stringify({ app: 'legetoejsligaen', v: STATE_VERSION, exportedAt: Date.now(), state: S, photos });
}

export async function importBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'Filen kunne ikke læses' };
  }
  if (!data || data.app !== 'legetoejsligaen' || !data.state) return { ok: false, reason: 'Det er ikke en backup fra LegetøjsLigaen' };
  await store.clearAll();
  photoCache.clear();
  for (const [id, url] of Object.entries(data.photos || {})) await store.putPhoto(id, url);
  S = migrate(data.state);
  savePending = true;
  await flushSave();
  bus.emit('changed');
  return { ok: true };
}

export async function resetAll() {
  await store.clearAll();
  photoCache.clear();
  S = defaultState();
  savePending = true;
  await flushSave();
  bus.emit('changed');
}

export function replaceState(next) {
  S = next;
  save();
}
