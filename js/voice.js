// Oplæsning: Azure-stemme (dansk Christel eller Jeppe) gennem jeres egen server,
// og ellers enhedens egen danske stemme. Nøglen til Azure ligger kun på serveren.

import { S } from './actions.js';
import { isSoundOn, audioContext } from './ui/fx.js';

export const AZURE_VOICES = [
  { id: 'da-DK-ChristelNeural', name: 'Christel' },
  { id: 'da-DK-JeppeNeural', name: 'Jeppe' },
];

export const RATES = { slow: 'Langsom', normal: 'Normal' };

const DEFAULTS = { on: true, name: 'da-DK-ChristelNeural', rate: 'normal' };

export function voiceSettings() {
  return { ...DEFAULTS, ...(S?.settings?.voice || {}) };
}

// ---------- Hvilken stemme kan bruges? ----------

let statusPromise = null;
let azureFailures = 0;
let azureBlockedUntil = 0; // når serverens dagsgrænse er nået, holder vi pause med Azure

const azureUsable = () => azureFailures < 3 && Date.now() >= azureBlockedUntil;

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function deviceVoice() {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const voices = synth.getVoices() || [];
  const da = voices.filter((v) => /^da([-_]|$)/i.test(v.lang));
  return da.find((v) => /natural|neural|online|sara|christel/i.test(v.name)) || da[0] || null;
}

const hasSynth = () => !!globalThis.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined';

// Én fast lydafspiller. iPad og iPhone tillader kun lyd fra en afspiller, der er "låst op"
// med et tryk – bagefter kan den afspille Azure-lyd, også når den er hentet over nettet.
// En <audio>-afspiller spiller også, når iPhone står på lydløs (det gør Web Audio ikke).
const SILENT_WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let player = null;
function getPlayer() {
  if (!player && typeof Audio !== 'undefined') {
    player = new Audio();
    player.preload = 'auto';
    player.setAttribute('playsinline', '');
  }
  return player;
}

function unlockPlayer() {
  const p = getPlayer();
  if (!p) return;
  try {
    p.src = SILENT_WAV;
    const r = p.play();
    if (r && r.catch) r.catch(() => {});
  } catch {
    /* ikke vigtigt */
  }
}

function waitForVoices() {
  const synth = globalThis.speechSynthesis;
  if (!synth) return Promise.resolve();
  if ((synth.getVoices() || []).length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    synth.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1500);
  });
}

async function detect() {
  try {
    if (/^https?:$/.test(location.protocol)) {
      const r = await withTimeout(fetch('api/tts/status', { cache: 'no-store' }), 3000);
      if (r.ok) {
        const j = await r.json();
        if (j && j.azure) return 'azure';
      }
    }
  } catch {
    /* ingen server med Azure – brug enhedens stemme */
  }
  await waitForVoices();
  return hasSynth() ? 'device' : 'none';
}

// 'azure' | 'device' | 'none'
export function voiceProvider() {
  if (!statusPromise) statusPromise = detect();
  return statusPromise;
}

export function resetVoiceProvider() {
  statusPromise = null;
  azureFailures = 0;
  azureBlockedUntil = 0;
}

// iPad kræver, at oplæsning startes fra et tryk første gang
let unlocked = false;
export function unlockVoice() {
  if (unlocked) return;
  unlocked = true;
  unlockPlayer();
  try {
    const synth = globalThis.speechSynthesis;
    if (synth && typeof SpeechSynthesisUtterance !== 'undefined') {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      synth.speak(u);
    }
  } catch {
    /* ikke vigtigt */
  }
  voiceProvider();
}

// ---------- Azure-lyd hentes og gemmes i hukommelsen ----------

const cache = new Map();
const MAX_CACHE = 160;

