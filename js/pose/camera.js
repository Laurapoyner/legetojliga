// Kamera + MediaPipe Pose Landmarker. Alt kører lokalt på enheden – der gemmes ingen video.

import { SKELETON } from './counters.js';

const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_MODULES = [`${MP_BASE}/vision_bundle.mjs`, `${MP_BASE}/+esm`];
const MP_WASM = `${MP_BASE}/wasm`;
const MP_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerPromise = null;

export function loadPoseLandmarker() {
  // Bruges af de automatiske tests til at give en falsk kropsregistrering
  if (globalThis.__LL_TEST_LANDMARKER__) return Promise.resolve(globalThis.__LL_TEST_LANDMARKER__);
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      let vision = null;
      for (const url of MP_MODULES) {
        try {
          vision = await import(/* @vite-ignore */ url);
          break;
        } catch (e) {
          console.warn('MediaPipe kunne ikke hentes fra', url, e);
        }
      }
      if (!vision) throw Object.assign(new Error('model'), { code: 'model' });
      const fileset = await vision.FilesetResolver.forVisionTasks(MP_WASM);
      const make = (delegate) =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MP_MODEL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        return await make('GPU');
      } catch (e) {
        console.warn('GPU virkede ikke, prøver CPU', e);
        return await make('CPU');
      }
    })().catch((e) => {
      landmarkerPromise = null;
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { code: e?.code || 'model' });
    });
  }
  return landmarkerPromise;
}

export function cameraSupported() {
  return !!(globalThis.isSecureContext !== false && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function openCamera(video, facing = 'user') {
  if (!cameraSupported()) throw Object.assign(new Error('unsupported'), { name: 'Unsupported' });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.muted = true;
  video.setAttribute('playsinline', '');
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise((resolve) => {
    if (video.videoWidth) return resolve();
    const done = () => resolve();
    video.addEventListener('loadedmetadata', done, { once: true });
    setTimeout(done, 3000);
  });
  return stream;
}

export function stopStream(stream) {
  try {
    stream?.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignorer */
  }
}

export function explainCameraError(e) {
  const name = e?.name || '';
  if (e?.code === 'model') {
    return 'Bevægelsesregistreringen kunne ikke hentes. Tjek internetforbindelsen og prøv igen.';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return 'Kameraet fik ikke lov til at starte. Giv adgang til kameraet i browseren og prøv igen.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') {
    return 'Der blev ikke fundet et kamera på denne enhed.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kameraet bruges af en anden app lige nu. Luk den og prøv igen.';
  }
  if (name === 'Unsupported') {
    return 'Kameraet kan ikke bruges i denne visning. Åbn spillet på jeres egen adresse (https) for at bruge kameraet.';
  }
  return 'Kameraet kunne ikke starte.';
}

export function startLoop(video, landmarker, onFrame) {
  let raf = 0;
  let running = true;
  let lastVideoTime = -1;
  const tick = () => {
    if (!running) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      let lm = null;
      try {
        const res = landmarker.detectForVideo(video, now);
        lm = res?.landmarks?.[0] || null;
      } catch (e) {
        console.warn(e);
      }
      onFrame(lm, now);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(raf);
  };
}

// Tegner skelettet oven på videoen (vist med object-fit: contain eller cover).
export function drawSkeleton(canvas, video, lm, { mirror = true, active = false, color = '#FFD23F', dim = '#ffffff', fit = 'cover' } = {}) {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const cw = canvas.clientWidth;
  const ch = canvas.clientHeight;
  if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if (!lm || !video.videoWidth) return;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const scale = fit === 'contain' ? Math.min(cw / vw, ch / vh) : Math.max(cw / vw, ch / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  const pt = (q) => {
    let x = ox + q.x * dw;
    if (mirror) x = cw - x;
    return [x, oy + q.y * dh];
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, cw / 90);
  ctx.strokeStyle = active ? color : dim;
  ctx.globalAlpha = 0.9;
  for (const [a, b] of SKELETON) {
    if (!lm[a] || !lm[b] || (lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
    const [x1, y1] = pt(lm[a]);
    const [x2, y2] = pt(lm[b]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.fillStyle = active ? color : dim;
  for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
    if (!lm[i] || (lm[i].visibility ?? 1) < 0.4) continue;
    const [x, y] = pt(lm[i]);
    ctx.beginPath();
    ctx.arc(x, y, i === 0 ? ctx.lineWidth * 1.6 : ctx.lineWidth * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
