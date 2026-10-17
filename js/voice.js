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
  return deviceVoice() ? 'device' : 'none';
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

function decode(ac, buf) {
  return new Promise((resolve, reject) => ac.decodeAudioData(buf, resolve, reject));
}

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
    const buf = await r.arrayBuffer();
    const ac = audioContext();
    if (!ac) throw new Error('ingen lyd');
    return decode(ac, buf);
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
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

export function stopSpeaking() {
  gen++;
  queue = [];
  stopCurrent();
  try {
    globalThis.speechSynthesis?.cancel();
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
          azureFailures++;
          console.warn('Azure-stemmen svarede ikke, bruger enhedens stemme', e);
        }
      }
      if (item.gen !== gen) continue;
      if (deviceVoice()) await playDevice(item.text);
    }
  } finally {
    busy = false;
  }
}

async function playAzure(text, itemGen) {
  const buffer = await fetchAzure(text);
  if (itemGen !== gen) return;
  const ac = audioContext();
  if (!ac) return;
  await new Promise((resolve) => {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    const done = () => {
      if (current && current.src === src) current = null;
      resolve();
    };
    src.onended = done;
    current = {
      src,
      stop: () => {
        try {
          src.stop();
        } catch {
          /* ignorer */
        }
        done();
      },
    };
    src.start();
  });
}

function playDevice(text) {
  return new Promise((resolve) => {
    const synth = globalThis.speechSynthesis;
    const v = deviceVoice();
    if (!synth || !v) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang || 'da-DK';
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
    synth.speak(u);
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
