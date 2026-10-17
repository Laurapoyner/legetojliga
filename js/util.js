// Små hjælpefunktioner, der bruges overalt i spillet.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function uid(prefix = '') {
  let r = '';
  try {
    const a = crypto.getRandomValues(new Uint32Array(3));
    r = Array.from(a, (n) => n.toString(36)).join('');
  } catch {
    r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
  return prefix + r.slice(0, 14);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Alle dage tælles i dansk tid, så grænser nulstilles ved midnat i Danmark.
const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function dayKey(ts = Date.now()) {
  const p = {};
  for (const part of DAY_FMT.formatToParts(new Date(ts))) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export function weekKey(ts = Date.now()) {
  const [y, m, d] = dayKey(ts).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-U${String(week).padStart(2, '0')}`;
}

// Deterministisk tilfældighed, så en kamp altid kan afspilles ens igen.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randomSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  } catch {
    return Math.floor(Math.random() * 4294967295);
  }
}

export function timeAgo(ts, now = Date.now()) {
  const s = Math.round((now - ts) / 1000);
  if (s < 60) return 'lige nu';
  const m = Math.round(s / 60);
  if (m < 60) return `for ${m} min. siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `for ${h} ${h === 1 ? 'time' : 'timer'} siden`;
  const d = Math.round(h / 24);
  if (d === 1) return 'i går';
  if (d < 7) return `for ${d} dage siden`;
  return new Date(ts).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}

export function fmtDuration(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  if (min < 60) return `${min} min.`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} t. ${r} min.` : `${h} t.`;
}

export function fmtDate(ts = Date.now()) {
  const s = new Date(ts).toLocaleDateString('da-DK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Copenhagen',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Billedet kunne ikke læses'));
    img.src = src;
  });
}

// Skalerer et billede ned og gemmer det som JPEG, så det fylder lidt.
export async function fileToDataUrl(file, { max = 720, quality = 0.82, square = false } = {}) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    let sx = 0;
    let sy = 0;
    if (square) {
      const s = Math.min(sw, sh);
      sx = (sw - s) / 2;
      sy = (sh - s) / 2;
      sw = sh = s;
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, rnd = Math.random) {
  return arr[Math.floor(rnd() * arr.length)];
}

export function createEmitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(fn);
      return () => map.get(name)?.delete(fn);
    },
    emit(name, data) {
      for (const fn of map.get(name) || []) {
        try {
          fn(data);
        } catch (e) {
          console.error(e);
        }
      }
    },
  };
}
