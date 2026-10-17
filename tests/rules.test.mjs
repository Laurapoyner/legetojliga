import test from 'node:test';
import assert from 'node:assert/strict';
import {
  xpToNext, xpForLevel, levelInfo, toyStats, resolveBattle, battleSnapshot, validateMoves,
  checkBattleAllowed, activityUsage, dailyMissions, careNow, applyCare, CARE_FLOOR, scaledTarget,
} from '../js/rules.js';
import { ACTIVITIES } from '../js/catalog.js';
import { dayKey, weekKey } from '../js/util.js';

test('XP-formlen giver 6.960 XP fra level 1 til 25', () => {
  assert.equal(xpToNext(1), 60);
  assert.equal(xpToNext(10), 240);
  assert.equal(xpForLevel(25), 6960);
  assert.equal(xpForLevel(10), 1260);
  assert.equal(levelInfo(0).level, 1);
  assert.equal(levelInfo(59).level, 1);
  assert.equal(levelInfo(60).level, 2);
  assert.equal(levelInfo(6959).level, 24);
  assert.equal(levelInfo(6960).level, 25);
  assert.equal(levelInfo(99999).level, 25, 'level går aldrig over 25');
  assert.equal(levelInfo(99999).isMax, true);
});

test('stats vokser med level og træning', () => {
  const t1 = { cls: 'staerk', xp: 0 };
  assert.deepEqual(toyStats(t1), { sty: 12, for: 8, hur: 8 });
  const t25 = { cls: 'staerk', xp: 6960 };
  assert.deepEqual(toyStats(t25), { sty: 60, for: 32, hur: 32 });
  const trained = { cls: 'hurtig', xp: 0, statXp: { hur: 350, sty: 99999 } };
  const s = toyStats(trained);
  assert.equal(s.hur, 12 + 3);
  assert.equal(s.sty, 8 + 15, 'træningsbonus er højst +15');
});

const mk = (id, cls, xp) => ({ id, name: id, cls, xp, care: { energi: 100, glaede: 100, at: Date.now() } });

test('kampe er deterministiske og afspilles ens', () => {
  const a = battleSnapshot(mk('A', 'staerk', 500), ['angreb', 'finte', 'forsvar']);
  const b = battleSnapshot(mk('B', 'hurtig', 400), ['forsvar', 'angreb', 'finte']);
  const r1 = resolveBattle(a, b, 12345);
  const r2 = resolveBattle(a, b, 12345);
  assert.deepEqual(r1, r2);
  assert.ok(['a', 'b', 'draw'].includes(r1.winner));
  assert.ok(r1.rounds.length >= 1 && r1.rounds.length <= 3);
});

test('to forsvar giver ingen skade, tre gange forsvar giver uafgjort', () => {
  const a = battleSnapshot(mk('A', 'staerk', 0), ['forsvar', 'forsvar', 'forsvar']);
  const b = battleSnapshot(mk('B', 'staerk', 0), ['forsvar', 'forsvar', 'forsvar']);
  const r = resolveBattle(a, b, 1);
  assert.equal(r.hpA, 100);
  assert.equal(r.hpB, 100);
  assert.equal(r.winner, 'draw');
});

test('højt level giver en fordel men ikke garanteret sejr', () => {
  const moves = ['angreb', 'forsvar', 'finte'];
  let strongWins = 0;
  let weakWins = 0;
  const all = ['angreb', 'forsvar', 'finte'];
  let n = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = (k) => all[(seed * 7 + k * 13) % 3];
    const strong = battleSnapshot(mk('S', 'staerk', 6960), [rnd(1), rnd(2), rnd(3)]);
    const weak = battleSnapshot(mk('W', 'forsvarer', 0), [rnd(4), rnd(5), rnd(6)].map((m, i) => (seed % 2 ? moves[i] : m)));
    const r = resolveBattle(strong, weak, seed);
    if (r.winner === 'a') strongWins++;
    if (r.winner === 'b') weakWins++;
    n++;
  }
  assert.ok(strongWins > weakWins, `stærk ${strongWins} vs svag ${weakWins}`);
  assert.ok(weakWins > 0, 'den svage skal kunne vinde nogle gange');
});

test('træk valideres', () => {
  assert.equal(validateMoves(['angreb', 'forsvar', 'finte'], 1), null);
  assert.ok(validateMoves(['angreb', 'forsvar'], 1));
  assert.ok(validateMoves(['super', 'forsvar', 'finte'], 4));
  assert.equal(validateMoves(['super', 'forsvar', 'finte'], 5), null);
  assert.ok(validateMoves(['super', 'super', 'finte'], 10));
});

