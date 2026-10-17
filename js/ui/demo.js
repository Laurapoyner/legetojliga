// Eksempel-familie med tegnede figurer, så man kan prøve spillet med det samme.

import * as A from '../actions.js';
import { levelInfo } from '../rules.js';

function canvas(size = 480) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')];
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

function eyes(g, x, y, gap, r) {
  for (const dx of [-gap, gap]) {
    g.fillStyle = '#1E1940';
    g.beginPath();
    g.arc(x + dx, y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x + dx - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
    g.fill();
  }
}

function smile(g, x, y, w) {
  g.strokeStyle = '#1E1940';
  g.lineWidth = w / 6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(x, y, w, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
}

function backdrop(g, s, a, b) {
  const grd = g.createLinearGradient(0, 0, s, s);
  grd.addColorStop(0, a);
  grd.addColorStop(1, b);
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    g.arc((i * 97) % s, (i * 53) % s, 6 + (i % 4) * 3, 0, Math.PI * 2);
    g.fill();
  }
}

const ART = {
  bear(g, s) {
    backdrop(g, s, '#FFE3A3', '#FFC2A8');
    const cx = s / 2;
    g.fillStyle = '#A0643A';
    for (const dx of [-110, 110]) {
      g.beginPath();
      g.arc(cx + dx, 130, 55, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#E9B48A';
    for (const dx of [-110, 110]) {
      g.beginPath();
      g.arc(cx + dx, 130, 28, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#A0643A';
    g.beginPath();
    g.ellipse(cx, 260, 150, 140, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#E9B48A';
    g.beginPath();
    g.ellipse(cx, 310, 72, 58, 0, 0, Math.PI * 2);
    g.fill();
    eyes(g, cx, 235, 55, 16);
    g.fillStyle = '#1E1940';
    g.beginPath();
    g.ellipse(cx, 290, 22, 15, 0, 0, Math.PI * 2);
    g.fill();
    smile(g, cx, 305, 26);
    // kaptajnshue
    g.fillStyle = '#2D7FF9';
    g.beginPath();
    g.ellipse(cx, 140, 95, 38, 0, Math.PI, 0);
    g.fill();
    g.fillRect(cx - 110, 132, 220, 18);
    g.fillStyle = '#FFC93C';
    g.beginPath();
    g.arc(cx, 118, 13, 0, Math.PI * 2);
    g.fill();
  },
  dino(g, s) {
    backdrop(g, s, '#C9F2E2', '#9FE0FF');
    const cx = s / 2;
    g.fillStyle = '#FFC93C';
    for (let i = 0; i < 5; i++) {
      const x = cx - 110 + i * 55;
      g.beginPath();
      g.moveTo(x - 24, 150 + Math.abs(i - 2) * 22);
      g.lineTo(x, 95 + Math.abs(i - 2) * 22);
      g.lineTo(x + 24, 150 + Math.abs(i - 2) * 22);
      g.fill();
    }
    g.fillStyle = '#19B37C';
    g.beginPath();
    g.ellipse(cx, 280, 160, 150, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#7EE0B5';
    g.beginPath();
    g.ellipse(cx, 340, 90, 70, 0, 0, Math.PI * 2);
    g.fill();
    eyes(g, cx, 240, 60, 18);
    smile(g, cx, 285, 40);
    g.fillStyle = '#fff';
    for (const dx of [-18, 18]) {
      g.beginPath();
      g.moveTo(cx + dx - 8, 318);
      g.lineTo(cx + dx, 334);
      g.lineTo(cx + dx + 8, 318);
      g.fill();
    }
  },
  bunny(g, s) {
    backdrop(g, s, '#F3E1FF', '#FFD6EA');
    const cx = s / 2;
    for (const dx of [-60, 60]) {
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.ellipse(cx + dx, 120, 38, 100, dx < 0 ? -0.15 : 0.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#FFB3CF';
      g.beginPath();
      g.ellipse(cx + dx, 125, 18, 70, dx < 0 ? -0.15 : 0.15, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#FFFFFF';
    g.beginPath();
    g.ellipse(cx, 290, 145, 135, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#E7D6F5';
    g.lineWidth = 6;
    g.stroke();
    eyes(g, cx, 270, 50, 15);
    g.fillStyle = '#FF7FAE';
    g.beginPath();
    g.moveTo(cx - 14, 305);
    g.lineTo(cx + 14, 305);
    g.lineTo(cx, 320);
    g.fill();
    smile(g, cx, 318, 20);
    // lille skjold
    g.fillStyle = '#2D7FF9';
    g.beginPath();
    g.moveTo(cx + 95, 330);
    g.lineTo(cx + 150, 330);
    g.lineTo(cx + 150, 375);
    g.quadraticCurveTo(cx + 122, 410, cx + 122, 410);
    g.quadraticCurveTo(cx + 95, 375, cx + 95, 375);
    g.fill();
  },
  robot(g, s) {
    backdrop(g, s, '#DCE6F2', '#BFD3FF');
    const cx = s / 2;
    g.strokeStyle = '#59647A';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(cx, 120);
    g.lineTo(cx, 70);
    g.stroke();
    g.fillStyle = '#FF6B57';
    g.beginPath();
    g.arc(cx, 62, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#9AA8BF';
    rr(g, cx - 150, 120, 300, 250, 40);
    g.fill();
    g.fillStyle = '#C9D3E3';
    rr(g, cx - 115, 160, 230, 120, 26);
    g.fill();
    g.fillStyle = '#12B886';
    for (const dx of [-50, 50]) {
      g.beginPath();
      g.arc(cx + dx, 215, 22, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#1E1940';
    g.fillRect(cx - 60, 305, 120, 16);
    g.fillStyle = '#FFC93C';
    for (let i = 0; i < 4; i++) g.fillRect(cx - 52 + i * 30, 305, 14, 16);
  },
  deskMessy(g, s) {
    g.fillStyle = '#EDE6DA';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#B98552';
    g.fillRect(30, 260, s - 60, 40);
    g.fillRect(50, 300, 24, 150);
    g.fillRect(s - 74, 300, 24, 150);
    const items = [['#FF6B57', 60, 200, 90, 60, 0.3], ['#2D7FF9', 160, 215, 120, 45, -0.4], ['#FFC93C', 280, 190, 70, 70, 0.6], ['#12B886', 340, 225, 90, 35, -0.2], ['#8A5CF6', 120, 180, 60, 40, 0.8]];
    for (const [c, x, y, w, h, r] of items) {
      g.save();
      g.translate(x + w / 2, y + h / 2);
      g.rotate(r);
      g.fillStyle = c;
      g.fillRect(-w / 2, -h / 2, w, h);
      g.restore();
    }
    g.fillStyle = '#FF6B57';
    g.fillRect(140, 400, 70, 40);
    g.fillStyle = '#2D7FF9';
    g.fillRect(300, 420, 60, 30);
  },
  deskTidy(g, s) {
    g.fillStyle = '#EDE6DA';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#B98552';
    g.fillRect(30, 260, s - 60, 40);
    g.fillRect(50, 300, 24, 150);
    g.fillRect(s - 74, 300, 24, 150);
    const books = ['#FF6B57', '#2D7FF9', '#FFC93C', '#12B886', '#8A5CF6'];
    books.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(70 + i * 26, 150, 22, 110);
    });
    g.fillStyle = '#59647A';
    g.fillRect(300, 200, 70, 60);
    g.fillStyle = '#FFC93C';
    for (let i = 0; i < 5; i++) g.fillRect(310 + i * 11, 175, 6, 30);
  },
};

export function drawArt(kind, size = 480) {
  const [c, g] = canvas(size);
  const s = size / 480;
  g.scale(s, s);
  (ART[kind] || ART.bear)(g, 480);
  return c.toDataURL('image/jpeg', 0.85);
}

export async function loadDemo() {
  await A.resetAll();
  await A.setupFamily({ pin: '1234', children: [{ name: 'Alma', color: '#FF6B57' }, { name: 'Viggo', color: '#3A7BFF' }] });
  A.S.demo = true;
  const [alma, viggo] = A.S.children;
  const mk = async (child, name, type, cls, art, xp) => {
    const r = await A.createToy({ childId: child.id, name, type, cls, photoDataUrl: drawArt(art) });
    const t = r.toy;
    if (xp) A.grantXp({ childId: child.id, toyId: t.id, amount: xp, source: 'adjust', note: 'Start-XP i eksempel-familien' });
    t.seenLevel = levelInfo(t.xp).level;
    return t;
  };
  const krummel = await mk(alma, 'Kaptajn Krummel', 'bamse', 'staerk', 'bear', 820);
  const pjuske = await mk(alma, 'Sir Pjuske', 'dyr', 'forsvarer', 'bunny', 260);
  const lotte = await mk(viggo, 'Lyn-Lotte', 'dino', 'hurtig', 'dino', 640);
  const klonk = await mk(viggo, 'Turbo Klonk', 'robot', 'staerk', 'robot', 140);

  // En afgjort kamp og en, der venter på Alma
  const c1 = A.createChallenge({ challengerId: viggo.id, toyId: lotte.id, opponentId: alma.id, moves: ['angreb', 'finte', 'angreb'] });
  if (c1.ok) {
    const r = A.acceptChallenge(c1.battle.id, { childId: alma.id, toyId: krummel.id, moves: ['forsvar', 'angreb', 'finte'] });
    if (r.ok) r.battle.seen = { [alma.id]: true, [viggo.id]: true };
  }
  A.createChallenge({ challengerId: viggo.id, toyId: klonk.id, opponentId: alma.id, moves: ['angreb', 'angreb', 'forsvar'] });

  // En oprydning, der venter på godkendelse i forældrepanelet
  await A.submitActivity({
    childId: alma.id,
    toyId: pjuske.id,
    activityId: 'skrivebord',
    photos: [
      { role: 'foer', dataUrl: drawArt('deskMessy', 360) },
      { role: 'efter', dataUrl: drawArt('deskTidy', 360) },
    ],
    via: 'photo',
  });
  A.doCare({ childId: viggo.id, toyId: lotte.id, actionId: 'mad' });
  A.doCare({ childId: alma.id, toyId: krummel.id, actionId: 'kram' });
  for (const t of A.S.toys) t.seenLevel = levelInfo(t.xp).level;
  A.S.achSeen = { [alma.id]: Date.now() + 1000, [viggo.id]: Date.now() + 1000 };
  A.save();
  await A.flushSave();
}
