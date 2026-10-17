// Bevægelsesregistrering ovenpå MediaPipe Pose (33 kropspunkter pr. billede).
// Hver detektor får kropspunkterne for ét billede ad gangen og tæller gentagelser
// eller sekunder ud fra rigtige bevægelsesmønstre – ikke en timer.
//
// Koordinater fra MediaPipe er normaliserede (0–1) i forhold til billedets bredde og højde.
// Vi ganger x med billedets format, så afstande måles i samme enhed på begge akser.

export const LM = {
  nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const FULL_BODY = [11, 12, 23, 24, 25, 26, 27, 28];
const UPPER_BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24];

const HINT_NO_POSE = 'Jeg kan ikke se dig – stil dig foran kameraet';
const HINT_FULL = 'Gå et par skridt tilbage, så hele kroppen kan ses';
const HINT_UPPER = 'Stil dig, så hoved, arme og hofter kan ses';

class Detector {
  constructor({ target, unit = 'reps', difficulty = 'normal', aspect = 4 / 3 } = {}) {
    this.target = target;
    this.unit = unit;
    this.diff = difficulty;
    this.aspect = aspect;
    this.armed = false;
    this.p = null;
    this.reset();
  }

  // Nulstiller tællingen men beholder kalibreringen af kroppen
  reset() {
    this.count = 0;
    this.seconds = 0;
    this.phase = 'wait';
    this.frames = 0;
    this.lastT = null;
    this.lastRepT = -1e9;
    this.meter = 0;
    this.hint = null;
    this.active = false;
  }

  start() {
    this.reset();
    this.armed = true;
  }

  get done() {
    return this.progress >= this.target;
  }

  get progress() {
    return this.unit === 'sec' ? Math.floor(this.seconds) : this.count;
  }

  prep(lm) {
    if (!lm || lm.length < 29) {
      this.p = null;
      return null;
    }
    const a = this.aspect;
    if (!this.p) {
      this.p = lm.map((q) => ({ x: q.x * a, y: q.y, v: q.visibility ?? 1 }));
    } else {
      const k = 0.6;
      for (let i = 0; i < lm.length; i++) {
        const s = this.p[i];
        const q = lm[i];
        s.x += k * (q.x * a - s.x);
        s.y += k * (q.y - s.y);
        s.v = q.visibility ?? 1;
      }
    }
    return this.p;
  }

  visible(p, idx, min = 0.5) {
    return idx.every((i) => p[i] && p[i].v >= min && p[i].y > -0.05 && p[i].y < 1.05);
  }

  dt(t) {
    const d = this.lastT == null ? 0 : clamp((t - this.lastT) / 1000, 0, 0.25);
    this.lastT = t;
    return d;
  }

  // Kaldes for hvert billede. lm = 33 punkter eller null, t = tid i millisekunder.
  update(lm, t) {
    const p = this.prep(lm);
    const dt = this.dt(t);
    this.seen = false;
    if (!p) {
      this.hint = HINT_NO_POSE;
      this.active = false;
      return this.status();
    }
    const req = this.required();
    if (!this.visible(p, req)) {
      this.hint = req === UPPER_BODY ? HINT_UPPER : HINT_FULL;
      this.active = false;
      return this.status();
    }
    this.seen = true;
    this.hint = null;
    this.step(p, t, dt);
    return this.status();
  }

  // Gentagelse tælles kun, når tælleren er startet, og der er gået lidt tid siden sidst
  rep(t, minGap = 250) {
    if (!this.armed) return false;
    if (t - this.lastRepT < minGap) return false;
    this.lastRepT = t;
    this.count++;
    return true;
  }

  addTime(dt) {
    if (this.armed) this.seconds += dt;
  }

  required() {
    return FULL_BODY;
  }

  status() {
    return {
      count: this.count,
      seconds: this.seconds,
      progress: Math.min(this.progress, this.target),
      target: this.target,
      unit: this.unit,
      done: this.armed && this.done,
      hint: this.hint,
      meter: this.meter,
      active: this.active,
      phase: this.phase,
      visible: !!this.seen,
    };
  }

  // Debounce: en tilstand skal holde i mindst to billeder i træk
  hold(flag, key) {
    this[key] = flag ? (this[key] || 0) + 1 : 0;
    return this[key] >= 2;
  }

  // Skift fase og nulstil debounce-tællerne
  go(phase) {
    this.phase = phase;
    for (const k of Object.keys(this)) if (k.startsWith('_')) this[k] = 0;
  }
}

