// Spillets regler som rene funktioner (ingen skærm, ingen lagring).
// De samme regler kan senere køre på serveren, når MongoDB kommer på.

import { CLASSES, TIERS, CARE, MISSIONS, ACHIEVEMENTS, DIFFICULTY } from './catalog.js';
import { clamp, dayKey, weekKey, hashStr, mulberry32 } from './util.js';

export const MAX_LEVEL = 25;

// XP til næste level = 60 + (level - 1) × 20
export function xpToNext(level) {
  return level >= MAX_LEVEL ? 0 : 60 + (level - 1) * 20;
}

export function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < Math.min(level, MAX_LEVEL); l++) total += xpToNext(l);
  return total;
}

export function levelInfo(xp = 0) {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const isMax = level >= MAX_LEVEL;
  const need = xpToNext(level);
  return { level, into: isMax ? 0 : rest, need, pct: isMax ? 1 : rest / need, isMax, total: Math.max(0, Math.floor(xp)) };
}

export function tierFor(level) {
  let t = TIERS[0];
  for (const x of TIERS) if (level >= x.from) t = x;
  return t;
}

export function nextTier(level) {
  return TIERS.find((t) => t.from > level) || null;
}

export const SPECIAL_LEVEL = 5;
export const specialUnlocked = (level) => level >= SPECIAL_LEVEL;
// Specialangrebet bliver 10 % stærkere ved level 10, 15, 20 og 25.
export const specialPower = (level) => 1 + 0.1 * Math.max(0, Math.floor(level / 5) - 1);

const BASE_STATS = {
  staerk: { sty: 12, for: 8, hur: 8 },
  hurtig: { sty: 8, for: 8, hur: 12 },
  forsvarer: { sty: 8, for: 12, hur: 8 },
};

export function toyStats(toy) {
  const { level } = levelInfo(toy.xp || 0);
  const cls = CLASSES[toy.cls] ? toy.cls : 'staerk';
  const main = CLASSES[cls].main;
  const out = {};
  for (const k of ['sty', 'for', 'hur']) {
    const growth = (level - 1) * (k === main ? 2 : 1);
    const bonus = trainingBonus(toy, k);
    out[k] = BASE_STATS[cls][k] + growth + bonus;
  }
  return out;
}

// Træning giver en ekstra bonus i den evne, der trænes: +1 pr. 100 trænings-XP, højst +15.
export function trainingBonus(toy, stat) {
  return Math.min(15, Math.floor(((toy.statXp || {})[stat] || 0) / 100));
}

// ---------- Pleje ----------

export const CARE_FLOOR = 30;
const DECAY = { energi: 2, glaede: 1.5 }; // point i timen, men aldrig under CARE_FLOOR

export function careNow(toy, now = Date.now()) {
  const c = toy.care || { energi: 80, glaede: 80, at: now };
  const hours = Math.max(0, (now - (c.at || now)) / 3600000);
  const decay = (v, rate) => (v <= CARE_FLOOR ? v : Math.max(CARE_FLOOR, v - rate * hours));
  return {
    energi: Math.round(decay(c.energi ?? 80, DECAY.energi)),
    glaede: Math.round(decay(c.glaede ?? 80, DECAY.glaede)),
  };
}

export function formFactor(care) {
  const avg = (care.energi + care.glaede) / 2;
  return 0.95 + (clamp(avg, 0, 100) / 100) * 0.1; // 0,95 – 1,05
}

export function moodLabel(care) {
  const avg = (care.energi + care.glaede) / 2;
  if (avg >= 80) return 'Glad og frisk';
  if (avg >= 55) return 'I fin form';
  return 'Savner dig lidt';
}

export function careCooldownLeft(toy, actionId, now = Date.now()) {
  const act = CARE.find((a) => a.id === actionId);
  const last = toy.care?.last?.[actionId];
  if (!act || !last) return 0;
  return Math.max(0, last + act.cooldownMin * 60000 - now);
}

export function applyCare(toy, actionId, now = Date.now()) {
  const act = CARE.find((a) => a.id === actionId);
  const cur = careNow(toy, now);
  return {
    energi: clamp(cur.energi + act.energi, CARE_FLOOR, 100),
    glaede: clamp(cur.glaede + act.glaede, CARE_FLOOR, 100),
    at: now,
    last: { ...(toy.care?.last || {}), [actionId]: now },
  };
}