function fetchAzure(text) {
  const vs = voiceSettings();
  const key = `${vs.name}|${vs.rate}|${text}`;
  if (cache.has(key)) {
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const p = (async () => {
    const r = await fetch('api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: vs.name, rate: vs.rate }),
    });
    if (!r.ok) {
      if (r.status === 429 || r.status === 503) azureBlockedUntil = Date.now() + 10 * 60000;
      throw Object.assign(new Error(`tts ${r.status}`), { status: r.status });
    }
    const blob = await r.blob();
    return URL.createObjectURL(new Blob([blob], { type: 'audio/mpeg' }));
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > MAX_CACHE) {
    const oldKey = cache.keys().next().value;
    cache.get(oldKey)?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    cache.delete(oldKey);
  }
  return p;
}

// Hent lyden på forhånd, så fx tallene i en træning kommer præcist
export async function prefetch(texts) {
  if (!voiceSettings().on || !isSoundOn()) return;
  if ((await voiceProvider()) !== 'azure' || !azureUsable()) return;
  const list = [...new Set(texts.filter(Boolean))];
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const t = list[i++];
      await fetchAzure(t).catch(() => {});
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// ---------- Afspilning i kø ----------

let queue = [];
let current = null;
let busy = false;
let gen = 0;

function stopCurrent() {
  if (current) {
    try {
      current.stop();
    } catch {
      /* allerede stoppet */
    }
    current = null;
  }
}

let lastCancel = 0;

export function stopSpeaking() {
  gen++;
  queue = [];
  stopCurrent();
  try {
    if (player && !player.paused) player.pause();
  } catch {
    /* ikke vigtigt */
  }
  try {
    const synth = globalThis.speechSynthesis;
    if (synth && (synth.speaking || synth.pending)) {
      synth.cancel();
      lastCancel = Date.now();
    }
  } catch {
    /* ikke vigtigt */
  }
}

// interrupt: stop det, der bliver sagt nu (bruges fx til tal, der hurtigt afløser hinanden)
export function say(text, { interrupt = false } = {}) {
  const vs = voiceSettings();
  if (!text || !vs.on || !isSoundOn()) return;
  if (interrupt) stopSpeaking();
  queue.push({ text: String(text).slice(0, 200), gen });
  pump();
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const item = queue.shift();
      if (item.gen !== gen) continue;
      const provider = await voiceProvider();
      if (item.gen !== gen) continue;
      if (provider === 'azure' && azureUsable()) {
        try {
          await playAzure(item.text, item.gen);
          azureFailures = 0;
          continue;
        } catch (e) {
          // Afvist afspilning (ikke låst op endnu) er ikke Azures fejl
          if (e?.name !== 'NotAllowedError') azureFailures++;
          console.warn('Azure-lyden kunne ikke afspilles, bruger enhedens stemme', e);
        }
      }
      if (item.gen !== gen) continue;
      if (hasSynth()) await playDevice(item.text);
    }
  } finally {
    busy = false;
  }
}

async function playAzure(text, itemGen) {
  const url = await fetchAzure(text);
  if (itemGen !== gen) return;
  const p = getPlayer();
  if (!p) throw new Error('ingen afspiller');
  await new Promise((resolve, reject) => {
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      p.onended = null;
      p.onerror = null;
      clearTimeout(safety);
      if (current && current.p === p) current = null;
      resolve();
    };
    p.onended = done;
    p.onerror = done;
    const safety = setTimeout(done, 20000);
    current = {
      p,
      stop: () => {
        try {
          p.pause();
        } catch {
          /* ignorer */
        }
        done();
      },
    };
    p.src = url;
    const r = p.play();
    if (r && r.catch) {
      r.catch((e) => {
        if (finished) return;
        finished = true;
        clearTimeout(safety);
        current = null;
        reject(e);
      });
    }
  });
}

function playDevice(text) {
  return new Promise((resolve) => {
    const synth = globalThis.speechSynthesis;
    if (!synth) return resolve();
    const v = deviceVoice();
    const u = new SpeechSynthesisUtterance(text);
    if (v) u.voice = v;
    u.lang = v?.lang || 'da-DK';
    u.rate = voiceSettings().rate === 'slow' ? 0.82 : 0.98;
    u.pitch = 1.05;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(safety);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    const safety = setTimeout(done, 4000 + text.length * 120);
    current = {
      stop: () => {
        try {
          synth.cancel();
        } catch {
          /* ignorer */
        }
        done();
      },
    };
    // iPad sluger en sætning, der startes lige efter en afbrydelse
    const wait = Math.max(0, 120 - (Date.now() - lastCancel));
    setTimeout(() => {
      if (!finished) synth.speak(u);
    }, wait);
  });
}

// Tal skrevet som ord, så begge stemmer siger dem ens
const ONES = ['nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti', 'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten'];
const TENS = { 20: 'tyve', 30: 'tredive', 40: 'fyrre', 50: 'halvtreds', 60: 'tres' };

export function numberWord(n) {
  n = Math.round(n);
  if (n >= 0 && n < 20) return ONES[n];
  if (n <= 60) {
    const t = Math.floor(n / 10) * 10;
    const o = n % 10;
    return o ? `${ONES[o]}og${TENS[t]}` : TENS[t];
  }
  return String(n);
}