// ---------- Sprællemænd ----------
export class JumpingJack extends Detector {
  required() {
    return this.diff === 'let' ? [11, 12, 15, 16, 23, 24] : [11, 12, 15, 16, 23, 24, 27, 28];
  }
  step(p) {
    const sh = mid(p[11], p[12]);
    const hip = mid(p[23], p[24]);
    const torso = Math.max(0.05, dist(sh, hip));
    const shoulderW = Math.max(0.03, Math.abs(p[11].x - p[12].x));
    const upK = this.diff === 'svaer' ? 0.45 : this.diff === 'let' ? 0.05 : 0.15;
    const lUp = p[15].y < p[11].y - upK * torso;
    const rUp = p[16].y < p[12].y - upK * torso;
    const lDown = p[15].y > p[11].y + 0.3 * torso;
    const rDown = p[16].y > p[12].y + 0.3 * torso;
    const useLegs = this.diff !== 'let';
    const ankleW = useLegs ? Math.abs(p[27].x - p[28].x) : 0;
    const openK = this.diff === 'svaer' ? 1.4 : 1.15;
    const legsOpen = ankleW > openK * shoulderW;
    const legsClosed = ankleW < 1.0 * shoulderW;
    const open = lUp && rUp && (!useLegs || legsOpen);
    const closed = lDown && rDown && (!useLegs || legsClosed);
    const wristY = (p[15].y + p[16].y) / 2;
    this.meter = clamp((sh.y + 0.3 * torso - wristY) / (0.9 * torso), 0, 1);
    this.active = this.phase === 'open' || open;
    if (this.phase === 'wait') {
      if (this.hold(closed, '_c')) this.go('closed');
      else this.hint = 'Start med armene nede og samlede ben';
    } else if (this.phase === 'closed') {
      if (this.hold(open, '_o')) this.go('open');
    } else if (this.phase === 'open') {
      if (this.hold(closed, '_c')) {
        this.go('closed');
        this.rep(this.lastT);
      }
    }
  }
}

// ---------- Squats ----------
export class Squat extends Detector {
  step(p) {
    const hipY = (p[23].y + p[24].y) / 2;
    const kneeY = (p[25].y + p[26].y) / 2;
    const ankleY = (p[27].y + p[28].y) / 2;
    const shin = Math.max(0.02, ankleY - kneeY);
    const ratio = (kneeY - hipY) / shin;
    this.base = this.base == null ? ratio : Math.max(ratio, this.base * 0.998);
    const downK = this.diff === 'svaer' ? 0.42 : this.diff === 'let' ? 0.7 : 0.55;
    const down = ratio < downK * this.base;
    const up = ratio > 0.85 * this.base;
    this.meter = clamp((this.base - ratio) / (this.base * (1 - downK)), 0, 1);
    this.active = this.phase === 'down';
    if (this.phase === 'wait') {
      if (this.hold(up, '_u')) this.go('up');
      else this.hint = 'Stil dig helt op for at starte';
    } else if (this.phase === 'up') {
      if (this.hold(down, '_d')) this.go('down');
    } else if (this.phase === 'down') {
      if (this.hold(up, '_u')) {
        this.go('up');
        this.rep(this.lastT, 400);
      }
    }
  }
}

// ---------- Høje knæløft (tæller hvert knæ) ----------
export class HighKnees extends Detector {
  reset() {
    super.reset();
    this.legs = { l: 'down', r: 'down' };
  }
  step(p) {
    const lThigh = p[25].y - p[23].y;
    const rThigh = p[26].y - p[24].y;
    this.ref = this.ref == null ? Math.max(lThigh, rThigh) : Math.max(lThigh, rThigh, this.ref * 0.999);
    const ref = Math.max(0.03, this.ref);
    const upK = this.diff === 'svaer' ? 0.35 : this.diff === 'let' ? 0.7 : 0.55;
    const lift = { l: lThigh / ref, r: rThigh / ref };
    const isUp = (s) => lift[s] < upK;
    const isDown = (s) => lift[s] > 0.8;
    this.meter = clamp((1 - Math.min(lift.l, lift.r)) / (1 - upK), 0, 1);
    this.active = this.legs.l === 'up' || this.legs.r === 'up';
    this.phase = 'go';
    for (const [s, o] of [['l', 'r'], ['r', 'l']]) {
      if (this.legs[s] === 'down') {
        // Kun ét knæ ad gangen – ellers er det en squat eller et hop
        if (isUp(s) && isDown(o)) this.legs[s] = 'up';
      } else if (isDown(s)) {
        this.legs[s] = 'down';
        this.rep(this.lastT, 150);
      }
    }
  }
}