// ---------- Kampe ----------

export const BASE_DAMAGE = 26;
const RATIO_EXP = 0.4;
const RATIO_MIN = 0.7;
const RATIO_MAX = 1.45;
const DODGE_DIV = 90;
const DODGE_MAX = 0.2;
const CRIT_BASE = 0.06;
const CRIT_DIV = 60;
const CRIT_MAX = 0.3;

// [skade A giver B, skade B giver A] når A vælger rækken og B vælger kolonnen
const MATRIX = {
  angreb: { angreb: [1.0, 1.0], forsvar: [0.25, 0.6], finte: [1.3, 0] },
  forsvar: { angreb: [0.6, 0.25], forsvar: [0, 0], finte: [0, 1.1] },
  finte: { angreb: [0, 1.3], forsvar: [1.1, 0], finte: [0.5, 0.5] },
};

// Specialangreb pr. klasse: [min skade, modstanderens skade] mod modstanderens træk
const SUPER = {
  staerk: { angreb: [1.5, 0.8], forsvar: [1.2, 0.2], finte: [0.8, 0.3] },
  hurtig: { angreb: [1.3, 0.4], forsvar: [0.6, 0.4], finte: [1.4, 0] },
  forsvarer: { angreb: [0.9, 0], forsvar: [0.3, 0], finte: [0.6, 0.3] },
};

export function movePair(mA, mB, clsA, clsB) {
  if (mA === 'super' && mB === 'super') return [1.2, 1.2];
  if (mA === 'super') return SUPER[clsA][mB];
  if (mB === 'super') {
    const [b, a] = SUPER[clsB][mA];
    return [a, b];
  }
  return MATRIX[mA][mB];
}

export function validateMoves(moves, level) {
  if (!Array.isArray(moves) || moves.length !== 3) return 'Vælg tre træk';
  const ok = ['angreb', 'forsvar', 'finte', 'super'];
  if (moves.some((m) => !ok.includes(m))) return 'Ukendt træk';
  const supers = moves.filter((m) => m === 'super').length;
  if (supers > 1) return 'Specialangrebet kan kun bruges én gang pr. kamp';
  if (supers === 1 && !specialUnlocked(level)) return `Specialangrebet låses op på level ${SPECIAL_LEVEL}`;
  return null;
}

export function battleSnapshot(toy, moves, now = Date.now()) {
  const info = levelInfo(toy.xp || 0);
  const care = careNow(toy, now);
  return {
    toyId: toy.id,
    name: toy.name,
    photoId: toy.photoId || null,
    type: toy.type,
    cls: CLASSES[toy.cls] ? toy.cls : 'staerk',
    level: info.level,
    stats: toyStats(toy),
    form: Number(formFactor(care).toFixed(3)),
    power: specialPower(info.level),
    moves: moves.slice(),
  };
}

export function resolveBattle(a, b, seed) {
  const rnd = mulberry32(seed);
  let hpA = 100;
  let hpB = 100;
  const rounds = [];
  // Styrke mod forsvar bestemmer skaden. Hurtighed giver fuldtræffere og chance for at undvige.
  const strike = (att, def, mult) => {
    if (mult <= 0) return null;
    const ratio = clamp(Math.pow(att.stats.sty / Math.max(1, def.stats.for), RATIO_EXP), RATIO_MIN, RATIO_MAX);
    const dodgeChance = clamp((def.stats.hur - att.stats.hur) / DODGE_DIV, 0, DODGE_MAX);
    const critChance = clamp(CRIT_BASE + (att.stats.hur - def.stats.hur) / CRIT_DIV, 0.03, CRIT_MAX);
    const r1 = rnd();
    const r2 = rnd();
    const r3 = rnd();
    if (r1 < dodgeChance) return { dmg: 0, crit: false, dodged: true };
    const crit = r2 < critChance;
    const variance = 0.85 + r3 * 0.3;
    const dmg = Math.max(1, Math.round(BASE_DAMAGE * mult * ratio * att.form * variance * (crit ? 1.5 : 1)));
    return { dmg, crit, dodged: false };
  };
  for (let i = 0; i < 3; i++) {
    const mA = a.moves[i];
    const mB = b.moves[i];
    let [multA, multB] = movePair(mA, mB, a.cls, b.cls);
    if (mA === 'super') multA *= a.power;
    if (mB === 'super') multB *= b.power;
    const speedA = a.stats.hur * (0.9 + rnd() * 0.2) + (mA === 'super' && a.cls === 'hurtig' ? 1000 : 0);
    const speedB = b.stats.hur * (0.9 + rnd() * 0.2) + (mB === 'super' && b.cls === 'hurtig' ? 1000 : 0);
    const hitA = strike(a, b, multA);
    const hitB = strike(b, a, multB);
    const order = speedA >= speedB ? ['a', 'b'] : ['b', 'a'];
    const hits = [];
    for (const who of order) {
      if (hpA <= 0 || hpB <= 0) break;
      const h = who === 'a' ? hitA : hitB;
      if (!h) continue;
      if (who === 'a') hpB = Math.max(0, hpB - h.dmg);
      else hpA = Math.max(0, hpA - h.dmg);
      hits.push({ by: who, dmg: h.dmg, crit: h.crit, dodged: h.dodged });
    }
    rounds.push({ round: i + 1, mA, mB, hits, hpA, hpB });
    if (hpA <= 0 || hpB <= 0) break;
  }
  const winner = hpA === hpB ? 'draw' : hpA > hpB ? 'a' : 'b';
  return { rounds, hpA, hpB, winner, ko: hpA <= 0 || hpB <= 0 };
}

