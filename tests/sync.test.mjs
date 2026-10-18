// Tester fletning af data mellem enheder og server-API'et (med en database i hukommelsen).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { makePatch, applyPatch, isEmptyPatch } from '../js/sync.js';
import { openMemory } from '../server/db.js';
import { createApi } from '../server/api.js';

const clone = (x) => JSON.parse(JSON.stringify(x));

function baseState() {
  return {
    v: 1,
    family: { salt: 's1', pinHash: createHash('sha256').update('s1:2468').digest('hex') },
    settings: { battlesPerToy: 3 },
    children: [{ id: 'c1', name: 'Ida' }, { id: 'c2', name: 'Malte' }],
    toys: [
      { id: 't1', childId: 'c1', name: 'Bamse', xp: 0, care: { energi: 80, glaede: 80, at: 1, last: {} } },
      { id: 't2', childId: 'c2', name: 'Dino', xp: 0, care: { energi: 80, glaede: 80, at: 1, last: {} } },
    ],
    activities: [{ id: 'sprael', stat: 'hur' }],
    submissions: [],
    xpLog: [],
    battles: [],
    careLog: [],
    missionClaims: {},
    achievements: {},
  };
}

test('XP fra to enheder samtidig lægges sammen', () => {
  const server = baseState();
  const devA = clone(server);
  const devB = clone(server);
  devA.xpLog.push({ id: 'x1', toyId: 't1', amount: 30, source: 'training', ref: 's1' });
  devA.submissions.push({ id: 's1', activityId: 'sprael', status: 'approved' });
  devA.toys[0].xp = 30;
  devB.xpLog.push({ id: 'x2', toyId: 't1', amount: 5, source: 'care', ref: 'k1' });
  devB.toys[0].xp = 5;
  applyPatch(server, makePatch(baseState(), devA));
  applyPatch(server, makePatch(baseState(), devB));
  assert.equal(server.toys[0].xp, 35);
  assert.equal(server.toys[0].statXp.hur, 30);
});

test('en godkendt opgave bliver ikke til "venter" igen', () => {
  const base = baseState();
  base.submissions.push({ id: 's1', status: 'pending', seen: true });
  const server = clone(base);
  server.submissions[0] = { id: 's1', status: 'approved', seen: false };
  const child = clone(base);
  child.submissions[0].note = 'gammel ændring';
  applyPatch(server, makePatch(base, child));
  assert.equal(server.submissions[0].status, 'approved');
});

test('en afgjort kamp vinder over en aflyst, og "set" huskes', () => {
  const base = baseState();
  base.battles.push({ id: 'b1', status: 'pending', seen: {} });
  const server = clone(base);
  server.battles[0] = { id: 'b1', status: 'done', seen: { c1: false, c2: true }, challengerToyId: 't1', opponentToyId: 't2', result: { winner: 'a' } };
  const devA = clone(base);
  devA.battles[0].status = 'cancelled';
  applyPatch(server, makePatch(base, devA));
  assert.equal(server.battles[0].status, 'done');
  assert.equal(server.toys[0].record.wins, 1);
  assert.equal(server.toys[1].record.losses, 1);
  const devA2 = clone(server);
  devA2.battles[0].seen.c1 = true;
  applyPatch(server, makePatch(clone(server), devA2));
  assert.equal(server.battles[0].seen.c1, true);
});

test('samme belønning fra to enheder gives kun én gang', () => {
  const server = baseState();
  const a = clone(server);
  const b = clone(server);
  a.xpLog.push({ id: 'xa', toyId: 't1', amount: 20, source: 'mission', ref: 'd:m1' });
  b.xpLog.push({ id: 'xb', toyId: 't1', amount: 20, source: 'mission', ref: 'd:m1' });
  applyPatch(server, makePatch(baseState(), a));
  applyPatch(server, makePatch(baseState(), b));
  assert.equal(server.toys[0].xp, 20);
});

