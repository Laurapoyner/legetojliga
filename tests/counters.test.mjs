// Tester bevægelsestællerne med en syntetisk "pindemand", der laver øvelserne.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDetector } from '../js/pose/counters.js';

const ASPECT = 4 / 3;
const CX = 0.5 * ASPECT;

function makeRnd(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Laver 33 kropspunkter. Alle mål er i "billedhøjder".
function figure(o = {}, rnd = makeRnd()) {
  const {
    arms = 'down', armsL, armsR, spread = 0, squat = 0, kneeL = 0, kneeR = 0, jump = 0,
    footL = 0, footR = 0, dx = 0, dy = 0, noise = 0.003, wiggle = null,
  } = o;
  const P = new Array(33).fill(null).map(() => ({ x: CX, y: 0.5, visibility: 0.95 }));
  const set = (i, x, y) => {
    P[i] = { x: x, y: y, visibility: 0.95 };
  };
  const sq = squat * 0.13;
  const up = jump;
  set(0, CX, 0.18 + sq - up);
  for (const [side, sgn] of [['L', -1], ['R', 1]]) {
    const iS = side === 'L' ? 11 : 12;
    const iE = side === 'L' ? 13 : 14;
    const iW = side === 'L' ? 15 : 16;
    const iH = side === 'L' ? 23 : 24;
    const iK = side === 'L' ? 25 : 26;
    const iA = side === 'L' ? 27 : 28;
    const iF = side === 'L' ? 31 : 32;
    const armPose = (side === 'L' ? armsL : armsR) ?? arms;
    set(iS, CX + sgn * 0.07, 0.28 + sq - up);
    if (armPose === 'up') {
      set(iE, CX + sgn * 0.12, 0.16 + sq - up);
      set(iW, CX + sgn * 0.14, 0.04 + sq - up);
    } else if (armPose === 'v') {
      set(iE, CX + sgn * 0.12, 0.17 + sq - up);
      set(iW, CX + sgn * 0.18, 0.06 + sq - up);
    } else if (armPose === 'out') {
      set(iE, CX + sgn * 0.2, 0.28 + sq - up);
      set(iW, CX + sgn * 0.33, 0.28 + sq - up);
    } else if (armPose === 'shoulder') {
      set(iE, CX + sgn * 0.12, 0.3 + sq - up);
      set(iW, CX + sgn * 0.16, 0.27 + sq - up);
    } else {
      set(iE, CX + sgn * 0.09, 0.4 + sq - up);
      set(iW, CX + sgn * 0.1, 0.52 + sq - up);
    }
    const knee = side === 'L' ? kneeL : kneeR;
    const foot = side === 'L' ? footL : footR;
    set(iH, CX + sgn * 0.05, 0.52 + sq - up);
    set(iK, CX + sgn * (0.05 + spread * 0.05 + squat * 0.03), 0.68 - knee * 0.16 - foot * 0.5 - up);
    set(iA, CX + sgn * (0.05 + spread * 0.1), 0.86 - knee * 0.2 - foot - up);
    set(side === 'L' ? 29 : 30, P[iA].x, P[iA].y + 0.01);
    set(iF, P[iA].x + sgn * 0.02, P[iA].y + 0.015);
  }
  if (wiggle) wiggle(P);
  return P.map((p) => ({
    x: (p.x + dx + (rnd() - 0.5) * 2 * noise) / ASPECT,
    y: p.y + dy + (rnd() - 0.5) * 2 * noise,
    visibility: p.visibility,
  }));
}

function run(det, frames, fps = 30) {
  let t = 1000;
  let st;
  for (const f of frames) {
    st = det.update(f, t);
    t += 1000 / fps;
  }
  return st;
}

const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

function cycle(a, b, nA = 8, nB = 8, steps = 4, mix) {
  const out = [];
  for (let i = 0; i < nA; i++) out.push(a);
  for (let i = 1; i <= steps; i++) out.push(mix(i / (steps + 1)));
  for (let i = 0; i < nB; i++) out.push(b);
  for (let i = 1; i <= steps; i++) out.push(mix(1 - i / (steps + 1)));
  return out;
}

function armed(name, target, unit = 'reps', difficulty = 'normal') {
  const d = createDetector(name, { target, unit, difficulty, aspect: ASPECT });
  d.start();
  return d;
}

test('sprællemænd: 15 hele bevægelser giver 15', () => {
  const rnd = makeRnd(1);
  const d = armed('jumpingJack', 15);
  const frames = [];
  for (let k = 0; k < 15; k++) {
    frames.push(
      ...cycle(null, null, 8, 8, 3, () => null).map((_, i, arr) => {
        const n = arr.length;
        const phase = i < 8 ? 0 : i < 11 ? (i - 7) / 4 : i < 19 ? 1 : 1 - (i - 18) / 4;
        return figure({ arms: phase > 0.5 ? 'up' : phase > 0.2 ? 'shoulder' : 'down', spread: phase }, rnd);
      }),
    );
  }
  frames.push(...repeat(10, () => figure({}, rnd)));
  const st = run(d, frames);
  assert.equal(st.count, 15);
  assert.equal(st.done, true);
});

test('sprællemænd: arme kun til skulderhøjde tæller ikke', () => {
  const rnd = makeRnd(2);
  const d = armed('jumpingJack', 15);
  const frames = [];
  for (let k = 0; k < 10; k++) {
    frames.push(...repeat(8, () => figure({}, rnd)), ...repeat(8, () => figure({ arms: 'shoulder', spread: 1 }, rnd)));
  }
  assert.equal(run(d, frames).count, 0);
});

test('sprællemænd på let: kun armene tæller', () => {
  const rnd = makeRnd(3);
  const d = armed('jumpingJack', 9, 'reps', 'let');
  const frames = [];
  for (let k = 0; k < 9; k++) frames.push(...repeat(8, () => figure({}, rnd)), ...repeat(8, () => figure({ arms: 'up' }, rnd)));
  frames.push(...repeat(6, () => figure({}, rnd)));
  assert.equal(run(d, frames).count, 9);
});

test('før start tælles der ikke', () => {
  const rnd = makeRnd(4);
  const d = createDetector('jumpingJack', { target: 15, aspect: ASPECT });
  const frames = [];
  for (let k = 0; k < 5; k++) frames.push(...repeat(8, () => figure({}, rnd)), ...repeat(8, () => figure({ arms: 'up', spread: 1 }, rnd)));
  assert.equal(run(d, frames).count, 0);
});

test('squats: 10 dybe squats giver 10, halve squats giver 0', () => {
  const rnd = makeRnd(5);
  const d = armed('squat', 10);
  const frames = [];
  for (let k = 0; k < 10; k++) {
    for (let i = 0; i <= 10; i++) frames.push(figure({ squat: i / 10 }, rnd));
    for (let i = 10; i >= 0; i--) frames.push(figure({ squat: i / 10 }, rnd));
    frames.push(...repeat(6, () => figure({}, rnd)));
  }
  assert.equal(run(d, frames).count, 10);

  const d2 = armed('squat', 10);
  const shallow = [];
  for (let k = 0; k < 10; k++) {
    for (let i = 0; i <= 6; i++) shallow.push(figure({ squat: (i / 6) * 0.3 }, rnd));
    for (let i = 6; i >= 0; i--) shallow.push(figure({ squat: (i / 6) * 0.3 }, rnd));
  }
  assert.equal(run(d2, shallow).count, 0);
});

test('høje knæløft: skiftevis 20 løft giver 20, squats giver 0', () => {
  const rnd = makeRnd(6);
  const d = armed('highKnees', 20);
  const frames = [...repeat(8, () => figure({}, rnd))];
  for (let k = 0; k < 20; k++) {
    const key = k % 2 ? 'kneeR' : 'kneeL';
    for (let i = 0; i <= 5; i++) frames.push(figure({ [key]: i / 5 }, rnd));
    for (let i = 5; i >= 0; i--) frames.push(figure({ [key]: i / 5 }, rnd));
  }
  assert.equal(run(d, frames).count, 20);

  const d2 = armed('highKnees', 20);
  const sq = [];
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i <= 10; i++) sq.push(figure({ squat: i / 10 }, rnd));
    for (let i = 10; i >= 0; i--) sq.push(figure({ squat: i / 10 }, rnd));
  }
  assert.equal(run(d2, sq).count, 0);
});

