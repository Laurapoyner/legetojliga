// Gennemspiller hele forløb: familie, legetøj, træning, opgaver, kampe og missioner.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../js/actions.js';
import { levelInfo, dailyMissions } from '../js/rules.js';
import { dayKey } from '../js/util.js';

async function fresh() {
  await A.loadGame();
  await A.resetAll();
  await A.setupFamily({ pin: '2468', children: [{ name: 'Ida' }, { name: 'Malte' }] });
  const [ida, malte] = A.S.children;
  const bamse = (await A.createToy({ childId: ida.id, name: 'Bamse Bo', type: 'bamse', cls: 'staerk' })).toy;
  const dino = (await A.createToy({ childId: malte.id, name: 'Dino Dan', type: 'dino', cls: 'hurtig' })).toy;
  return { ida, malte, bamse, dino };
}

test('PIN tjekkes', async () => {
  await fresh();
  assert.equal(await A.checkPin('2468'), true);
  assert.equal(await A.checkPin('0000'), false);
});

test('kameratræning giver XP én gang og respekterer grænsen', async () => {
  const { ida, bamse } = await fresh();
  const r1 = A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 15 });
  assert.equal(r1.ok, true);
  assert.equal(A.toyById(bamse.id).xp, 30);
  const tooFew = A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 3 });
  assert.equal(tooFew.ok, false);
  A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 15 });
  A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 15 });
  const fourth = A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 15 });
  assert.equal(fourth.ok, false, 'højst 3 gange om dagen');
  assert.equal(A.toyById(bamse.id).xp, 90);
  assert.equal(levelInfo(90).level, 2);
  assert.ok(A.toyById(bamse.id).statXp.hur >= 90, 'sprællemænd træner hurtighed');
});

test('fotoopgave kræver billede, venter på godkendelse og giver XP én gang', async () => {
  const { ida, bamse } = await fresh();
  const noPhoto = await A.submitActivity({ childId: ida.id, toyId: bamse.id, activityId: 'skrivebord', photos: [] });
  assert.equal(noPhoto.ok, false);
  const r = await A.submitActivity({
    childId: ida.id, toyId: bamse.id, activityId: 'skrivebord',
    photos: [{ role: 'efter', dataUrl: 'data:image/jpeg;base64,AAAA' }],
  });
  assert.equal(r.ok, true);
  assert.equal(A.toyById(bamse.id).xp, 0, 'ingen XP før godkendelse');
  const again = await A.submitActivity({ childId: ida.id, toyId: bamse.id, activityId: 'skrivebord', photos: [{ role: 'efter', dataUrl: 'data:,x' }] });
  assert.equal(again.ok, false, 'én oprydningsbonus om dagen');
  const d1 = A.decideSubmission(r.sub.id, true);
  assert.equal(d1.ok, true);
  assert.equal(A.toyById(bamse.id).xp, 45);
  const d2 = A.decideSubmission(r.sub.id, true);
  assert.equal(d2.ok, false, 'kan ikke godkendes to gange');
  assert.equal(A.toyById(bamse.id).xp, 45);
});

test('afvist opgave giver ingen XP og kan prøves igen', async () => {
  const { ida, bamse } = await fresh();
  const r = await A.submitActivity({ childId: ida.id, toyId: bamse.id, activityId: 'daek', photos: [] });
  assert.equal(r.ok, true);
  A.decideSubmission(r.sub.id, false, 'Glemte glassene');
  assert.equal(A.toyById(bamse.id).xp, 0);
  const r2 = await A.submitActivity({ childId: ida.id, toyId: bamse.id, activityId: 'daek', photos: [] });
  assert.equal(r2.ok, true);
});

test('kamp: udfordring, svar, XP og dagsgrænser', async () => {
  const { ida, malte, bamse, dino } = await fresh();
  assert.equal(A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: ida.id, moves: ['angreb', 'angreb', 'angreb'] }).ok, false);
  assert.equal(A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: malte.id, moves: ['super', 'angreb', 'angreb'] }).ok, false, 'super kræver level 5');
  const c = A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: malte.id, moves: ['angreb', 'finte', 'forsvar'] });
  assert.equal(c.ok, true);
  assert.equal(A.acceptChallenge(c.battle.id, { childId: ida.id, toyId: bamse.id, moves: ['angreb', 'angreb', 'angreb'] }).ok, false, 'man kan ikke svare på sin egen');
  const r = A.acceptChallenge(c.battle.id, { childId: malte.id, toyId: dino.id, moves: ['forsvar', 'angreb', 'finte'] });
  assert.equal(r.ok, true);
  const b = r.battle;
  assert.equal(b.status, 'done');
  const total = b.xp.a + b.xp.b;
  assert.ok([32, 32, 32].includes(total) || total === 32, `vinder 20 + taber 12 eller 16 + 16, fik ${b.xp.a}+${b.xp.b}`);
  assert.equal(A.toyById(bamse.id).record.battles, 1);
  // To kampe mere med samme legetøj er ok, den fjerde er ikke
  for (let i = 0; i < 2; i++) {
    const cc = A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: malte.id, moves: ['angreb', 'angreb', 'angreb'] });
    assert.equal(cc.ok, true);
    assert.equal(A.acceptChallenge(cc.battle.id, { childId: malte.id, toyId: dino.id, moves: ['finte', 'finte', 'finte'] }).ok, true);
  }
  const fourth = A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: malte.id, moves: ['angreb', 'angreb', 'angreb'] });
  assert.equal(fourth.ok, false);
  assert.match(fourth.reason, /3 gange/);
});