test('fjernede opgaver og ændrede indstillinger kommer med i patchen', () => {
  const base = baseState();
  base.activities.push({ id: 'egen', title: 'Fej' });
  const cur = clone(base);
  cur.activities = cur.activities.filter((a) => a.id !== 'egen');
  cur.settings.battlesPerToy = 5;
  const p = makePatch(base, cur);
  assert.deepEqual(p.removed.activities, ['egen']);
  assert.equal(p.settings.battlesPerToy, 5);
  assert.equal(isEmptyPatch(makePatch(base, clone(base))), true);
});

// ---------- Server-API ----------

async function startServer() {
  const api = createApi(await openMemory());
  const srv = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (!(await api(req, res, path))) res.writeHead(404).end();
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, { token, body, method = 'POST', text } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = typeof body === 'string' ? 'text/plain' : 'application/json';
    const r = await fetch(url + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: r.status, data: text ? await r.text() : await r.json().catch(() => null) };
  };
  return { srv, call };
}

test('server: opret, forbind med kode + PIN, synkroniser og billeder', async () => {
  const { srv, call } = await startServer();
  try {
    const created = await call('/api/family', { body: { state: baseState() } });
    assert.equal(created.status, 200);
    assert.match(created.data.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const tokenA = created.data.token;

    assert.equal((await call('/api/join', { body: { code: created.data.code, pin: '0000' } })).status, 403);
    const joined = await call('/api/join', { body: { code: created.data.code.toLowerCase(), pin: '2468' } });
    assert.equal(joined.status, 200);
    const tokenB = joined.data.token;

    // Enhed A giver XP, enhed B ser det
    const baseA = joined.data.state;
    const curA = clone(baseA);
    curA.xpLog.push({ id: 'x1', toyId: 't1', amount: 40, source: 'care', ref: 'k1' });
    const s1 = await call('/api/sync', { token: tokenA, body: { patch: makePatch(baseA, curA), version: 1 } });
    assert.equal(s1.data.state.toys[0].xp, 40);
    const s2 = await call('/api/sync', { token: tokenB, body: { patch: makePatch(baseA, baseA), version: 1 } });
    assert.equal(s2.data.state.toys[0].xp, 40);
    const s3 = await call('/api/sync', { token: tokenB, body: { patch: makePatch(baseA, baseA), version: s2.data.version } });
    assert.equal(s3.data.unchanged, true);

    // Uden nøgle: ingen adgang
    assert.equal((await call('/api/sync', { body: { patch: {} } })).status, 401);

    // Billeder
    const img = 'data:image/jpeg;base64,/9j/AAAA';
    assert.equal((await call('/api/photo/toyabc123', { token: tokenA, method: 'PUT', body: img })).status, 200);
    const got = await call('/api/photo/toyabc123', { token: tokenB, method: 'GET', text: true });
    assert.equal(got.data, img);
    assert.equal((await call('/api/photo/toyabc123', { token: tokenA, method: 'PUT', body: '<script>' })).status, 400);

    // En anden familie kan ikke se eller overskrive billedet
    const other = await call('/api/family', { body: { state: baseState() } });
    assert.equal((await call('/api/photo/toyabc123', { token: other.data.token, method: 'GET', text: true })).status, 404);
    assert.equal((await call('/api/photo/toyabc123', { token: other.data.token, method: 'PUT', body: img })).status, 403);

    // Afbryd enhed B
    await call('/api/leave', { token: tokenB });
    assert.equal((await call('/api/sync', { token: tokenB, body: { patch: {} } })).status, 401);

    // Slet familien
    assert.equal((await call('/api/reset', { token: tokenA })).status, 200);
    assert.equal((await call('/api/sync', { token: tokenA, body: { patch: {} } })).status, 401);
  } finally {
    srv.close();
  }
});

test('server: mange gæt på familiekoden bliver stoppet', async () => {
  const { srv, call } = await startServer();
  try {
    let last;
    for (let i = 0; i < 14; i++) last = await call('/api/join', { body: { code: 'AAAA-BBBB', pin: '1234' } });
    assert.equal(last.status, 429);
  } finally {
    srv.close();
  }
});
