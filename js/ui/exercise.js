// Træning med kamera: kameraet tæller bevægelserne live, og figuren får XP, når øvelsen er klaret.

import { S, activityById, toyById, completeCameraTraining, submitActivity, canDoActivity, doCare } from '../actions.js';
import { scaledTarget, levelInfo, careCooldownLeft } from '../rules.js';
import { STAT_NAMES, CARE } from '../catalog.js';
import { fmtDuration } from '../util.js';
import { esc } from '../util.js';
import { app, go, back, me, setUnmount } from './app.js';
import { icon, toyPhoto } from './components.js';
import { sfx, toast, confetti, unlockAudio } from './fx.js';
import { flushCelebrations } from './celebrations.js';
import { say, prefetch, numberWord, stopSpeaking } from '../voice.js';
import { createDetector } from '../pose/counters.js';
import { loadPoseLandmarker, openCamera, stopStream, startLoop, drawSkeleton, explainCameraError } from '../pose/camera.js';

const UNIT = { reps: 'gange', sec: 'sek.' };

// I Claudes forhåndsvisning må siden ikke bruge kameraet
const inPreview = () => !!globalThis.claude?.use;

const TIPS = {
  jumpingJack: 'Start med armene nede og samlede ben. Hop ud med arme og ben – og hop ind igen.',
  squat: 'Stå med fødderne lidt fra hinanden. Sæt numsen ned, som om du sætter dig på en stol, og rejs dig helt op.',
  highKnees: 'Løft knæet op mod hoften – skiftevis venstre og højre. Hvert knæ tæller.',
  jump: 'Hop med samlede ben, så begge fødder slipper gulvet. Land blødt.',
  oneLeg: 'Løft den ene fod fra gulvet, og hold balancen. Uret går, så længe foden er oppe.',
  heroPose: 'Stræk begge arme højt op i et stort V, og stå stolt som en superhelt.',
  airplane: 'Stræk armene helt ud til siden som vinger. Hold dem i skulderhøjde.',
  dance: 'Dans løs med hele kroppen! Uret går, når du bevæger dig nok.',
  run: 'Løb på stedet og løft fødderne skiftevis. Uret går, når du løber.',
};

let ex = null; // den aktive træning