test('kamp-XP stopper ved 100 om dagen', async () => {
  const { ida, malte } = await fresh();
  A.updateSettings({ battlesPerToy: 50, battlesPerChild: 50 });
  const t1 = A.toysOf(ida.id)[0];
  const t2 = A.toysOf(malte.id)[0];
  let idaXp = 0;
  for (let i = 0; i < 9; i++) {
    const c = A.createChallenge({ challengerId: ida.id, toyId: t1.id, opponentId: malte.id, moves: ['forsvar', 'forsvar', 'forsvar'] });
    const r = A.acceptChallenge(c.battle.id, { childId: malte.id, toyId: t2.id, moves: ['forsvar', 'forsvar', 'forsvar'] });
    idaXp += r.battle.xp.a;
  }
  assert.equal(idaXp, 100, 'uafgjort giver 16 XP, men højst 100 om dagen');
});

test('udfordringer der venter, aflyses når legetøjet slettes', async () => {
  const { ida, malte, bamse } = await fresh();
  const c = A.createChallenge({ challengerId: ida.id, toyId: bamse.id, opponentId: malte.id, moves: ['angreb', 'angreb', 'angreb'] });
  await A.deleteToy(bamse.id);
  assert.equal(A.battleById(c.battle.id).status, 'cancelled');
});

test('pleje giver lidt XP med loft og nedkøling', async () => {
  const { ida, bamse } = await fresh();
  const r = A.doCare({ childId: ida.id, toyId: bamse.id, actionId: 'mad' });
  assert.equal(r.ok, true);
  assert.equal(r.gained, 4);
  const again = A.doCare({ childId: ida.id, toyId: bamse.id, actionId: 'mad' });
  assert.equal(again.ok, false);
  for (const a of ['vand', 'sov', 'vask', 'leg', 'kram']) A.doCare({ childId: ida.id, toyId: bamse.id, actionId: a });
  const careXp = A.S.xpLog.filter((e) => e.source === 'care').reduce((n, e) => n + e.amount, 0);
  assert.equal(careXp, 15, 'højst 15 pleje-XP pr. legetøj om dagen');
});

test('missioner kan hentes når de er klaret', async () => {
  const { ida, bamse } = await fresh();
  const ms = dailyMissions(A.S, ida.id, dayKey());
  const care = ms.find((m) => m.metric === 'careActions');
  if (care) {
    assert.equal(A.claimMission(ida.id, care.id, bamse.id).ok, false);
    for (const a of ['mad', 'vand', 'kram']) A.doCare({ childId: ida.id, toyId: bamse.id, actionId: a });
    const r = A.claimMission(ida.id, care.id, bamse.id);
    assert.equal(r.ok, true);
    assert.equal(A.claimMission(ida.id, care.id, bamse.id).ok, false, 'kun én gang');
  }
});

test('level-up og pokaler sendes som begivenheder', async () => {
  const { ida, bamse } = await fresh();
  const events = [];
  const off1 = A.bus.on('levelup', (e) => events.push(['lvl', e.to]));
  const off2 = A.bus.on('achievement', (e) => events.push(['ach', e.ach.id]));
  A.completeCameraTraining({ childId: ida.id, toyId: bamse.id, activityId: 'sprael', reps: 15 });
  A.adjustXp(bamse.id, 400, 'test');
  off1();
  off2();
  assert.ok(events.some((e) => e[0] === 'ach' && e[1] === 'first_train'));
  assert.ok(events.some((e) => e[0] === 'lvl' && e[1] >= 4));
  assert.ok(events.some((e) => e[0] === 'ach' && e[1] === 'lvl5') || levelInfo(A.toyById(bamse.id).xp).level < 5);
});

test('backup kan gemmes og indlæses', async () => {
  const { ida } = await fresh();
  const text = await A.exportBackup();
  await A.resetAll();
  assert.equal(A.S.children.length, 0);
  const r = await A.importBackup(text);
  assert.equal(r.ok, true);
  assert.equal(A.S.children.length, 2);
  assert.equal(A.S.children[0].name, ida.name);
  assert.equal((await A.importBackup('{"hej":1}')).ok, false);
});