test('hop: 20 hop giver 20, squats giver 0', () => {
  const rnd = makeRnd(7);
  const d = armed('jump', 20);
  const frames = [...repeat(10, () => figure({}, rnd))];
  for (let k = 0; k < 20; k++) {
    const hs = [0.02, 0.04, 0.055, 0.06, 0.055, 0.04, 0.02];
    for (const h of hs) frames.push(figure({ jump: h }, rnd));
    frames.push(...repeat(6, () => figure({}, rnd)));
  }
  assert.equal(run(d, frames).count, 20);

  const d2 = armed('jump', 20);
  const sq = [...repeat(10, () => figure({}, rnd))];
  for (let k = 0; k < 6; k++) {
    for (let i = 0; i <= 10; i++) sq.push(figure({ squat: i / 10 }, rnd));
    for (let i = 10; i >= 0; i--) sq.push(figure({ squat: i / 10 }, rnd));
  }
  assert.equal(run(d2, sq).count, 0);
});

test('stå på ét ben: tid tæller kun med foden løftet', () => {
  const rnd = makeRnd(8);
  const d = armed('oneLeg', 30, 'sec');
  const st = run(d, [...repeat(30, () => figure({}, rnd)), ...repeat(31 * 30, () => figure({ footL: 0.1 }, rnd))]);
  assert.equal(st.done, true);
  const d2 = armed('oneLeg', 30, 'sec');
  const st2 = run(d2, repeat(40 * 30, () => figure({}, rnd)));
  assert.ok(st2.seconds < 1, `stod på to ben, men fik ${st2.seconds} sek.`);
});