function cleanup() {
  if (!ex) return;
  ex.stopLoop?.();
  stopStream(ex.stream);
  ex.wake?.release?.().catch?.(() => {});
  clearInterval(ex.countTimer);
  clearInterval(ex.demoTimer);
  cancelAnimationFrame(ex.demoRaf);
  document.removeEventListener('visibilitychange', ex.onVis);
  stopSpeaking();
  ex = null;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Oplæste hjælpetekster må ikke komme for tit
function speakHint(text) {
  if (!ex || !text) return;
  const now = performance.now();
  const since = now - (ex.lastHintAt || -1e9);
  if (since < 5000) return;
  if (text === ex.lastHint && since < 12000) return;
  ex.lastHint = text;
  ex.lastHintAt = now;
  say(text);
}

function doneText() {
  const t = toyById(ex.toyId);
  return `Flot klaret! ${t ? t.name : 'Din figur'} får ${ex.act.xp} XP.`;
}

// ---------- Lille animeret figur, der viser øvelsen ----------

function demoLandmarks(kind, t) {
  const s = (f, ph = 0) => Math.sin((t * f + ph) * 2 * Math.PI);
  let aL = 0.06;
  let aR = 0.06;
  let spread = 0;
  let squat = 0;
  let kneeL = 0;
  let kneeR = 0;
  let jump = 0;
  let foot = 0;
  let dx = 0;
  switch (kind) {
    case 'jumpingJack': {
      const p = (s(0.8) + 1) / 2;
      aL = aR = 0.06 + p * 0.88;
      spread = p;
      jump = Math.abs(s(1.6)) * 0.015;
      break;
    }
    case 'squat':
      squat = (s(0.5) + 1) / 2;
      aL = aR = 0.06 + squat * 0.42;
      break;
    case 'highKnees': {
      const v = s(1.1);
      kneeL = Math.max(0, v);
      kneeR = Math.max(0, -v);
      aL = 0.12 + Math.max(0, -v) * 0.25;
      aR = 0.12 + Math.max(0, v) * 0.25;
      break;
    }
    case 'jump':
      jump = Math.max(0, s(1)) * 0.07;
      aL = aR = 0.08 + Math.max(0, s(1)) * 0.2;
      break;
    case 'oneLeg':
      foot = 0.1;
      aL = aR = 0.42 + s(0.3) * 0.04;
      dx = s(0.3) * 0.005;
      break;
    case 'heroPose':
      aL = aR = 0.8;
      break;
    case 'airplane':
      aL = 0.5 + s(0.3) * 0.04;
      aR = 0.5 - s(0.3) * 0.04;
      break;
    case 'dance':
      aL = 0.3 + (s(0.9) + 1) * 0.3;
      aR = 0.3 + (s(0.9, 0.5) + 1) * 0.3;
      squat = (s(1.8) + 1) * 0.15;
      dx = s(0.45) * 0.04;
      break;
    case 'run': {
      const v = s(1.8);
      kneeL = Math.max(0, v) * 0.55;
      kneeR = Math.max(0, -v) * 0.55;
      aL = 0.15 + Math.max(0, -v) * 0.2;
      aR = 0.15 + Math.max(0, v) * 0.2;
      break;
    }
    default:
      break;
  }
  const cx = 0.5 + dx;
  const sq = squat * 0.13;
  const P = new Array(33).fill(null).map(() => ({ x: cx, y: 0.5, visibility: 1 }));
  const set = (i, x, y) => (P[i] = { x, y, visibility: 1 });
  set(0, cx, 0.18 + sq - jump);
  for (const [sgn, iS, iE, iW, iH, iK, iA, a, knee, ft] of [
    [-1, 11, 13, 15, 23, 25, 27, aL, kneeL, foot],
    [1, 12, 14, 16, 24, 26, 28, aR, kneeR, 0],
  ]) {
    const sx = cx + sgn * 0.07;
    const sy = 0.28 + sq - jump;
    const ang = a * Math.PI;
    const dxA = Math.sin(ang) * sgn;
    const dyA = Math.cos(ang);
    set(iS, sx, sy);
    set(iE, sx + dxA * 0.12, sy + dyA * 0.12);
    set(iW, sx + dxA * 0.24, sy + dyA * 0.24);
    set(iH, cx + sgn * 0.05, 0.52 + sq - jump);
    set(iK, cx + sgn * (0.05 + spread * 0.05 + squat * 0.04), 0.68 - knee * 0.16 - ft * 0.5 - jump);
    set(iA, cx + sgn * (0.05 + spread * 0.1), 0.86 - knee * 0.2 - ft - jump);
  }
  // Pleje-legene bøjer albuerne, så hænderne placeres direkte
  const lerp = (a, b, k) => a + (b - a) * k;
  const hand = (iE, iW, wx, wy, ex2, ey2) => {
    set(iW, wx, wy);
    set(iE, ex2, ey2);
  };
  if (kind === 'handToMouth') {
    const k = (s(0.6) + 1) / 2;
    hand(14, 16, lerp(cx + 0.17, cx + 0.02, k), lerp(0.52, 0.21, k), cx + 0.13, lerp(0.4, 0.34, k));
  } else if (kind === 'drink') {
    hand(14, 16, cx + 0.02, 0.21 + s(0.4) * 0.005, cx + 0.14, 0.33);
  } else if (kind === 'sleep') {
    hand(13, 15, cx + 0.06, 0.2, cx - 0.02, 0.36);
    hand(14, 16, cx + 0.075, 0.225, cx + 0.12, 0.36);
    P[0] = { x: cx + 0.01, y: 0.185, visibility: 1 };
  } else if (kind === 'brush') {
    hand(14, 16, cx + 0.03 + s(2) * 0.028, 0.21, cx + 0.13, 0.33);
  } else if (kind === 'clapUp') {
    const k = (s(0.7) + 1) / 2;
    for (const [sgn, iE, iW] of [[-1, 13, 15], [1, 14, 16]]) {
      const wx = cx + sgn * (0.01 + 0.3 * (1 - k));
      const wy = lerp(0.3, 0.04, k);
      hand(iE, iW, wx, wy, cx + sgn * lerp(0.2, 0.1, k), lerp(0.29, 0.16, k));
    }
  } else if (kind === 'selfHug') {
    hand(13, 15, cx + 0.07, 0.3, cx - 0.02, 0.42);
    hand(14, 16, cx - 0.07, 0.31, cx + 0.02, 0.43);
  }
  return P;
}

// Pleje vises som en "øvelse": id'et er care:<handling>
function resolveAct(id) {
  if (String(id).startsWith('care:')) {
    const c = CARE.find((x) => x.id === String(id).slice(5));
    if (!c || !c.cam) return null;
    return { id, care: c.id, title: c.name, xp: c.xp, kind: 'camera', stat: null, desc: c.cam.tip, cam: c.cam, msg: c.msg };
  }
  return activityById(id);
}

function drawDemo(canvas, kind, t) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const P = demoLandmarks(kind, t);
  const size = Math.min(w, h);
  const ox = (w - size) / 2;
  const pt = (q) => [ox + q.x * size, q.y * size * 0.98 + h * 0.02];
  const ink = getComputedStyle(canvas).getPropertyValue('--ink').trim() || '#221B4B';
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(5, size / 26);
  const lines = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
  for (const [a, b] of lines) {
    const [x1, y1] = pt(P[a]);
    const [x2, y2] = pt(P[b]);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
  const [hx, hy] = pt(P[0]);
  g.beginPath();
  g.arc(hx, hy, size * 0.065, 0, Math.PI * 2);
  g.fill();
  // gulv
  g.globalAlpha = 0.25;
  g.fillRect(ox + size * 0.2, h * 0.02 + size * 0.88, size * 0.6, Math.max(3, size / 60));
  g.globalAlpha = 1;
}

// ---------- Skærmen ----------

export const exercise = {
  chrome: false,
  render({ id, toyId }) {
    const a = resolveAct(id);
    const t = toyById(toyId);
    const c = me();
    if (!a || !t || !c || a.kind !== 'camera') {
      return `<div class="ex ex-error"><p>Træningen kunne ikke findes.</p><button type="button" class="btn" data-act="back">Tilbage</button></div>`;
    }
    const target = scaledTarget(a, c.difficulty);
    return `<div class="ex" id="ex">
      <header class="ex-top">
        <button type="button" class="icon-btn icon-btn-dark" data-act="exQuit" aria-label="Afslut træningen">${icon('close')}</button>
        <div class="ex-title"><b>${esc(a.title)}</b><span>${toyPhoto(t, 'ex-toy')}${esc(t.name)} · +${a.xp} XP</span></div>
        <button type="button" class="icon-btn icon-btn-dark" data-act="exFlip" aria-label="Skift kamera" id="ex-flip" hidden>${icon('cameraswitch')}</button>
      </header>
      <div class="ex-stage" id="ex-stage">
        <video id="ex-video" playsinline muted></video>
        <canvas id="ex-canvas" aria-hidden="true"></canvas>
        <div class="ex-hud" id="ex-hud" hidden>
          <div class="ex-count" id="ex-count"><b id="ex-num">0</b><span>/ ${target} ${UNIT[a.cam.unit]}</span></div>
          <div class="ex-meter" aria-hidden="true"><i id="ex-meter"></i></div>
          <p class="ex-hint" id="ex-hint" aria-live="polite"></p>
        </div>
        <div class="ex-overlay" id="ex-overlay">${introHtml(a, target)}</div>
      </div>
      <footer class="ex-controls" id="ex-controls" hidden>
        <button type="button" class="btn btn-ghost-dark" data-act="exPause" id="ex-pause">${icon('pause')}Pause</button>
        <button type="button" class="btn btn-ghost-dark" data-act="exReset">${icon('replay')}Forfra</button>
      </footer>
    </div>`;
  },
  mount(root, { id, toyId }) {
    cleanup();
    const a = resolveAct(id);
    const c = me();
    if (!a || !c) return;
    ex = {
      act: a,
      toyId,
      target: scaledTarget(a, c.difficulty),
      facing: 'user',
      state: 'intro',
      det: null,
      lastProgress: 0,
    };
    ex.onVis = () => {
      if (document.hidden && ex?.state === 'active') pause();
    };
    document.addEventListener('visibilitychange', ex.onVis);
    setUnmount(cleanup);
    startDemo();
    say(`${a.title}. ${TIPS[a.cam.detector] || a.desc || ''}`, { interrupt: true });
  },
  actions: {
    exStart() {
      unlockAudio();
      sfx.tap();
      startCamera();
    },
    exQuit() {
      cleanup();
      back('training');
    },
    exFlip() {
      if (!ex) return;
      ex.facing = ex.facing === 'user' ? 'environment' : 'user';
      startCamera();
    },
    exPause() {
      if (!ex) return;
      if (ex.state === 'active') pause();
      else if (ex.state === 'paused') resume();
    },
    exReset() {
      if (!ex || !ex.det) return;
      ex.det.reset();
      ex.det.armed = false;
      ex.lastProgress = 0;
      updateHud(ex.det.status());
      beginCountdown();
    },
    exManual() {
      sendManual();
    },
    exAgain() {
      const { act, toyId } = ex || {};
      cleanup();
      if (!act) return back('training');
      const can = canDoActivity(app.childId, act);
      if (!can.ok) {
        toast(can.reason, { icon: 'schedule' });
        return back('training');
      }
      go('exercise', { id: act.id, toyId }, { replace: true });
    },
    exDone() {
      cleanup();
      back('training');
    },
  },
};

function introHtml(a, target) {
  return `<div class="ex-card ex-intro">
    <canvas class="ex-demo" id="ex-demo" aria-label="Animation af øvelsen" role="img"></canvas>
    <h2>${esc(a.title)}</h2>
    <p class="ex-goal">${target} ${UNIT[a.cam.unit]} · ${a.care ? `pleje · +${a.xp} XP` : `træner ${a.stat === 'alle' ? 'alle evner' : STAT_NAMES[a.stat]?.toLowerCase()}`}</p>
    <p>${esc(TIPS[a.cam.detector] || a.desc || '')}</p>
    <ul class="ex-tips">
      <li>${icon('stay_current_portrait')}Stil iPad'en eller telefonen op, så den står stille</li>
      <li>${icon('accessibility_new')}${a.care ? 'Stil dig 1–2 meter væk, så hoved, arme og mave kan ses' : 'Gå 2–3 meter væk, så hele kroppen kan ses'}</li>
      <li>${icon('light_mode')}Godt lys hjælper kameraet</li>
    </ul>
    ${inPreview() ? `<p class="ex-note">${icon('info')}I forhåndsvisningen her kan kameraet ikke bruges. ${a.care ? 'Brug knappen nedenfor i stedet.' : 'Lav øvelsen, og lad en voksen godkende den.'} Når spillet ligger på jeres egen adresse, virker kameraet.</p>` : ''}
    <button type="button" class="btn btn-lg btn-block" data-act="exStart">${icon('photo_camera')}Start kameraet</button>
    <button type="button" class="link link-light" data-act="exManual">${a.care ? 'Virker kameraet ikke? Gør det uden kamera' : 'Virker kameraet ikke? Lad en voksen godkende'}</button>
    <p class="ex-privacy">${icon('lock')}Videoen bliver på denne enhed og gemmes ikke.</p>
  </div>`;
}

function overlay(html) {
  const el = document.getElementById('ex-overlay');
  if (!el) return;
  el.innerHTML = html;
  el.hidden = !html;
}

function startDemo() {
  const kind = ex?.act?.cam?.detector;
  const canvas = document.getElementById('ex-demo');
  if (!canvas || !kind) return;
  const t0 = performance.now();
  const loop = (t) => {
    if (!ex || ex.state !== 'intro') return;
    drawDemo(canvas, kind, (t - t0) / 1000);
    ex.demoRaf = requestAnimationFrame(loop);
  };
  ex.demoRaf = requestAnimationFrame(loop);
}

async function startCamera() {
  if (!ex) return;
  ex.stopLoop?.();
  stopStream(ex.stream);
  ex.state = 'loading';
  cancelAnimationFrame(ex.demoRaf);
  overlay(`<div class="ex-card ex-loading"><span class="spinner" aria-hidden="true"></span><p>Gør kameraet klar …</p><small>Første gang kan det tage lidt tid</small></div>`);
  const video = document.getElementById('ex-video');
  try {
    const [stream, landmarker] = await Promise.all([openCamera(video, ex.facing), loadPoseLandmarker()]);
    if (!ex) {
      stopStream(stream);
      return;
    }
    ex.stream = stream;
    ex.landmarker = landmarker;
    video.classList.toggle('is-mirrored', ex.facing === 'user');
    document.getElementById('ex-flip').hidden = false;
    try {
      ex.wake = await navigator.wakeLock?.request?.('screen');
    } catch {
      /* skærmlås er valgfri */
    }
    const c = me();
    ex.det = createDetector(ex.act.cam.detector, {
      target: ex.target,
      unit: ex.act.cam.unit,
      difficulty: c?.difficulty || 'normal',
      aspect: video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3,
    });
    ex.state = 'ready';
    ex.visibleSince = null;
    overlay('');
    document.getElementById('ex-hud').hidden = false;
    document.getElementById('ex-controls').hidden = false;
    setHint('Stil dig, så hele kroppen kan ses');
    say('Stil dig, så hele kroppen kan ses.', { interrupt: true });
    ex.lastHint = 'Stil dig, så hele kroppen kan ses';
    ex.lastHintAt = performance.now();
    const words = ['Tre', 'To', 'En', 'Nu!', doneText(), 'Fem sekunder tilbage!', 'Pause.', 'Videre!', 'Gå et par skridt tilbage, så hele kroppen kan ses'];
    if (ex.act.cam.unit === 'reps') for (let i = 1; i < ex.target; i++) words.push(numberWord(i));
    else for (let s = 5; s < ex.target; s += 5) words.push(numberWord(s));
    prefetch(words);
    runLoop();
  } catch (e) {
    console.warn(e);
    if (!ex) return;
    stopStream(ex.stream);
    ex.state = 'error';
    overlay(`<div class="ex-card ex-fail">
      ${icon('videocam_off', 'ex-fail-ic')}
      <h2>Kameraet virker ikke lige nu</h2>
      <p>${esc(inPreview() ? 'Kameraet kan ikke bruges i forhåndsvisningen i Claude. Når spillet ligger på jeres egen adresse (fx Render), tæller kameraet selv.' : explainCameraError(e))}</p>
      <p>${ex?.act?.care ? 'Du kan stadig passe på din figur uden kameraet.' : 'Du kan stadig lave øvelsen. Så skal en voksen bare godkende den bagefter.'}</p>
      <button type="button" class="btn btn-lg btn-block" data-act="exManual">${ex?.act?.care ? `${icon('favorite')}Gør det uden kamera` : `${icon('how_to_reg')}Lad en voksen godkende`}</button>
      <button type="button" class="btn btn-ghost-dark btn-block" data-act="exStart">${icon('refresh')}Prøv kameraet igen</button>
    </div>`);
  }
}

function runLoop() {
  const video = document.getElementById('ex-video');
  const canvas = document.getElementById('ex-canvas');
  ex.stopLoop?.();
  ex.stopLoop = startLoop(video, ex.landmarker, (lm, now) => {
    if (!ex) return;
    const st = ex.det.update(lm, now);
    drawSkeleton(canvas, video, lm, { mirror: ex.facing === 'user', active: st.active, fit: 'contain' });
    if (ex.state === 'ready') {
      // Start nedtællingen, når barnet har været synligt i et sekund
      if (st.visible) {
        ex.visibleSince = ex.visibleSince || now;
        setHint('Super! Gør dig klar …');
        if (now - ex.visibleSince > 900) beginCountdown();
      } else {
        ex.visibleSince = null;
        setHint(st.hint || 'Stil dig, så hele kroppen kan ses');
        speakHint(st.hint || 'Stil dig, så hele kroppen kan ses');
      }
      return;
    }
    if (ex.state === 'active') {
      updateHud(st);
      if (st.done) finish(st);
    }
  });
}

function beginCountdown() {
  if (!ex) return;
  ex.state = 'countdown';
  clearInterval(ex.countTimer);
  let n = 3;
  const show = () => {
    overlay(`<div class="ex-countdown" aria-live="assertive"><b>${n > 0 ? n : 'Nu!'}</b></div>`);
    say(n > 0 ? cap(numberWord(n)) : 'Nu!', { interrupt: true });
  };
  show();
  sfx.beep(false);
  ex.countTimer = setInterval(() => {
    if (!ex) return;
    n--;
    show();
    sfx.beep(n <= 0);
    if (n <= 0) {
      clearInterval(ex.countTimer);
      setTimeout(() => {
        if (!ex || ex.state !== 'countdown') return;
        overlay('');
        ex.det.start();
        ex.lastProgress = 0;
        ex.state = 'active';
        updateHud(ex.det.status());
      }, 500);
    }
  }, 900);
}

function setHint(text) {
  const el = document.getElementById('ex-hint');
  if (el && el.textContent !== (text || '')) el.textContent = text || '';
  if (el) el.hidden = !text;
}

function updateHud(st) {
  const num = document.getElementById('ex-num');
  const meter = document.getElementById('ex-meter');
  if (!num || !meter) return;
  const p = st.progress;
  if (String(p) !== num.textContent) {
    num.textContent = p;
    if (p > ex.lastProgress) {
      const box = document.getElementById('ex-count');
      box?.classList.remove('pop');
      void box?.offsetWidth;
      box?.classList.add('pop');
      sfx.rep(p / st.target);
      speakProgress(p, st);
    }
    ex.lastProgress = p;
  }
  meter.style.height = `${Math.round(st.meter * 100)}%`;
  document.getElementById('ex-hud')?.classList.toggle('is-active', !!st.active);
  setHint(st.hint);
  if (ex.state === 'active') speakHint(st.hint);
}

// Tæller højt: hver gentagelse – eller hvert femte sekund ved øvelser på tid
function speakProgress(p, st) {
  if (p >= st.target) return;
  if (st.unit === 'reps') {
    say(numberWord(p), { interrupt: true });
    return;
  }
  if (st.target >= 15 && p === st.target - 5) say('Fem sekunder tilbage!', { interrupt: true });
  else if (p % 5 === 0) say(numberWord(p), { interrupt: true });
}

function pause() {
  if (!ex) return;
  ex.state = 'paused';
  ex.det.armed = false;
  ex.stopLoop?.();
  const b = document.getElementById('ex-pause');
  if (b) b.innerHTML = `${icon('play_arrow')}Fortsæt`;
  say('Pause.', { interrupt: true });
  overlay(`<div class="ex-card"><h2>Pause</h2><p>Du har ${ex.det.progress} af ${ex.target}. Tryk fortsæt, når du er klar.</p><button type="button" class="btn btn-lg btn-block" data-act="exPause">${icon('play_arrow')}Fortsæt</button></div>`);
}

function resume() {
  if (!ex) return;
  const b = document.getElementById('ex-pause');
  if (b) b.innerHTML = `${icon('pause')}Pause`;
  overlay('');
  say('Videre!', { interrupt: true });
  runLoop();
  ex.det.armed = true;
  ex.state = 'active';
}

function finish(st) {
  if (!ex || ex.state !== 'active') return;
  ex.state = 'done';
  ex.stopLoop?.();
  stopStream(ex.stream);
  document.getElementById('ex-controls').hidden = true;
  if (ex.act.care) return finishCare();
  const r = completeCameraTraining({
    childId: app.childId,
    toyId: ex.toyId,
    activityId: ex.act.id,
    reps: st.count,
    seconds: st.seconds,
  });
  const t = toyById(ex.toyId);
  if (!r.ok) {
    overlay(`<div class="ex-card"><h2>Godt gået!</h2><p>${esc(r.reason)}</p><button type="button" class="btn btn-lg btn-block" data-act="exDone">OK</button></div>`);
    return;
  }
  sfx.win();
  confetti();
  say(`Flot klaret! ${t.name} får ${r.gained} XP.`, { interrupt: true });
  setTimeout(flushCelebrations, 2600);
  const info = levelInfo(t.xp);
  overlay(`<div class="ex-card ex-win">
    <p class="cel-kicker">Flot klaret!</p>
    <div class="ex-win-toy">${toyPhoto(t, 'toy-img')}</div>
    <p class="ex-xp">+${r.gained} XP</p>
    <p>${esc(t.name)} er nu level ${info.level}${info.isMax ? '' : ` · ${info.need - info.into} XP til næste level`}</p>
    <div class="ex-win-btns">
      <button type="button" class="btn btn-ghost-dark" data-act="exAgain">${icon('replay')}Igen</button>
      <button type="button" class="btn" data-act="exDone">${icon('check')}Færdig</button>
    </div>
  </div>`);
}

function finishCare() {
  const t = toyById(ex.toyId);
  const r = doCare({ childId: app.childId, toyId: ex.toyId, actionId: ex.act.care });
  if (!r.ok) {
    overlay(`<div class="ex-card"><h2>Godt gået!</h2><p>${esc(r.reason)}</p><button type="button" class="btn btn-lg btn-block" data-act="exDone">OK</button></div>`);
    return;
  }
  sfx.care();
  confetti({ count: 70 });
  say(`${r.msg}${r.gained ? ` ${t.name} får ${r.gained} XP.` : ''}`, { interrupt: true });
  setTimeout(flushCelebrations, 2200);
  overlay(`<div class="ex-card ex-win">
    <p class="cel-kicker">${esc(r.msg)}</p>
    <div class="ex-win-toy">${toyPhoto(t, 'toy-img')}</div>
    ${r.gained ? `<p class="ex-xp">+${r.gained} XP</p>` : '<p>Dagens pleje-XP er brugt – men den elskede det!</p>'}
    <button type="button" class="btn btn-lg btn-block" data-act="exDone">${icon('check')}Færdig</button>
  </div>`);
}

async function sendManual() {
  if (!ex) return;
  if (ex.act.care) {
    const r = doCare({ childId: app.childId, toyId: ex.toyId, actionId: ex.act.care });
    if (!r.ok) {
      toast(r.reason, { icon: 'schedule' });
      return;
    }
    sfx.care();
    toast(r.msg, { icon: 'favorite', tone: 'mint' });
    cleanup();
    say(r.msg);
    back('care');
    return;
  }
  const r = await submitActivity({ childId: app.childId, toyId: ex.toyId, activityId: ex.act.id, photos: [], via: 'manual' });
  if (!r.ok) {
    toast(r.reason, { icon: 'error', tone: 'coral' });
    return;
  }
  sfx.coin();
  toast('Sendt til en voksen. Lav øvelsen, så godkender de den.', { icon: 'how_to_reg', tone: 'mint', ms: 4000 });
  cleanup();
  say('Sendt til en voksen. Lav øvelsen, så godkender de den.');
  back('training');
}

// Til tests og fejlfinding
globalThis.__LL_DEMO_LM__ = demoLandmarks;