export function battleCounts(state, day) {
  const perToy = {};
  const perChild = {};
  for (const b of state.battles) {
    if (b.status !== 'done' || b.day !== day) continue;
    for (const [c, t] of [
      [b.challengerId, b.challengerToyId],
      [b.opponentId, b.opponentToyId],
    ]) {
      perToy[t] = (perToy[t] || 0) + 1;
      perChild[c] = (perChild[c] || 0) + 1;
    }
  }
  return { perToy, perChild };
}

export function xpTodayBySource(state, childId, source, day, toyId = null) {
  let n = 0;
  for (const e of state.xpLog) {
    if (e.childId === childId && e.source === source && e.day === day && (!toyId || e.toyId === toyId)) n += e.amount;
  }
  return n;
}

export function checkBattleAllowed(state, childId, toyId, day) {
  const s = state.settings;
  const toy = state.toys.find((t) => t.id === toyId && !t.deleted);
  if (!toy || toy.childId !== childId) return { ok: false, reason: 'Legetøjet findes ikke.' };
  const { perToy, perChild } = battleCounts(state, day);
  const toyUsed = perToy[toyId] || 0;
  const childUsed = perChild[childId] || 0;
  if (childUsed >= s.battlesPerChild) {
    return { ok: false, reason: `Du har kæmpet ${s.battlesPerChild} kampe i dag. Der kommer nye kampe i morgen!`, toyLeft: 0, childLeft: 0 };
  }
  if (toyUsed >= s.battlesPerToy) {
    return { ok: false, reason: `${toy.name} har kæmpet ${s.battlesPerToy} gange i dag og skal hvile. Vælg et andet legetøj.`, toyLeft: 0, childLeft: s.battlesPerChild - childUsed };
  }
  return { ok: true, toyLeft: s.battlesPerToy - toyUsed, childLeft: s.battlesPerChild - childUsed };
}

// ---------- Aktiviteter og grænser ----------

export function scaledTarget(act, difficulty = 'normal') {
  if (!act.cam) return null;
  const f = (DIFFICULTY[difficulty] || DIFFICULTY.normal).factor;
  const t = Math.round(act.cam.target * f);
  return Math.max(act.cam.unit === 'sec' ? 5 : 3, t);
}

export function activityUsage(state, childId, act, now = Date.now()) {
  const per = act.limit?.per === 'week' ? 'week' : 'day';
  const count = act.limit?.count ?? null;
  const key = per === 'week' ? weekKey(now) : dayKey(now);
  let used = 0;
  for (const s of state.submissions) {
    if (s.childId !== childId || s.activityId !== act.id || s.status === 'rejected') continue;
    const k = per === 'week' ? weekKey(s.createdAt) : dayKey(s.createdAt);
    if (k === key) used++;
  }
  const left = count == null || count <= 0 ? Infinity : Math.max(0, count - used);
  return { used, count, per, left, ok: left > 0 };
}

export function limitText(u) {
  if (u.count == null || u.count <= 0) return 'Ingen grænse';
  const per = u.per === 'week' ? 'denne uge' : 'i dag';
  return `${Math.min(u.used, u.count)}/${u.count} ${per}`;
}

