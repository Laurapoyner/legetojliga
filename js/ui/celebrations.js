// Viser level-up og nye pokaler for den, der spiller lige nu – også hvis de skete,
// mens en anden spillede (fx når en søskende afgjorde en kamp).

import { S, save, toysOf } from '../actions.js';
import { levelInfo, tierFor, SPECIAL_LEVEL } from '../rules.js';
import { ACHIEVEMENTS, CLASSES, STAT_NAMES } from '../catalog.js';
import { esc } from '../util.js';
import { app } from './app.js';
import { icon, toyCard, toyPhoto, levelBadge } from './components.js';
import { celebrate, sfx } from './fx.js';
import { say } from '../voice.js';

export function holdCelebrations(on) {
  app.hold = !!on;
  if (!on) flushCelebrations();
}

export function flushCelebrations() {
  if (app.hold || !app.childId || !S) return;
  let changed = false;
  // Afslør ikke resultatet af en kamp, barnet ikke har set endnu
  const unseen = S.battles.filter((b) => b.status === 'done' && b.challengerId === app.childId && b.seen?.[app.childId] === false);
  const waitingToys = new Set(unseen.map((b) => b.challengerToyId));
  for (const t of toysOf(app.childId)) {
    const lvl = levelInfo(t.xp).level;
    if (t.seenLevel == null) {
      t.seenLevel = lvl;
      changed = true;
      continue;
    }
    if (waitingToys.has(t.id)) continue;
    if (lvl > t.seenLevel) {
      celebrate(levelUpItem(t, t.seenLevel, lvl));
      t.seenLevel = lvl;
      changed = true;
    } else if (lvl < t.seenLevel) {
      t.seenLevel = lvl;
      changed = true;
    }
  }
  if (unseen.length) {
    if (changed) save();
    return;
  }
  const got = S.achievements[app.childId] || {};
  S.achSeen = S.achSeen || {};
  const seen = S.achSeen[app.childId] || 0;
  const fresh = ACHIEVEMENTS.filter((a) => got[a.id] && got[a.id] > seen);
  if (fresh.length) {
    for (const a of fresh) celebrate(achievementItem(a));
    S.achSeen[app.childId] = Math.max(...fresh.map((a) => got[a.id]));
    changed = true;
  }
  if (changed) save();
}

function levelUpItem(t, from, to) {
  const oldTier = tierFor(from);
  const newTier = tierFor(to);
  const cls = CLASSES[t.cls];
  const main = cls.main;
  const gains = ['sty', 'for', 'hur']
    .map((k) => `<li>${STAT_NAMES[k]} <b>+${(to - from) * (k === main ? 2 : 1)}</b></li>`)
    .join('');
  const extras = [];
  if (newTier.title !== oldTier.title) extras.push(`Ny titel: <b>${esc(newTier.title)}</b>`);
  if (from < SPECIAL_LEVEL && to >= SPECIAL_LEVEL) extras.push(`Nyt specialangreb: <b>${esc(cls.special.name)}</b>`);
  else if (Math.floor(to / 5) > Math.floor(from / 5) && to >= 10) extras.push('Specialangrebet er blevet stærkere');
  const spoken = [`Level up! ${t.name} er nu level ${to}!`];
  if (newTier.title !== oldTier.title) spoken.push(`Ny titel: ${newTier.title}.`);
  if (from < SPECIAL_LEVEL && to >= SPECIAL_LEVEL) spoken.push(`Nyt specialangreb: ${cls.special.name}.`);
  return {
    label: 'Level up',
    sound: sfx.levelUp,
    onShow: () => setTimeout(() => say(spoken.join(' ')), 700),
    html: `<p class="cel-kicker">Level up!</p>
      <div class="cel-toy ${newTier.tier}">${toyPhoto(t, 'toy-img')}${levelBadge(to, 'lvl-lg')}</div>
      <h2 class="cel-title">${esc(t.name)} er nu level ${to}</h2>
      <ul class="cel-gains">${gains}</ul>
      ${extras.length ? `<ul class="cel-extras">${extras.map((x) => `<li>${icon('auto_awesome')}${x}</li>`).join('')}</ul>` : ''}`,
    button: 'Sejt!',
  };
}

function achievementItem(a) {
  return {
    label: 'Ny pokal',
    sound: sfx.achievement,
    onShow: () => setTimeout(() => say(`Ny pokal: ${a.title}! ${a.desc}.`), 500),
    confetti: false,
    html: `<p class="cel-kicker">Ny pokal!</p>
      <div class="cel-ach">${icon(a.icon)}</div>
      <h2 class="cel-title">${esc(a.title)}</h2>
      <p class="cel-text">${esc(a.desc)}</p>`,
    button: 'Hurra!',
  };
}

export { toyCard };