test('superhelte-positur og flyvemaskine kræver den rigtige positur', () => {
  const rnd = makeRnd(9);
  const hero = armed('heroPose', 15, 'sec');
  assert.equal(run(hero, repeat(16 * 30, () => figure({ arms: 'v' }, rnd))).done, true);
  const hero2 = armed('heroPose', 15, 'sec');
  assert.ok(run(hero2, repeat(16 * 30, () => figure({ arms: 'out' }, rnd))).seconds < 1);
  const fly = armed('airplane', 20, 'sec');
  assert.equal(run(fly, repeat(21 * 30, () => figure({ arms: 'out' }, rnd))).done, true);
  const fly2 = armed('airplane', 20, 'sec');
  assert.ok(run(fly2, repeat(21 * 30, () => figure({ arms: 'v' }, rnd))).seconds < 1);
});

test('dans: bevægelse fylder måleren, stilstand gør ikke', () => {
  const rnd = makeRnd(10);
  const d = armed('dance', 60, 'sec');
  const frames = repeat(64 * 30, (i) => {
    const t = i / 30;
    const a = Math.sin(t * 2 * Math.PI * 1.6);
    const b = Math.cos(t * 2 * Math.PI * 1.1);
    return figure(
      {
        arms: a > 0.3 ? 'up' : a < -0.3 ? 'down' : 'out',
        squat: Math.max(0, b) * 0.4,
        dx: a * 0.03,
      },
      rnd,
    );
  });
  assert.equal(run(d, frames).done, true);
  const still = armed('dance', 60, 'sec');
  assert.ok(run(still, repeat(30 * 30, () => figure({}, rnd))).seconds < 2);
});

test('løb på stedet: skiftevis ben tæller, hop og stilstand tæller ikke', () => {
  const rnd = makeRnd(11);
  const d = armed('run', 30, 'sec');
  const frames = repeat(33 * 30, (i) => {
    const s = Math.sin((i / 30) * 2 * Math.PI * 2.5);
    return figure({ kneeL: Math.max(0, s) * 0.5, kneeR: Math.max(0, -s) * 0.5 }, rnd);
  });
  assert.equal(run(d, frames).done, true);
  const still = armed('run', 30, 'sec');
  assert.ok(run(still, repeat(20 * 30, () => figure({}, rnd))).seconds < 1);
  const hop = armed('run', 30, 'sec');
  const hops = repeat(20 * 30, (i) => figure({ jump: Math.max(0, Math.sin((i / 30) * 2 * Math.PI * 2)) * 0.05 }, rnd));
  assert.ok(run(hop, hops).seconds < 2, 'hop er ikke løb');
});

test('ingen person i billedet giver en hjælpetekst', () => {
  const d = armed('squat', 10);
  const st = run(d, repeat(10, () => null));
  assert.equal(st.count, 0);
  assert.match(st.hint, /kan ikke se dig/);
  const d2 = armed('squat', 10);
  const rnd = makeRnd(12);
  const cut = repeat(10, () => figure({}, rnd).map((p, i) => (i >= 25 ? { ...p, visibility: 0.1 } : p)));
  assert.match(run(d2, cut).hint, /hele kroppen/);
});