// ---------- Hop på stedet ----------
export class Jump extends Detector {
  step(p) {
    const hipY = (p[23].y + p[24].y) / 2;
    const lA = p[27].y;
    const rA = p[28].y;
    const ankleY = (lA + rA) / 2;
    const legLen = Math.max(0.05, ankleY - hipY);
    this.leg = this.leg == null ? legLen : Math.max(legLen, this.leg * 0.995);
    if (this.ground == null) this.ground = ankleY;
    const upK = this.diff === 'svaer' ? 0.11 : this.diff === 'let' ? 0.05 : 0.075;
    const liftL = (this.ground - lA) / this.leg;
    const liftR = (this.ground - rA) / this.leg;
    const lift = (liftL + liftR) / 2;
    const air = lift > upK && Math.min(liftL, liftR) > upK * 0.6;
    const landed = lift < upK * 0.35;
    this.meter = clamp(lift / (upK * 2), 0, 1);
    this.active = this.phase === 'air';
    if (this.phase !== 'air') {
      // Jorden følger med, så længe barnet står stille på jorden
      if (lift < upK * 0.5) this.ground += 0.15 * (ankleY - this.ground);
      if (this.hold(air, '_a')) this.go('air');
      else if (this.phase === 'wait') this.phase = 'ground';
    } else if (this.hold(landed, '_l')) {
      this.go('ground');
      this.rep(this.lastT, 200);
    }
  }
}

// ---------- Stå på ét ben ----------
export class OneLeg extends Detector {
  step(p, t, dt) {
    const legL = p[27].y - p[23].y;
    const legR = p[28].y - p[24].y;
    this.leg = this.leg == null ? Math.max(legL, legR) : Math.max(legL, legR, this.leg * 0.999);
    const leg = Math.max(0.05, this.leg);
    const diffAnkle = Math.abs(p[27].y - p[28].y) / leg;
    const k = this.diff === 'svaer' ? 0.16 : this.diff === 'let' ? 0.08 : 0.12;
    const lifted = diffAnkle > k;
    this.meter = clamp(diffAnkle / (k * 2), 0, 1);
    if (lifted) this.lastOk = t;
    const holding = lifted || (this.lastOk != null && t - this.lastOk < 350);
    this.active = holding;
    this.phase = holding ? 'hold' : 'down';
    if (holding) this.addTime(dt);
    else this.hint = 'Løft den ene fod fra gulvet';
  }
}

// ---------- Hold en positur (superhelt eller flyvemaskine) ----------
class HoldPose extends Detector {
  required() {
    return UPPER_BODY;
  }
  step(p, t, dt) {
    const ok = this.pose(p);
    if (ok) this.lastOk = t;
    const holding = ok || (this.lastOk != null && t - this.lastOk < 300);
    this.active = holding;
    this.phase = holding ? 'hold' : 'off';
    if (holding) this.addTime(dt);
    else this.hint = this.offHint;
  }
}

export class HeroPose extends HoldPose {
  get offHint() {
    return 'Armene op i et stort V!';
  }
  pose(p) {
    const shoulderW = Math.max(0.03, Math.abs(p[11].x - p[12].x));
    const above = p[15].y < p[0].y && p[16].y < p[0].y;
    const wideK = this.diff === 'let' ? 0.9 : this.diff === 'svaer' ? 1.6 : 1.25;
    const wide = Math.abs(p[15].x - p[16].x) > wideK * shoulderW;
    const straight = this.diff !== 'svaer' || (p[13].y < p[11].y && p[14].y < p[12].y);
    const height = ((p[11].y + p[12].y) / 2 - (p[15].y + p[16].y) / 2) / Math.max(0.05, shoulderW * 2);
    this.meter = clamp(height, 0, 1);
    return above && wide && straight;
  }
}

export class Airplane extends HoldPose {
  get offHint() {
    return 'Stræk armene helt ud til siden';
  }
  pose(p) {
    const sh = mid(p[11], p[12]);
    const hip = mid(p[23], p[24]);
    const torso = Math.max(0.05, dist(sh, hip));
    const shoulderW = Math.max(0.03, Math.abs(p[11].x - p[12].x));
    const level = Math.abs(p[15].y - p[11].y) < 0.35 * torso && Math.abs(p[16].y - p[12].y) < 0.35 * torso;
    const elbows = Math.abs(p[13].y - p[11].y) < 0.3 * torso && Math.abs(p[14].y - p[12].y) < 0.3 * torso;
    const spanK = this.diff === 'let' ? 2.1 : this.diff === 'svaer' ? 3.0 : 2.5;
    const span = Math.abs(p[15].x - p[16].x) / shoulderW;
    this.meter = clamp(span / spanK, 0, 1);
    return level && elbows && span > spanK;
  }
}