// ---------- Missioner ----------

export function missionContext(state, childId) {
  const toys = state.toys.filter((t) => t.childId === childId && !t.deleted);
  return {
    toys: toys.length,
    lowToy: toys.some((t) => levelInfo(t.xp).level < 5),
    twoToys: toys.length >= 2,
    opponent: state.children.some((c) => c.id !== childId && !c.archived),
  };
}

export function dailyMissions(state, childId, day = dayKey()) {
  const ctx = missionContext(state, childId);
  const pool = MISSIONS.filter((m) => !m.requires || ctx[m.requires]);
  const rnd = mulberry32(hashStr(`${childId}|${day}`));
  const picked = [];
  for (const g of ['move', 'task', 'play']) {
    const opts = pool.filter((m) => m.group === g);
    if (opts.length) picked.push(opts[Math.floor(rnd() * opts.length)]);
  }
  return picked;
}

// approvedOnly: tæl kun opgaver, en voksen har godkendt (bruges før belønningen kan hentes)
export function missionProgress(state, childId, day, mission, { approvedOnly = false } = {}) {
  const subs = state.submissions.filter(
    (s) => s.childId === childId && s.day === day && (approvedOnly ? s.status === 'approved' : s.status !== 'rejected'),
  );
  const isTraining = (s) => s.cat === 'bevaegelse';
  const [metric, arg] = mission.metric.split(':');
  switch (metric) {
    case 'trainings':
      return subs.filter(isTraining).length;
    case 'cameraTrainings':
      return subs.filter((s) => s.via === 'camera').length;
    case 'reps':
      return subs.filter((s) => s.activityId === arg && s.via === 'camera').reduce((n, s) => n + (s.reps || 0), 0);
    case 'trainLow':
      return subs.filter((s) => isTraining(s) && (s.toyLevel || 1) < 5).length;
    case 'task':
      return subs.filter((s) => s.activityId === arg).length;
    case 'cat':
      return subs.filter((s) => s.cat === arg).length;
    case 'tasks':
      return subs.filter((s) => !isTraining(s)).length;
    case 'careActions':
      return state.careLog.filter((c) => c.childId === childId && c.day === day).length;
    case 'caredToys':
      return new Set(state.careLog.filter((c) => c.childId === childId && c.day === day).map((c) => c.toyId)).size;
    case 'battles':
      return state.battles.filter((b) => b.status === 'done' && b.day === day && (b.challengerId === childId || b.opponentId === childId)).length;
    default:
      return 0;
  }
}

export function isMissionClaimed(state, childId, day, missionId) {
  return !!state.missionClaims?.[day]?.[childId]?.includes(missionId);
}

// ---------- Pokaler ----------

export function achievementContext(state, childId) {
  const toys = state.toys.filter((t) => t.childId === childId && !t.deleted);
  const approved = state.submissions.filter((s) => s.childId === childId && s.status === 'approved');
  const reps = {};
  const cats = {};
  for (const s of approved) {
    cats[s.cat] = (cats[s.cat] || 0) + 1;
    if (s.via === 'camera' && s.reps) reps[s.activityId] = (reps[s.activityId] || 0) + s.reps;
  }
  const battles = state.battles.filter((b) => b.status === 'done' && (b.challengerId === childId || b.opponentId === childId));
  const wins = battles.filter(
    (b) => (b.challengerId === childId && b.result.winner === 'a') || (b.opponentId === childId && b.result.winner === 'b'),
  ).length;
  let missions = 0;
  for (const d of Object.values(state.missionClaims || {})) missions += (d[childId] || []).length;
  return {
    toys: toys.length,
    maxLevel: toys.reduce((m, t) => Math.max(m, levelInfo(t.xp).level), 0),
    trainings: approved.filter((s) => s.cat === 'bevaegelse').length,
    reps,
    cats,
    battles: battles.length,
    wins,
    care: state.careLog.filter((c) => c.childId === childId).length,
    missions,
  };
}

export function newAchievements(state, childId) {
  const ctx = achievementContext(state, childId);
  const got = state.achievements?.[childId] || {};
  return ACHIEVEMENTS.filter((a) => !got[a.id] && a.check(ctx));
}

export function personalRecords(state, childId) {
  const ctx = achievementContext(state, childId);
  return ctx;
}
