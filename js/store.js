// Lagring på enheden. I testversionen gemmes alt i browserens IndexedDB.
// Senere kan denne fil skiftes ud med kald til en server med MongoDB –
// resten af spillet taler kun med funktionerne herunder.

const DB_NAME = 'legetoejsligaen';
const DB_VERSION = 1;
const LS_PREFIX = 'll:';

let db = null;
let mode = 'memory';
const mem = { kv: new Map(), photos: new Map() };

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function idbReq(storeName, rw, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, rw ? 'readwrite' : 'readonly');
    const store = tx.objectStore(storeName);
    const req = fn(store);
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function initStore() {
  try {
    if (!globalThis.indexedDB) throw new Error('no idb');
    db = await withTimeout(idbOpen(), 4000);
    // Prøv en skrivning for at sikre, at lagringen virker (fx privat browsing)
    await idbReq('kv', true, (s) => s.put(Date.now(), '__probe'));
    mode = 'indexeddb';
    return mode;
  } catch {
    db = null;
  }
  try {
    localStorage.setItem(LS_PREFIX + 'probe', '1');
    localStorage.removeItem(LS_PREFIX + 'probe');
    mode = 'local';
    return mode;
  } catch {
    mode = 'memory';
    return mode;
  }
}

export const storageMode = () => mode;

export async function getKV(key) {
  try {
    if (mode === 'indexeddb') return (await idbReq('kv', false, (s) => s.get(key))) ?? null;
    if (mode === 'local') {
      const raw = localStorage.getItem(LS_PREFIX + 'kv:' + key);
      return raw ? JSON.parse(raw) : null;
    }
  } catch (e) {
    console.warn('Kunne ikke læse', key, e);
  }
  return mem.kv.has(key) ? structuredClone(mem.kv.get(key)) : null;
}

export async function setKV(key, value) {
  try {
    if (mode === 'indexeddb') return await idbReq('kv', true, (s) => s.put(value, key));
    if (mode === 'local') return localStorage.setItem(LS_PREFIX + 'kv:' + key, JSON.stringify(value));
  } catch (e) {
    console.warn('Kunne ikke gemme', key, e);
    throw e;
  }
  mem.kv.set(key, structuredClone(value));
}

export async function putPhoto(id, dataUrl) {
  if (mode === 'indexeddb') return idbReq('photos', true, (s) => s.put(dataUrl, id));
  if (mode === 'local') return localStorage.setItem(LS_PREFIX + 'ph:' + id, dataUrl);
  mem.photos.set(id, dataUrl);
}

export async function getPhoto(id) {
  try {
    if (mode === 'indexeddb') return (await idbReq('photos', false, (s) => s.get(id))) ?? null;
    if (mode === 'local') return localStorage.getItem(LS_PREFIX + 'ph:' + id);
  } catch (e) {
    console.warn('Kunne ikke hente billede', id, e);
    return null;
  }
  return mem.photos.get(id) ?? null;
}

export async function deletePhoto(id) {
  try {
    if (mode === 'indexeddb') return await idbReq('photos', true, (s) => s.delete(id));
    if (mode === 'local') return localStorage.removeItem(LS_PREFIX + 'ph:' + id);
  } catch (e) {
    console.warn('Kunne ikke slette billede', id, e);
  }
  mem.photos.delete(id);
}

export async function allPhotoIds() {
  if (mode === 'indexeddb') return (await idbReq('photos', false, (s) => s.getAllKeys())) || [];
  if (mode === 'local') {
    const ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX + 'ph:')) ids.push(k.slice(LS_PREFIX.length + 3));
    }
    return ids;
  }
  return [...mem.photos.keys()];
}

export async function clearAll() {
  if (mode === 'indexeddb') {
    await idbReq('kv', true, (s) => s.clear());
    await idbReq('photos', true, (s) => s.clear());
    return;
  }
  if (mode === 'local') {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    return;
  }
  mem.kv.clear();
  mem.photos.clear();
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ikke alle browsere understøtter det */
  }
  return false;
}