// ---------- Dans (bevægelsesenergi) ----------
// Bevægelse måles over et kvart sekund ad gangen, så små rystelser i registreringen ikke tæller.
function windowMove(self, p, t, keys, scale) {
  self.hist = (self.hist || []).filter((h) => t - h.t < 700);
  self.hist.push({ t, pts: keys.map((i) => ({ x: p[i].x, y: p[i].y, v: p[i].v })) });
  let old = null;
  for (const h of self.hist) {
    if (t - h.t >= 240) old = h;
  }
  if (!old) return null;
  const span = (t - old.t) / 1000;
  let move = 0;
  keys.forEach((i, k) => {
    const a = old.pts[k];
    const b = p[i];
    if (a.v >= 0.5 && b.v >= 0.5) move += Math.hypot(b.x - a.x, b.y - a.y);
  });
  return move / scale / span;
}

export class Dance extends Detector {
  required() {
    return [0, 11, 12, 15, 16, 23, 24];
  }
  step(p, t, dt) {
    const sh = mid(p[11], p[12]);
    const hip = mid(p[23], p[24]);
    const torso = Math.max(0.05, dist(sh, hip));
    const move = windowMove(this, p, t, [0, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28], torso);
    if (move != null) this.energy = this.energy == null ? move : this.energy + 0.2 * (move - this.energy);
    const thr = this.diff === 'let' ? 1.5 : this.diff === 'svaer' ? 3.2 : 2.2;
    const e = this.energy || 0;
    this.meter = clamp(e / (thr * 2), 0, 1);
    const moving = e > thr;
    if (moving) this.lastOk = t;
    const holding = moving || (this.lastOk != null && t - this.lastOk < 400);
    this.active = holding;
    this.phase = holding ? 'dance' : 'still';
    if (holding) this.addTime(dt);
    else this.hint = 'Bevæg dig mere – dans med hele kroppen!';
  }
}

// ---------- Løb på stedet (skiftevis knæ) ----------
export class Run extends Detector {
  step(p, t, dt) {
    const hipY = (p[23].y + p[24].y) / 2;
    const ankleY = (p[27].y + p[28].y) / 2;
    const leg = Math.max(0.05, ankleY - hipY);
    const move = windowMove(this, p, t, [25, 26, 27, 28], leg);
    if (move != null) this.energy = this.energy == null ? move : this.energy + 0.25 * (move - this.energy);
    // Skiftevis: hvilket knæ er højest? Tæl skift.
    const side = p[25].y < p[26].y ? 'l' : 'r';
    const gap = Math.abs(p[25].y - p[26].y) / leg;
    if (gap > 0.06 && side !== this.side) {
      this.side = side;
      this.swaps = (this.swaps || []).filter((x) => t - x < 1500);
      this.swaps.push(t);
    }
    const recent = (this.swaps || []).filter((x) => t - x < 1500).length;
    const thr = this.diff === 'let' ? 0.7 : this.diff === 'svaer' ? 1.6 : 1.1;
    const e = this.energy || 0;
    this.meter = clamp(e / (thr * 2), 0, 1);
    const running = e > thr && recent >= 2;
    if (running) this.lastOk = t;
    const holding = running || (this.lastOk != null && t - this.lastOk < 400);
    this.active = holding;
    this.phase = holding ? 'run' : 'still';
    if (holding) this.addTime(dt);
    else this.hint = 'Løb på stedet – løft fødderne skiftevis';
  }
}

export const DETECTORS = {
  jumpingJack: JumpingJack,
  squat: Squat,
  highKnees: HighKnees,
  jump: Jump,
  oneLeg: OneLeg,
  heroPose: HeroPose,
  airplane: Airplane,
  dance: Dance,
  run: Run,
};

export function createDetector(name, opts) {
  const C = DETECTORS[name];
  if (!C) throw new Error(`Ukendt øvelse: ${name}`);
  return new C(opts);
}

// Forbindelser mellem kropspunkter, når skelettet tegnes oven på videoen
export const SKELETON = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
];
