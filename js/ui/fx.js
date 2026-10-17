// Effekter: lyde (lavet med Web Audio, ingen lydfiler), konfetti, beskeder og vinduer.

import { esc } from '../util.js';

// ---------- Lyd ----------

let ctx = null;
let soundEnabled = readSoundPref();

function readSoundPref() {
  try {
    return localStorage.getItem('ll:sound') !== '0';
  } catch {
    return true;
  }
}

export function isSoundOn() {
  return soundEnabled;
}

export function setSound(on) {
  soundEnabled = !!on;
  try {
    localStorage.setItem('ll:sound', on ? '1' : '0');
  } catch {
    /* kun en bekvemmelighed */
  }
}

function audio() {
  if (!soundEnabled) return null;
  try {
    if (!ctx) {
      const C = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Lydmotoren deles med oplæsningen (Azure-stemmen afspilles gennem den)
export function audioContext() {
  return audio();
}

// Skal kaldes fra et tryk, så iPad tillader lyd senere
export function unlockAudio() {
  const a = audio();
  if (!a) return;
  const b = a.createBuffer(1, 1, 22050);
  const s = a.createBufferSource();
  s.buffer = b;
  s.connect(a.destination);
  s.start(0);
}

function tone(freq, dur, { type = 'sine', vol = 0.12, when = 0, to = null } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.2, when = 0, freq = 1200 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + when;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start(t0);
}

export const sfx = {
  tap: () => tone(660, 0.06, { type: 'triangle', vol: 0.06 }),
  coin: () => {
    tone(988, 0.08, { type: 'square', vol: 0.05 });
    tone(1319, 0.18, { type: 'square', vol: 0.05, when: 0.08 });
  },
  rep: (p = 0) => tone(520 + p * 500, 0.09, { type: 'triangle', vol: 0.09 }),
  beep: (final = false) => tone(final ? 988 : 660, final ? 0.3 : 0.15, { type: 'square', vol: 0.06 }),
  levelUp: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.06, when: i * 0.09 }));
    tone(1319, 0.5, { type: 'triangle', vol: 0.1, when: 0.38 });
  },
  achievement: () => {
    [784, 988, 1175].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.09, when: i * 0.08 }));
  },
  win: () => {
    [523, 523, 523, 698, 880].forEach((f, i) => tone(f, i === 4 ? 0.5 : 0.12, { type: 'square', vol: 0.06, when: [0, 0.13, 0.26, 0.4, 0.58][i] }));
  },
  lose: () => {
    [392, 349, 311].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.08, when: i * 0.22 }));
  },
  hit: () => {
    noise(0.12, { vol: 0.35, freq: 900 });
    tone(140, 0.15, { type: 'sine', vol: 0.18, to: 60 });
  },
  crit: () => {
    noise(0.2, { vol: 0.4, freq: 2400 });
    tone(220, 0.25, { type: 'sawtooth', vol: 0.08, to: 70 });
  },
  block: () => {
    tone(1200, 0.12, { type: 'square', vol: 0.05 });
    tone(1800, 0.1, { type: 'triangle', vol: 0.05, when: 0.02 });
  },
  whoosh: () => noise(0.25, { vol: 0.12, freq: 3000 }),
  care: () => {
    tone(880, 0.1, { type: 'sine', vol: 0.08 });
    tone(1175, 0.16, { type: 'sine', vol: 0.08, when: 0.09 });
  },
  error: () => tone(220, 0.18, { type: 'square', vol: 0.05 }),
};

// ---------- Konfetti ----------

export const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const CONFETTI_COLORS = ['#FFC93C', '#FF6B57', '#2D7FF9', '#12B886', '#8A5CF6', '#FF5FA2'];

export function confetti({ count = 140, duration = 2400, origin = null } = {}) {
  if (reducedMotion()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti-canvas';
  c.setAttribute('aria-hidden', 'true');
  document.body.appendChild(c);
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const W = innerWidth;
  const H = innerHeight;
  c.width = W * dpr;
  c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const ox = origin ? origin.x : W / 2;
  const oy = origin ? origin.y : H * 0.35;
  const parts = Array.from({ length: count }, () => {
    const ang = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 9;
    return {
      x: ox,
      y: oy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 6,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      c: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      round: Math.random() < 0.3,
    };
  });
  const t0 = performance.now();
  const frame = (t) => {
    const k = (t - t0) / duration;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.globalAlpha = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.fillStyle = p.c;
      if (p.round) {
        g.beginPath();
        g.arc(0, 0, p.w / 2.4, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

// ---------- Beskeder ----------

export function toast(text, { icon = 'info', tone: t = 'ink', ms = 3200 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast-${t}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="ms" aria-hidden="true">${esc(icon)}</span><span>${esc(text)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// ---------- Fejringer i kø (level up, nye pokaler) ----------

const queue = [];
let showing = false;

export function celebrate(item) {
  queue.push(item);
  if (!showing) nextCelebration();
}

function nextCelebration() {
  const item = queue.shift();
  const root = document.getElementById('celebrate-root');
  if (!item || !root) {
    showing = false;
    return;
  }
  showing = true;
  root.innerHTML = `<div class="celebrate" role="dialog" aria-modal="true" aria-label="${esc(item.label || 'Fejring')}">
      <div class="celebrate-card">${item.html}
        <button type="button" class="btn btn-lg btn-block" data-celebrate-close>${esc(item.button || 'Sejt!')}</button>
      </div>
    </div>`;
  root.hidden = false;
  item.sound?.();
  item.onShow?.();
  if (item.confetti !== false) setTimeout(() => confetti(), 120);
  item.mount?.(root);
  const btn = root.querySelector('[data-celebrate-close]');
  btn?.focus({ preventScroll: true });
  btn?.addEventListener(
    'click',
    () => {
      root.innerHTML = '';
      root.hidden = true;
      item.onClose?.();
      setTimeout(nextCelebration, 150);
    },
    { once: true },
  );
}

export function celebrating() {
  return showing;
}

// ---------- Vinduer ----------

let modalClose = null;

export function openModal(html, { onClose, label = 'Vindue', wide = false } = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <button type="button" class="modal-x" data-act="closeModal" aria-label="Luk"><span class="ms" aria-hidden="true">close</span></button>
        ${html}
      </div>
    </div>`;
  root.hidden = false;
  document.documentElement.classList.add('modal-open');
  modalClose = onClose || null;
  root.querySelector('[data-modal-backdrop]').addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-modal-backdrop')) closeModal();
  });
  const first = root.querySelector('input, button:not(.modal-x), select, textarea');
  first?.focus({ preventScroll: true });
  return root.querySelector('.modal');
}

export function closeModal() {
  const root = document.getElementById('modal-root');
  if (!root || root.hidden) return;
  root.innerHTML = '';
  root.hidden = true;
  document.documentElement.classList.remove('modal-open');
  const fn = modalClose;
  modalClose = null;
  fn?.();
}

export function modalOpen() {
  const root = document.getElementById('modal-root');
  return root && !root.hidden;
}

// Flyvende tal og symboler (fx "+30 XP" eller hjerter ved pleje)
export function floatText(anchor, text, cls = '') {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = `float-text ${cls}`;
  el.textContent = text;
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top + r.height / 3}px`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}
