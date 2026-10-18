// API til familiens fælles data. Hver enhed får en hemmelig nøgle (token), når den
// opretter familien eller forbinder sig med familiekode + forældre-PIN.

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { applyPatch, recompute, isEmptyPatch } from '../js/sync.js';
import { hashStr } from '../js/util.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sha = (s) => createHash('sha256').update(s).digest('hex');

export function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('for stor'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req, limit = 64 * 1024) {
  const text = await readBody(req, limit);
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw Object.assign(new Error('ugyldig json'), { status: 400 });
  }
}

// Begrænser forsøg pr. IP (fx gæt på familiekode)
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 10000) buckets.clear();
  return list.length > max;
}

const ipOf = (req) => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

function newCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return s;
}

export const formatCode = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function pinMatches(family, pin) {
  if (!family?.salt || !family?.pinHash) return false;
  const text = `${family.salt}:${String(pin || '').trim()}`;
  const candidates = [sha(text), 'f' + hashStr(text).toString(16)];
  return candidates.some((c) => c.length === family.pinHash.length && timingSafeEqual(Buffer.from(c), Buffer.from(family.pinHash)));
}

function validState(st) {
  return st && typeof st === 'object' && Array.isArray(st.children) && Array.isArray(st.toys) && st.family?.pinHash;
}

export function createApi(db) {
  async function auth(req) {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!m) return null;
    return db.families.byToken(sha(m[1]));
  }

  async function issueToken(familyId) {
    const token = randomBytes(24).toString('base64url');
    await db.families.addToken(familyId, { h: sha(token), at: new Date() });
    return token;
  }

  // Fletter en patch ind og gemmer – prøver igen, hvis en anden enhed gemte samtidig
  async function mergeAndSave(fam, fn) {
    for (let i = 0; i < 6; i++) {
      const state = fn(structuredClone(fam.state));
      if (await db.families.saveState(fam._id, fam.version, state)) return { state, version: fam.version + 1 };
      fam = await db.families.byId(fam._id);
      if (!fam) throw Object.assign(new Error('familien findes ikke'), { status: 404 });
    }
    throw Object.assign(new Error('travlt'), { status: 409 });
  }

  const routes = {
    'POST /api/family': async (req, res) => {
      if (limited(`create:${ipOf(req)}`, 10, 3600000)) return json(res, 429, { error: 'For mange forsøg. Prøv igen senere.' });
      const { state } = await readJson(req, 8 * 1024 * 1024);
      if (!validState(state)) return json(res, 400, { error: 'Opret først familien med børn og PIN-kode' });
      recompute(state);
      const id = randomBytes(12).toString('hex');
      for (let i = 0; i < 5; i++) {
        try {
          const code = newCode();
          await db.families.insert({ _id: id, code, tokens: [], state, version: 1, createdAt: new Date(), updatedAt: new Date() });
          const token = await issueToken(id);
          return json(res, 200, { token, code: formatCode(code), state, version: 1 });
        } catch (e) {
          if (e?.code !== 11000) throw e;
        }
      }
      throw new Error('kunne ikke lave familiekode');
    },

    'POST /api/join': async (req, res) => {
      if (limited(`join:${ipOf(req)}`, 12, 15 * 60000)) return json(res, 429, { error: 'For mange forsøg. Vent et kvarter, og prøv igen.' });
      const { code, pin } = await readJson(req);
      const fam = await db.families.byCode(cleanCode(code));
      if (!fam || !pinMatches(fam.state?.family, pin)) return json(res, 403, { error: 'Familiekoden eller PIN-koden passer ikke' });
      const token = await issueToken(fam._id);
      return json(res, 200, { token, code: formatCode(fam.code), state: fam.state, version: fam.version });
    },

    'POST /api/sync': async (req, res) => {
      const fam = await auth(req);
      if (!fam) return json(res, 401, { error: 'Enheden er ikke forbundet' });
      const { patch, version } = await readJson(req, 8 * 1024 * 1024);
      if (isEmptyPatch(patch)) {
        if (version === fam.version) return json(res, 200, { unchanged: true, version: fam.version, code: formatCode(fam.code) });
        return json(res, 200, { state: fam.state, version: fam.version, code: formatCode(fam.code) });
      }
      const out = await mergeAndSave(fam, (st) => applyPatch(st, patch));
      return json(res, 200, { ...out, code: formatCode(fam.code) });
    },

    // Erstatter alt (bruges når en backup indlæses)
    'POST /api/replace': async (req, res) => {
      const fam = await auth(req);
      if (!fam) return json(res, 401, { error: 'Enheden er ikke forbundet' });
      const { state } = await readJson(req, 8 * 1024 * 1024);
      if (!validState(state)) return json(res, 400, { error: 'Ugyldige data' });
      const out = await mergeAndSave(fam, () => recompute(state));
      return json(res, 200, out);
    },

    'POST /api/leave': async (req, res) => {
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      const fam = await auth(req);
      if (fam && m) await db.families.removeToken(fam._id, sha(m[1]));
      return json(res, 200, { ok: true });
    },

    'POST /api/reset': async (req, res) => {
      const fam = await auth(req);
      if (!fam) return json(res, 401, { error: 'Enheden er ikke forbundet' });
      await db.photos.removeFamily(fam._id);
      await db.families.remove(fam._id);
      return json(res, 200, { ok: true });
    },
  };

  async function photo(req, res, id) {
    if (!/^[a-z0-9]{3,40}$/i.test(id)) return json(res, 400, { error: 'Ugyldigt billede' });
    const fam = await auth(req);
    if (!fam) return json(res, 401, { error: 'Enheden er ikke forbundet' });
    if (req.method === 'GET') {
      const p = await db.photos.get(id, fam._id);
      if (!p) return json(res, 404, { error: 'Billedet findes ikke' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, max-age=86400' });
      return res.end(p.data);
    }
    if (req.method === 'PUT') {
      const data = await readBody(req, 3 * 1024 * 1024);
      if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return json(res, 400, { error: 'Ugyldigt billede' });
      const ok = await db.photos.put(id, fam._id, data);
      return ok ? json(res, 200, { ok: true }) : json(res, 403, { error: 'Billedet tilhører en anden familie' });
    }
    if (req.method === 'DELETE') {
      await db.photos.remove(id, fam._id);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'Ikke tilladt' });
  }

  // Returnerer true, hvis forespørgslen blev besvaret
  return async function handle(req, res, path) {
    try {
      const route = routes[`${req.method} ${path}`];
      if (route) {
        await route(req, res);
        return true;
      }
      const m = /^\/api\/photo\/([^/]+)$/.exec(path);
      if (m) {
        await photo(req, res, m[1]);
        return true;
      }
      return false;
    } catch (e) {
      if (!e.status) console.error(e);
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Serverfejl' });
      return true;
    }
  };
}