function baseState() {
  return {
    settings: { battlesPerToy: 3, battlesPerChild: 15, battleXpCap: 100 },
    children: [{ id: 'c1' }, { id: 'c2' }],
    toys: [
      { id: 't1', childId: 'c1', name: 'Bamse', xp: 0 },
      { id: 't2', childId: 'c2', name: 'Dino', xp: 0 },
      { id: 't3', childId: 'c1', name: 'Bil', xp: 0 },
    ],
    battles: [],
    submissions: [],
    xpLog: [],
    careLog: [],
    missionClaims: {},
  };
}

test('dagsgrænser: 3 kampe pr. legetøj og 15 pr. barn', () => {
  const s = baseState();
  const day = dayKey();
  assert.equal(checkBattleAllowed(s, 'c1', 't1', day).ok, true);
  for (let i = 0; i < 3; i++) {
    s.battles.push({ status: 'done', day, challengerId: 'c1', challengerToyId: 't1', opponentId: 'c2', opponentToyId: 't2' });
  }
  const r = checkBattleAllowed(s, 'c1', 't1', day);
  assert.equal(r.ok, false);
  assert.match(r.reason, /3 gange/);
  assert.equal(checkBattleAllowed(s, 'c1', 't3', day).ok, true);
  assert.equal(checkBattleAllowed(s, 'c1', 't2', day).ok, false, 'man kan ikke kæmpe med andres legetøj');
  s.settings.battlesPerChild = 3;
  assert.equal(checkBattleAllowed(s, 'c1', 't3', day).ok, false);
  // I går tæller ikke med
  const s2 = baseState();
  for (let i = 0; i < 3; i++) s2.battles.push({ status: 'done', day: '2020-01-01', challengerId: 'c1', challengerToyId: 't1', opponentId: 'c2', opponentToyId: 't2' });
  assert.equal(checkBattleAllowed(s2, 'c1', 't1', day).ok, true);
});

test('opgavegrænser pr. dag og uge', () => {
  const s = baseState();
  const act = ACTIVITIES.find((a) => a.id === 'vaerelse');
  assert.equal(activityUsage(s, 'c1', act).ok, true);
  s.submissions.push({ childId: 'c1', activityId: 'vaerelse', status: 'pending', createdAt: Date.now() });
  assert.equal(activityUsage(s, 'c1', act).ok, false);
  s.submissions[0].status = 'rejected';
  assert.equal(activityUsage(s, 'c1', act).ok, true, 'afviste tæller ikke');
  const weekly = ACTIVITIES.find((a) => a.id === 'stoevsug');
  s.submissions.push({ childId: 'c1', activityId: 'stoevsug', status: 'approved', createdAt: Date.now() });
  assert.equal(activityUsage(s, 'c1', weekly).left, 1);
});

test('dag og uge beregnes i dansk tid', () => {
  // 31. dec. 2025 kl. 23:30 UTC er 1. januar 2026 i Danmark
  assert.equal(dayKey(Date.UTC(2025, 11, 31, 23, 30)), '2026-01-01');
  assert.equal(dayKey(Date.UTC(2025, 11, 31, 22, 30)), '2025-12-31');
  assert.match(weekKey(Date.UTC(2026, 9, 17, 12)), /^2026-U42$/);
});

test('missioner er de samme hele dagen og passer til barnet', () => {
  const s = baseState();
  const m1 = dailyMissions(s, 'c1', '2026-10-17');
  const m2 = dailyMissions(s, 'c1', '2026-10-17');
  assert.deepEqual(m1.map((m) => m.id), m2.map((m) => m.id));
  assert.equal(m1.length, 3);
  const solo = { ...baseState(), children: [{ id: 'c1' }] };
  for (let d = 1; d <= 28; d++) {
    const ms = dailyMissions(solo, 'c1', `2026-02-${String(d).padStart(2, '0')}`);
    assert.ok(!ms.some((m) => m.id === 'battle1'), 'ingen kampmission uden modstander');
  }
});

test('pleje falder langsomt men aldrig under bunden', () => {
  const now = Date.now();
  const toy = { care: { energi: 100, glaede: 100, at: now - 100 * 3600000 } };
  const c = careNow(toy, now);
  assert.equal(c.energi, CARE_FLOOR);
  assert.equal(c.glaede, CARE_FLOOR);
  const after = applyCare(toy, 'mad', now);
  assert.equal(after.energi, CARE_FLOOR + 25);
});

test('sværhedsgrad skalerer kameraøvelser', () => {
  const sprael = ACTIVITIES.find((a) => a.id === 'sprael');
  assert.equal(scaledTarget(sprael, 'normal'), 15);
  assert.equal(scaledTarget(sprael, 'let'), 9);
  assert.equal(scaledTarget(sprael, 'svaer'), 21);
});

test('tal læses op som danske ord', async () => {
  const { numberWord } = await import('../js/voice.js');
  assert.equal(numberWord(1), 'en');
  assert.equal(numberWord(15), 'femten');
  assert.equal(numberWord(21), 'enogtyve');
  assert.equal(numberWord(50), 'halvtreds');
  assert.equal(numberWord(57), 'syvoghalvtreds');
});
