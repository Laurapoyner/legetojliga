// Forbindelsen til familiens fælles database på serveren.
// Spillet virker stadig uden: så gemmes alt kun på enheden som før.

import * as A from './actions.js';
import * as store from './store.js';
import { makePatch, applyPatch, isEmptyPatch, recompute } from './sync.js';

const LINK_KEY = 'link';
const BASE_KEY = 'base';
const QUEUE_KEY = 'photoQueue';
const POLL_MS = 8000;

let link = null; // { token, code }
let base = null; // seneste data fra serveren
let version = 0;
let available = false;
let configured = false;
let inflight = null;
let again = false;
let timer = null;
let pollTimer = null;
let queue = [];
export let lastSync = 0;
export let lastError = '';

const clone = (x) => JSON.parse(JSON.stringify(x));

export const isLinked = () => !!link;
export const isAvailable = () => available;
export const isConfigured = () => configured;
export const familyCode = () => link?.code || '';

async function api(path, { method = 'POST', body, text = false } = {}) {
  const headers = {};
  if (link?.token) headers.Authorization = `Bearer ${link.token}`;
  let payload;
  if (body !== undefined) {
    if (typeof body === 'string') {
      headers['Content-Type'] = 'text/plain';
      payload = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  const r = await fetch(path.replace(/^\//, ''), { method, headers, body: payload, cache: 'no-store' });
  if (r.status === 401 && link) {
    await unlinkLocal();
    A.bus.emit('cloud', { kind: 'unlinked' });
  }
  if (!r.ok) {
    let msg = `Fejl ${r.status}`;
    try {
      msg = (await r.json()).error || msg;
    } catch {
      /* ingen besked */
    }
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return text ? r.text() : r.json();
}

// ---------- Start ----------

export async function initCloud() {
  link = await store.getKV(LINK_KEY);
  base = await store.getKV(BASE_KEY);
  version = link?.version || 0;
  queue = (await store.getKV(QUEUE_KEY)) || [];
  try {
    if (!/^https?:$/.test(location.protocol)) throw new Error('ingen server');
    const r = await Promise.race([fetch('api/status', { cache: 'no-store' }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
    const j = r.ok ? await r.json() : {};
    available = !!j.db;
    configured = !!j.dbConfigured;
  } catch {
    available = false;
  }
  A.remote.photoSaved = (id) => {
    if (!link) return;
    if (!queue.includes(id)) queue.push(id);
    saveQueue();
    flushPhotos();
  };
  A.remote.photoRemoved = (id) => {
    if (!link) return;
    queue = queue.filter((x) => x !== id);
    saveQueue();
    api(`/api/photo/${id}`, { method: 'DELETE' }).catch(() => {});
  };
  A.remote.fetchPhoto = (id) => (link ? api(`/api/photo/${id}`, { method: 'GET', text: true }) : Promise.resolve(null));
  A.bus.on('changed', () => schedule());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncNow();
  });
  addEventListener('online', () => syncNow());
  if (link && available) await syncNow();
  startPolling();
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (link && available && !document.hidden) syncNow();
  }, POLL_MS);
}

function schedule() {
  if (!link || !available) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, 1200);
}

async function saveLink() {
  await store.setKV(LINK_KEY, link ? { ...link, version } : null);
}

async function saveBase() {
  await store.setKV(BASE_KEY, base);
}

function saveQueue() {
  store.setKV(QUEUE_KEY, queue).catch(() => {});
}

// ---------- Synkronisering ----------

export function syncNow() {
  if (!link || !available) return Promise.resolve();
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = doSync().finally(() => {
    inflight = null;
    if (again) {
      again = false;
      syncNow();
    }
  });
  return inflight;
}

async function doSync() {
  const sent = clone(A.S);
  const patch = makePatch(base, sent);
  try {
    const res = await api('/api/sync', { body: { patch, version } });
    lastError = '';
    lastSync = Date.now();
    if (res.code && link) link.code = res.code;
    if (res.unchanged) {
      flushPhotos();
      return;
    }
    // Ændringer, der er sket her, mens vi ventede på serveren
    const later = makePatch(sent, A.S);
    base = res.state;
    version = res.version;
    const next = applyPatch(clone(res.state), later);
    recompute(next);
    const before = JSON.stringify(A.S);
    if (JSON.stringify(next) !== before) {
      A.setRemoteState(next);
      A.bus.emit('remote');
    }
    await saveBase();
    await saveLink();
    if (!isEmptyPatch(later)) again = true;
    flushPhotos();
  } catch (e) {
    lastError = e.status ? e.message : 'Ingen forbindelse – gemmer på enheden og prøver igen';
  }
}

let flushing = false;
async function flushPhotos() {
  if (flushing || !link || !queue.length) return;
  flushing = true;
  try {
    while (queue.length && link) {
      const id = queue[0];
      const data = await store.getPhoto(id);
      if (data) await api(`/api/photo/${id}`, { method: 'PUT', body: data });
      queue.shift();
      saveQueue();
    }
  } catch {
    /* prøver igen ved næste synkronisering */
  } finally {
    flushing = false;
  }
}

async function adopt(res) {
  link = { token: res.token, code: res.code };
  version = res.version;
  base = res.state;
  await saveBase();
  await saveLink();
}

// ---------- Opret, forbind, afbryd ----------

// Gemmer denne enheds familie i databasen og laver en familiekode
export async function createFamily() {
  await A.flushSave();
  const res = await api('/api/family', { body: { state: A.S } });
  await adopt(res);
  queue = await store.allPhotoIds();
  saveQueue();
  flushPhotos();
  A.setRemoteState(res.state);
  return res.code;
}

// Henter familien fra databasen – erstatter det, der er på denne enhed
export async function joinFamily(code, pin) {
  const res = await api('/api/join', { body: { code, pin } });
  await store.clearAll();
  await adopt(res);
  queue = [];
  saveQueue();
  A.setRemoteState(res.state);
  await A.flushSave();
  return res.code;
}

async function unlinkLocal() {
  link = null;
  base = null;
  version = 0;
  queue = [];
  await store.setKV(LINK_KEY, null);
  await store.setKV(BASE_KEY, null);
  saveQueue();
}

// Denne enhed holder op med at synkronisere (data bliver liggende lokalt)
export async function leaveFamily() {
  await api('/api/leave').catch(() => {});
  await unlinkLocal();
}

// Sletter hele familien i databasen
export async function deleteFamily() {
  await api('/api/reset');
  await unlinkLocal();
}

// Efter en backup er indlæst: erstat familiens data i databasen
export async function replaceWithLocal(savedLink) {
  link = savedLink;
  const res = await api('/api/replace', { body: { state: A.S } });
  version = res.version;
  base = res.state;
  await saveBase();
  await saveLink();
  queue = await store.allPhotoIds();
  saveQueue();
  flushPhotos();
}

export function currentLink() {
  return link ? { ...link } : null;
}
