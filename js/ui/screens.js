// Børnenes skærme: profilvalg, forside, legetøj, pleje, træning, opgaver og pokaler.

import {
  S, save, toysOf, toyById, childById, activeChildren, activityById, createToy, updateToy, doCare,
  claimMission, submitActivity, markSubmissionSeen, markBattleSeen, battleById, canDoActivity,
} from '../actions.js';
import {
  levelInfo, tierFor, nextTier, careCooldownLeft, dailyMissions, missionProgress, isMissionClaimed,
  battleCounts, xpTodayBySource, achievementContext, activityUsage, limitText, scaledTarget, SPECIAL_LEVEL,
  specialPower, xpForLevel, MAX_LEVEL,
} from '../rules.js';
import {
  TOY_TYPES, CLASSES, CARE, CATEGORIES, ACHIEVEMENTS, NAME_FIRST, NAME_LAST, STAT_NAMES,
} from '../catalog.js';
import { esc, dayKey, fmtDate, fmtDuration, timeAgo, plural, fileToDataUrl, pick } from '../util.js';
import { app, go, back, rerender, me } from './app.js';
import {
  icon, toyCard, toyPhoto, levelBadge, xpBar, statBars, careMeters, avatar, kindPill, statusPill, empty,
  pageHead, progressBar, typeEmoji,
} from './components.js';
import { sfx, toast, celebrate, openModal, closeModal, floatText, confetti } from './fx.js';
import { say } from '../voice.js';

// ---------- Fælles ----------

export function notices(childId) {
  const list = [];
  for (const b of S.battles) {
    if (b.status === 'pending' && b.opponentId === childId) list.push({ kind: 'challenge', b, ts: b.createdAt });
    if (b.challengerId === childId && b.seen?.[childId] === false) {
      if (b.status === 'done') list.push({ kind: 'result', b, ts: b.completedAt });
      if (b.status === 'declined' || b.status === 'expired') list.push({ kind: b.status, b, ts: b.decidedAt || b.createdAt });
    }
  }
  for (const s of S.submissions) if (s.childId === childId && s.seen === false) list.push({ kind: 'decided', s, ts: s.decidedAt });
  return list.sort((a, b) => b.ts - a.ts);
}

export function claimableMissions(childId) {
  const day = dayKey();
  return dailyMissions(S, childId, day).filter(
    (m) => !isMissionClaimed(S, childId, day, m.id) && missionProgress(S, childId, day, m, { approvedOnly: true }) >= m.target,
  ).length;
}

const toyName = (id) => toyById(id)?.name || 'et slettet legetøj';
const childName = (id) => childById(id)?.name || 'En spiller';

function requireToys(title) {
  return `${pageHead(title)}${empty({
    icon: 'add_a_photo',
    title: 'Du har ikke noget legetøj endnu',
    text: 'Tag et billede af dit yndlingslegetøj, så bliver det din første spilfigur.',
    action: `<button type="button" class="btn btn-lg" data-act="go" data-to="newtoy">${icon('add_a_photo')}Opret legetøj</button>`,
  })}`;
}

function toyPicker(toys, selectedId, act, { note } = {}) {
  return `<div class="toy-picker" role="list">${toys
    .map((t) => {
      const info = levelInfo(t.xp);
      const n = note ? note(t) : '';
      return `<button type="button" role="listitem" class="pick-toy ${t.id === selectedId ? 'is-selected' : ''}" data-act="${act}" data-id="${t.id}" aria-pressed="${t.id === selectedId}">
        ${toyPhoto(t, 'pick-img')}
        <span class="pick-name">${esc(t.name)}</span>
        <span class="pick-lvl">LV ${info.level}${n ? ` · ${n}` : ''}</span>
      </button>`;
    })
    .join('')}</div>`;
}

// ---------- Hvem spiller? ----------

export const who = {
  chrome: false,
  render() {
    const kids = activeChildren();
    return `<div class="who">
      <div class="brand brand-big">${logo()}</div>
      <h1 class="who-title">Hvem spiller?</h1>
      <div class="who-grid">
        ${kids
          .map((c) => {
            const toys = toysOf(c.id);
            const best = toys.reduce((m, t) => Math.max(m, levelInfo(t.xp).level), 0);
            const n = notices(c.id).length + claimableMissions(c.id);
            return `<button type="button" class="who-btn" data-act="pick" data-id="${c.id}" style="--av:${esc(c.color)}">
              ${avatar(c, 'xl')}
              <span class="who-name">${esc(c.name)}</span>
              <span class="who-sub">${toys.length ? `${plural(toys.length, 'figur', 'figurer')} · bedste LV ${best}` : 'Intet legetøj endnu'}</span>
              ${n ? `<span class="dot">${n}</span>` : ''}
            </button>`;
          })
          .join('')}
      </div>
      <button type="button" class="btn btn-ghost" data-act="go" data-to="parent">${icon('lock')}Forældre</button>
      ${S.demo ? `<p class="demo-note">${icon('science')}Du prøver med en eksempel-familie. Forældre-PIN er 1234.</p>` : ''}
    </div>`;
  },
  actions: {
    pick({ id }) {
      app.childId = id;
      try {
        localStorage.setItem('ll:child', id);
      } catch {
        /* bekvemmelighed */
      }
      sfx.tap();
      say(`Hej ${childById(id)?.name || ''}!`, { interrupt: true });
      app.history = [];
      go('home', {}, { replace: true });
    },
  },
};

export function logo() {
  return `<span class="logo" aria-label="LegetøjsLigaen"><span class="logo-a">Legetøjs</span><span class="logo-b">Ligaen</span></span>`;
}

// ---------- Forside ----------

function noticeCard(n) {
  if (n.kind === 'challenge') {
    const t = toyById(n.b.challengerToyId);
    return `<div class="notice notice-fight">
      ${icon('swords', 'notice-ic')}
      <div><b>${esc(childName(n.b.challengerId))} udfordrer dig!</b><span>${esc(t ? t.name : 'Et legetøj')} vil kæmpe · ${timeAgo(n.ts)}</span></div>
      <button type="button" class="btn btn-sm btn-coral" data-act="go" data-to="respond" data-id="${n.b.id}">Se udfordringen</button>
    </div>`;
  }
  if (n.kind === 'result') {
    return `<div class="notice notice-fight">
      ${icon('emoji_events', 'notice-ic')}
      <div><b>Din kamp mod ${esc(childName(n.b.opponentId))} er færdig!</b><span>Se hvem der vandt</span></div>
      <button type="button" class="btn btn-sm btn-coral" data-act="go" data-to="battle" data-id="${n.b.id}">Se kampen</button>
    </div>`;
  }
  if (n.kind === 'declined' || n.kind === 'expired') {
    const text = n.kind === 'declined' ? `${esc(childName(n.b.opponentId))} sagde nej tak til kampen.` : `Din udfordring til ${esc(childName(n.b.opponentId))} nåede ikke at blive besvaret.`;
    return `<div class="notice">
      ${icon('hourglass_disabled', 'notice-ic')}
      <div><b>${text}</b><span>Du kan altid udfordre igen.</span></div>
      <button type="button" class="btn btn-sm btn-ghost" data-act="seenBattle" data-id="${n.b.id}">OK</button>
    </div>`;
  }
  const s = n.s;
  const act = activityById(s.activityId);
  const title = act?.title || 'Opgave';
  if (s.status === 'approved') {
    return `<div class="notice notice-ok">
      ${icon('check_circle', 'notice-ic')}
      <div><b>Godkendt: ${esc(title)}</b><span>+${s.xpGiven ?? s.xp} XP til ${esc(toyName(s.toyId))}</span></div>
      <button type="button" class="btn btn-sm btn-mint" data-act="seenSub" data-id="${s.id}">Juhu!</button>
    </div>`;
  }
  return `<div class="notice notice-no">
    ${icon('cancel', 'notice-ic')}
    <div><b>Ikke godkendt: ${esc(title)}</b><span>${s.note ? esc(s.note) : 'Prøv igen, så hjælper en voksen.'}</span></div>
    <button type="button" class="btn btn-sm btn-ghost" data-act="seenSub" data-id="${s.id}">OK</button>
  </div>`;
}

function missionCard(m, childId, day) {
  const prog = Math.min(m.target, missionProgress(S, childId, day, m));
  const claimed = isMissionClaimed(S, childId, day, m.id);
  const done = missionProgress(S, childId, day, m, { approvedOnly: true }) >= m.target;
  const waiting = !done && prog >= m.target;
  const ic = m.group === 'move' ? 'directions_run' : m.group === 'task' ? 'cleaning_services' : 'favorite';
  let right = `<span class="mission-xp">+${m.xp} XP</span>`;
  if (claimed) right = `<span class="mission-xp">Klaret</span>`;
  else if (done) right = `<button type="button" class="btn btn-sm" data-act="claim" data-id="${m.id}">Hent +${m.xp} XP</button>`;
  else if (waiting) right = `<span class="pill pill-wait">${icon('hourglass_top')}Venter på en voksen</span>`;
  return `<div class="mission ${claimed ? 'is-claimed' : done ? 'is-done' : ''}">
    <span class="mission-ic">${icon(claimed ? 'check' : ic)}</span>
    <div class="mission-body">
      <b>${esc(m.text)}</b>
      <span class="mission-row">${progressBar(prog, m.target)}<small>${prog}/${m.target}</small></span>
    </div>
    ${right}
  </div>`;
}

export const home = {
  nav: 'home',
  render() {
    const c = me();
    const day = dayKey();
    const toys = toysOf(c.id);
    const ns = notices(c.id);
    const missions = dailyMissions(S, c.id, day);
    const { perChild } = battleCounts(S, day);
    const xpToday = S.xpLog.filter((e) => e.childId === c.id && e.day === day && e.source !== 'adjust').reduce((n, e) => n + e.amount, 0);
    const got = Object.keys(S.achievements[c.id] || {}).length;
    return `<section class="hello">
        ${avatar(c, 'lg')}
        <div><h1>Hej ${esc(c.name)}!</h1><p>${fmtDate()}</p></div>
      </section>
      ${ns.length ? `<section class="notices">${ns.map(noticeCard).join('')}</section>` : ''}
      <section class="block">
        <div class="h2-row"><h2 class="h2">${icon('flag')}Dagens missioner</h2><button type="button" class="speak-btn" data-act="readMissions" aria-label="Læs dagens missioner op">${icon('volume_up')}<span>Læs op</span></button></div>
        <div class="missions">${missions.map((m) => missionCard(m, c.id, day)).join('')}</div>
      </section>
      <section class="block">
        <div class="h2-row"><h2 class="h2">${icon('kid_star')}Mine figurer</h2>${toys.length ? `<button type="button" class="link" data-act="go" data-to="toys">Se alle</button>` : ''}</div>
        ${
          toys.length
            ? `<div class="toy-row">${toys
                .slice()
                .sort((a, b) => b.xp - a.xp)
                .slice(0, 8)
                .map((t) => toyCard(t, { act: 'openToy', size: 'sm' }))
                .join('')}<button type="button" class="tcard tcard-sm tcard-new" data-act="go" data-to="newtoy">${icon('add_a_photo')}<span>Nyt legetøj</span></button></div>`
            : empty({
                icon: 'add_a_photo',
                title: 'Gør dit legetøj til en spilfigur',
                text: 'Tag et billede af en bamse, en dino eller en bil – så kan den trænes og kæmpe.',
                action: `<button type="button" class="btn btn-lg" data-act="go" data-to="newtoy">${icon('add_a_photo')}Opret dit første legetøj</button>`,
              })
        }
      </section>
      <section class="quick">
        <button type="button" class="quick-tile qt-train" data-act="go" data-to="training">${icon('sprint')}<b>Træn</b><span>Med kameraet</span></button>
        <button type="button" class="quick-tile qt-tasks" data-act="go" data-to="tasks">${icon('cleaning_services')}<b>Opgaver</b><span>Ryd op og hjælp</span></button>
        <button type="button" class="quick-tile qt-care" data-act="go" data-to="care">${icon('favorite')}<b>Pleje</b><span>Mad, søvn og leg</span></button>
        <button type="button" class="quick-tile qt-fight" data-act="go" data-to="arena">${icon('swords')}<b>Arena</b><span>Udfordr nogen</span></button>
      </section>
      <section class="today">
        <div><b>${xpToday}</b><span>XP i dag</span></div>
        <div><b>${perChild[c.id] || 0}/${S.settings.battlesPerChild}</b><span>kampe i dag</span></div>
        <button type="button" data-act="go" data-to="trophies"><b>${got}/${ACHIEVEMENTS.length}</b><span>pokaler ${icon('chevron_right')}</span></button>
      </section>`;
  },
  actions: {
    seenSub({ id }) {
      markSubmissionSeen(id);
      rerender();
    },
    readMissions() {
      const day = dayKey();
      const words = ['Første', 'Anden', 'Tredje'];
      const ms = dailyMissions(S, app.childId, day);
      const parts = ms.map((m, i) => {
        const claimed = isMissionClaimed(S, app.childId, day, m.id);
        const prog = Math.min(m.target, missionProgress(S, app.childId, day, m));
        const state = claimed ? 'Klaret.' : prog >= m.target ? 'Klar! Hent din belønning.' : `Du får ${m.xp} XP.`;
        return `${words[i] || ''} mission: ${m.text}. ${state}`;
      });
      say(`Dagens missioner. ${parts.join(' ')}`, { interrupt: true });
    },
    seenBattle({ id }) {
      markBattleSeen(id, app.childId);
      rerender();
    },
    claim({ id }) {
      const toys = toysOf(app.childId);
      if (!toys.length) {
        toast('Opret et legetøj først, så det kan få belønningen', { icon: 'toys' });
        return;
      }
      if (toys.length === 1) return doClaim(id, toys[0].id);
      openModal(
        `<h2>Hvem skal have belønningen?</h2>
         <div class="toy-grid toy-grid-modal">${toys.map((t) => toyCard(t, { act: 'claimTo', size: 'sm', data: { mission: id } })).join('')}</div>`,
        { label: 'Vælg legetøj' },
      );
    },
    claimTo({ id, mission }) {
      closeModal();
      doClaim(mission, id);
    },
  },
};

function doClaim(missionId, toyId) {
  const r = claimMission(app.childId, missionId, toyId);
  if (!r.ok) {
    toast(r.reason, { icon: 'error', tone: 'coral' });
    return;
  }
  sfx.coin();
  toast(`+${r.gained} XP til ${toyName(toyId)}`, { icon: 'stars', tone: 'sun' });
  if (!r.levelUps.length) confetti({ count: 60 });
  rerender();
}

// ---------- Samling ----------

export const toys = {
  nav: 'toys',
  render() {
    const list = toysOf(app.childId).sort((a, b) => b.xp - a.xp);
    return `${pageHead('Mine figurer', { sub: list.length ? `${plural(list.length, 'figur', 'figurer')} i samlingen` : '' })}
      <div class="toy-grid">
        ${list.map((t) => toyCard(t, { act: 'openToy' })).join('')}
        <button type="button" class="tcard tcard-md tcard-new" data-act="go" data-to="newtoy">${icon('add_a_photo')}<span>Nyt legetøj</span><small>Tag et billede</small></button>
      </div>`;
  },
};

// ---------- Opret legetøj ----------

function randomName() {
  return `${pick(NAME_FIRST)} ${pick(NAME_LAST)}`;
}

export const newtoy = {
  nav: 'toys',
  render() {
    const d = (app.draft.newToy = app.draft.newToy || { photo: null, name: '', type: null, cls: null });
    return `${pageHead('Nyt legetøj', { backTo: true, sub: 'Tag et billede, giv det et navn, og vælg hvad det er godt til' })}
      <form class="newtoy" data-form="createToy" novalidate>
        <section class="panel step">
          <h2 class="step-h"><span class="step-n">1</span>Tag et billede</h2>
          <label class="photo-drop ${d.photo ? 'has-photo' : ''}">
            ${d.photo ? `<img src="${d.photo}" alt="Dit legetøj">` : `${icon('add_a_photo', 'drop-ic')}<b>Tryk her</b><span>Tag et billede eller vælg et fra billeder</span>`}
            <input type="file" accept="image/*" data-change="toyPhoto" class="sr-only" id="toy-photo">
          </label>
          ${d.photo ? `<p class="help">${icon('crop')}Billedet beskæres til en firkant. Tryk på billedet for at tage et nyt.</p>` : ''}
        </section>
        <section class="panel step">
          <h2 class="step-h"><span class="step-n">2</span>Hvad hedder det?</h2>
          <div class="name-row">
            <input type="text" id="toy-name" maxlength="28" placeholder="Fx Kaptajn Krummel" value="${esc(d.name)}" data-input="toyName" autocomplete="off" enterkeyhint="done">
            <button type="button" class="btn btn-ghost" data-act="randomName" aria-label="Find på et navn">${icon('casino')}Find på et</button>
          </div>
        </section>
        <section class="panel step">
          <h2 class="step-h"><span class="step-n">3</span>Hvad er det?</h2>
          <div class="type-grid">${TOY_TYPES.map(
            (t) => `<button type="button" class="type-btn ${d.type === t.id ? 'is-selected' : ''}" data-act="pickType" data-id="${t.id}" aria-pressed="${d.type === t.id}"><span class="type-emoji" aria-hidden="true">${t.emoji}</span>${t.name}</button>`,
          ).join('')}</div>
        </section>
        <section class="panel step">
          <h2 class="step-h"><span class="step-n">4</span>Hvad er det god til?</h2>
          <div class="class-grid">${Object.values(CLASSES)
            .map(
              (c) => `<button type="button" class="class-btn class-${c.id} ${d.cls === c.id ? 'is-selected' : ''}" data-act="pickClass" data-id="${c.id}" aria-pressed="${d.cls === c.id}">
                ${icon(c.icon, 'class-ic')}<b>${c.name}</b><span>${c.desc}</span><small>Specialangreb: ${c.special.name}</small>
              </button>`,
            )
            .join('')}</div>
        </section>
        <button type="submit" class="btn btn-lg btn-block" id="save-toy">${icon('check')}Gem og gør klar til kamp</button>
      </form>`;
  },
  inputs: {
    toyName(v) {
      app.draft.newToy.name = v;
    },
  },
  changes: {
    async toyPhoto(el) {
      const f = el.files?.[0];
      if (!f) return;
      try {
        app.draft.newToy.photo = await fileToDataUrl(f, { max: 640, square: true });
        sfx.tap();
        rerender();
      } catch {
        toast('Billedet kunne ikke læses. Prøv et andet.', { icon: 'error', tone: 'coral' });
      }
    },
  },
  actions: {
    randomName() {
      app.draft.newToy.name = randomName();
      rerender();
    },
    pickType({ id }) {
      app.draft.newToy.type = id;
      sfx.tap();
      rerender();
    },
    pickClass({ id }) {
      app.draft.newToy.cls = id;
      sfx.tap();
      rerender();
    },
  },
  forms: {
    async createToy() {
      const d = app.draft.newToy;
      if (!d.photo) return toast('Tag et billede af dit legetøj først', { icon: 'add_a_photo', tone: 'coral' });
      if (!d.cls) return toast('Vælg hvad dit legetøj er godt til', { icon: 'touch_app', tone: 'coral' });
      const name = d.name.trim() || randomName();
      const r = await createToy({ childId: app.childId, name, type: d.type || 'andet', cls: d.cls, photoDataUrl: d.photo });
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      app.draft.newToy = null;
      const t = r.toy;
      celebrate({
        label: 'Nyt legetøj',
        sound: sfx.levelUp,
        onShow: () => setTimeout(() => say(`Velkommen i ligaen, ${t.name}! Du starter på level 1.`), 500),
        html: `<p class="cel-kicker">Velkommen i ligaen!</p>
          <div class="cel-card">${toyCard(t, { size: 'lg' })}</div>
          <p class="cel-text">${esc(t.name)} starter på level 1. Træn, pas på den og løs opgaver, så den bliver stærkere.</p>`,
        button: 'Se min nye figur',
        onClose: () => {},
      });
      go('toy', { id: t.id }, { replace: true });
    },
  },
};

// ---------- Legetøjets side ----------

function milestoneList(level, cls) {
  const steps = [
    { lvl: 5, text: `Titlen Eventyrer, bronzeramme og specialangrebet ${CLASSES[cls].special.name}` },
    { lvl: 10, text: 'Titlen Helt, sølvramme og specialangreb +10 %' },
    { lvl: 15, text: 'Titlen Mester, guldramme og specialangreb +20 %' },
    { lvl: 20, text: 'Titlen Superhelt, diamantramme og specialangreb +30 %' },
    { lvl: 25, text: 'Legende! Regnbueramme og specialangreb +40 %' },
  ];
  return `<ol class="milestones">${steps
    .map(
      (s) => `<li class="${level >= s.lvl ? 'is-done' : ''}">${icon(level >= s.lvl ? 'check_circle' : 'lock')}<span><b>Level ${s.lvl}</b> · ${s.text}</span></li>`,
    )
    .join('')}</ol>`;
}

const SOURCE = {
  training: { ic: 'sprint', name: 'Træning' },
  task: { ic: 'task_alt', name: 'Opgave' },
  battle: { ic: 'swords', name: 'Kamp' },
  care: { ic: 'favorite', name: 'Pleje' },
  mission: { ic: 'flag', name: 'Mission' },
  adjust: { ic: 'tune', name: 'Rettet af en voksen' },
};

function historyLine(e, { withToy = false } = {}) {
  const src = SOURCE[e.source] || { ic: 'star', name: e.source };
  let what = src.name;
  if (e.ref) {
    const sub = S.submissions.find((s) => s.id === e.ref);
    if (sub) what = activityById(sub.activityId)?.title || what;
    const b = S.battles.find((x) => x.id === e.ref);
    if (b && b.result) {
      const side = b.challengerToyId === e.toyId ? 'a' : 'b';
      what = b.result.winner === 'draw' ? 'Kamp – uafgjort' : b.result.winner === side ? 'Kamp – sejr' : 'Kamp – nederlag';
    }
  }
  if (e.note && e.source === 'adjust') what = e.note;
  const toyPart = withToy ? `<i>${esc(toyName(e.toyId))}</i> ` : '';
  return `<li>${icon(src.ic)}<span class="hist-what">${toyPart}${esc(what)}</span><span class="hist-when">${timeAgo(e.ts)}</span><b class="${e.amount < 0 ? 'neg' : ''}">${e.amount > 0 ? '+' : ''}${e.amount}</b></li>`;
}

export const toy = {
  nav: 'toys',
  render({ id }) {
    const t = toyById(id);
    if (!t || t.deleted) return empty({ icon: 'search_off', title: 'Legetøjet findes ikke', action: `<button type="button" class="btn" data-act="go" data-to="toys">Til samlingen</button>` });
    const info = levelInfo(t.xp);
    const tier = tierFor(info.level);
    const nt = nextTier(info.level);
    const cls = CLASSES[t.cls];
    const mine = t.childId === app.childId;
    const rec = t.record || { battles: 0, wins: 0, losses: 0, draws: 0 };
    const hist = S.xpLog.filter((e) => e.toyId === t.id).slice(-12).reverse();
    const specialOn = info.level >= SPECIAL_LEVEL;
    return `${pageHead(t.name, {
      backTo: true,
      right: mine ? `<button type="button" class="icon-btn" data-act="editToy" data-id="${t.id}" aria-label="Ret navn eller billede">${icon('edit')}</button>` : '',
    })}
      <section class="toy-hero ${tier.tier}">
        <div class="toy-hero-photo">${toyPhoto(t, 'toy-img')}${levelBadge(info.level, 'lvl-lg')}</div>
        <div class="toy-hero-info">
          <p class="toy-title">${esc(tier.title)} · ${esc(cls.name)} <span aria-hidden="true">${typeEmoji(t.type)}</span></p>
          ${xpBar(t.xp)}
          <p class="toy-next">${info.isMax ? 'Højeste level er nået. Al XP tæller stadig med i alt.' : `${info.need - info.into} XP til level ${info.level + 1}${nt ? ` · ${esc(nt.title)} på level ${nt.from}` : ''}`}</p>
        </div>
      </section>
      ${
        mine
          ? `<div class="action-row">
          <button type="button" class="btn btn-mint" data-act="go" data-to="care" data-id="${t.id}">${icon('favorite')}Pleje</button>
          <button type="button" class="btn" data-act="trainToy" data-id="${t.id}">${icon('sprint')}Træn</button>
          <button type="button" class="btn btn-coral" data-act="fightToy" data-id="${t.id}">${icon('swords')}Udfordr</button>
        </div>`
          : ''
      }
      <div class="two-col">
        <section class="panel"><h2 class="h3">${icon('bar_chart')}Evner</h2>${statBars(t)}<p class="help">Træning giver ekstra point i den evne, øvelsen træner.</p></section>
        <section class="panel"><h2 class="h3">${icon('mood')}Form</h2>${careMeters(t)}<p class="help">God form giver lidt ekstra kraft i kampene.</p></section>
        <section class="panel special ${specialOn ? '' : 'is-locked'}">
          <h2 class="h3">${icon('auto_awesome')}Specialangreb</h2>
          <p class="special-name">${esc(cls.special.name)}${specialOn ? ` <small>${Math.round(specialPower(info.level) * 100)} % kraft</small>` : ''}</p>
          <p>${esc(cls.special.desc)}</p>
          <p class="help">${specialOn ? 'Kan bruges én gang i hver kamp.' : `Låses op på level ${SPECIAL_LEVEL}.`}</p>
        </section>
        <section class="panel"><h2 class="h3">${icon('emoji_events')}Kampe</h2>
          <div class="record"><div><b>${rec.wins}</b><span>sejre</span></div><div><b>${rec.losses}</b><span>nederlag</span></div><div><b>${rec.draws}</b><span>uafgjort</span></div></div>
        </section>
      </div>
      <section class="panel"><h2 class="h3">${icon('route')}Belønninger på vejen</h2>${milestoneList(info.level, t.cls)}</section>
      <section class="panel"><h2 class="h3">${icon('history')}Historik</h2>
        ${hist.length ? `<ul class="hist">${hist.map(historyLine).join('')}</ul>` : `<p class="help">Ingen XP endnu. Træn eller løs en opgave for at komme i gang.</p>`}
      </section>`;
  },
  actions: {
    trainToy({ id }) {
      app.draft.trainToy = id;
      go('training');
    },
    fightToy({ id }) {
      app.draft.challenge = { toyId: id, opponentId: null, moves: [] };
      go('challenge');
    },
    editToy({ id }) {
      const t = toyById(id);
      app.draft.editToy = { id, photo: null };
      openModal(
        `<h2>Ret ${esc(t.name)}</h2>
        <form data-form="saveToyEdit" class="stack">
          <label class="field"><span>Navn</span><input type="text" id="edit-name" name="name" maxlength="28" value="${esc(t.name)}" autocomplete="off"></label>
          <label class="btn btn-ghost file-btn">${icon('add_a_photo')}Nyt billede<input type="file" accept="image/*" class="sr-only" data-change="editPhoto"></label>
          <div class="edit-preview" id="edit-preview">${toyPhoto(t, 'toy-img')}</div>
          <button type="submit" class="btn btn-block">${icon('check')}Gem</button>
        </form>`,
        { label: 'Ret legetøj' },
      );
    },
  },
  changes: {
    async editPhoto(el) {
      const f = el.files?.[0];
      if (!f) return;
      try {
        const url = await fileToDataUrl(f, { max: 640, square: true });
        app.draft.editToy.photo = url;
        const box = document.getElementById('edit-preview');
        if (box) box.innerHTML = `<img class="toy-img" src="${url}" alt="Nyt billede">`;
      } catch {
        toast('Billedet kunne ikke læses', { icon: 'error', tone: 'coral' });
      }
    },
  },
  forms: {
    async saveToyEdit(form) {
      const d = app.draft.editToy;
      const r = await updateToy(d.id, { name: form.name.value, photoDataUrl: d.photo });
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      closeModal();
      toast('Gemt', { icon: 'check', tone: 'mint' });
      rerender();
    },
  },
};

// ---------- Pleje ----------

const CARE_FX = {
  yum: ['🍎', '🥕', '🍪'],
  drop: ['💧', '💧', '💦'],
  zzz: ['💤', '🌙', '⭐'],
  bubbles: ['🫧', '🫧', '✨'],
  ball: ['⚽', '🎈', '✨'],
  hearts: ['💛', '❤️', '💖'],
};

export const care = {
  nav: 'home',
  render({ id }) {
    const list = toysOf(app.childId);
    if (!list.length) return requireToys('Pleje');
    const t = toyById(id) && toyById(id).childId === app.childId ? toyById(id) : null;
    if (!t) {
      return `${pageHead('Hvem vil du passe på?', { backTo: true, sub: 'Mad, søvn, leg og kram giver energi og glæde' })}
        <div class="toy-grid">${list.map((x) => toyCard(x, { act: 'careFor', note: careNote(x) })).join('')}</div>`;
    }
    const cap = S.settings.careXpCap;
    const used = xpTodayBySource(S, app.childId, 'care', dayKey(), t.id);
    return `${pageHead(`Pas på ${t.name}`, { backTo: true })}
      <section class="room ${tierFor(levelInfo(t.xp).level).tier}">
        <div class="room-stage" id="room-stage">
          <div class="room-toy" id="room-toy">${toyPhoto(t, 'toy-img')}</div>
          <div class="room-fx" id="room-fx" aria-hidden="true"></div>
        </div>
        ${careMeters(t)}
      </section>
      <div class="care-grid">${[...CARE].sort((x, y) => (careCooldownLeft(t, x.id) ? 1 : 0) - (careCooldownLeft(t, y.id) ? 1 : 0)).map((a) => {
        const left = careCooldownLeft(t, a.id);
        return `<div class="care-item">${speakBtn(a.id, 'readCare')}<button type="button" class="care-btn care-${a.id}" data-act="care" data-action="${a.id}" data-id="${t.id}" ${left ? 'disabled' : ''}>
          ${icon(a.icon, 'care-ic')}<b>${a.name}</b><small>${left ? `Igen om ${fmtDuration(left)}` : `${icon('photo_camera')}${used >= cap ? 'Klar' : `+${a.xp} XP`}`}</small>
        </button></div>`;
      }).join('')}</div>
      <p class="help center">${used >= cap ? `${esc(t.name)} har fået alle ${cap} pleje-XP i dag – men den elsker stadig at blive passet på.` : `Pleje giver op til ${cap} XP om dagen pr. figur.`} Din figur mister aldrig levels, hvis du holder pause.</p>`;
  },
  actions: {
    careFor({ id }) {
      go('care', { id }, { replace: true });
    },
    readCare({ id }) {
      const a = CARE.find((x) => x.id === id);
      const t = toyById(app.route.params.id);
      if (!a) return;
      const left = t ? careCooldownLeft(t, a.id) : 0;
      say(`${a.name}. ${a.cam?.tip || ''}${left ? ` ${t.name} har lige fået det. Prøv igen om ${fmtDuration(left).replace('t.', 'timer').replace('min.', 'minutter')}.` : ''}`, { interrupt: true });
    },
    care({ action, id }) {
      const toy = toyById(id);
      const left = toy ? careCooldownLeft(toy, action) : 0;
      if (left) {
        sfx.error();
        return toast(`${toy.name} har lige fået det. Prøv igen om ${fmtDuration(left)}`, { icon: 'schedule' });
      }
      sfx.tap();
      go('exercise', { id: `care:${action}`, toyId: id });
    },
  },
};

function careNote(t) {
  const left = CARE.filter((a) => !careCooldownLeft(t, a.id)).length;
  return left ? `${left} ting klar` : 'Er passet godt på';
}

// ---------- Træningscenter ----------

export const training = {
  nav: 'training',
  render() {
    const list = toysOf(app.childId);
    if (!list.length) return requireToys('Træningscenter');
    const c = me();
    const sel = list.find((t) => t.id === app.draft.trainToy) || list[0];
    app.draft.trainToy = sel.id;
    const acts = S.activities.filter((a) => a.active && a.cat === 'bevaegelse');
    const cam = acts.filter((a) => a.kind === 'camera');
    const adult = acts.filter((a) => a.kind !== 'camera');
    const row = (a) => {
      const u = activityUsage(S, c.id, a);
      const target = a.kind === 'camera' ? scaledTarget(a, c.difficulty) : null;
      const goal = a.kind === 'camera' ? (a.cam.unit === 'sec' ? `${target} sekunder` : `${target} gange`) : '';
      return `<div class="act-item"><button type="button" class="act-row ${u.ok ? '' : 'is-used'}" data-act="${a.kind === 'camera' ? 'startExercise' : 'adultTraining'}" data-id="${a.id}" ${u.ok ? '' : 'aria-disabled="true"'}>
        <span class="act-ic">${icon(u.ok ? a.icon || 'sprint' : 'check')}</span>
        <span class="act-body"><b>${esc(a.title)}</b><span>${esc(goal ? `${goal} · ${a.desc || ''}` : a.desc || '')}</span><small>${limitText(u)} · træner ${a.stat === 'alle' ? 'alle evner' : STAT_NAMES[a.stat]?.toLowerCase() || 'alt'}</small></span>
        <span class="act-speak-space" aria-hidden="true"></span><span class="act-xp">+${a.xp}<small>XP</small></span>
      </button>${speakBtn(a.id)}</div>`;
    };
    return `${pageHead('Træningscenter', { sub: 'Bevæg dig – så bliver din figur stærkere' })}
      <section class="block">
        <h2 class="h3">Hvem træner du?</h2>
        ${toyPicker(list, sel.id, 'pickTrainToy')}
      </section>
      <section class="block">
        <h2 class="h2">${icon('photo_camera')}Kameraet tæller</h2>
        <div class="act-list">${availableFirst(cam, c.id).map(row).join('')}</div>
      </section>
      ${adult.length ? `<section class="block"><h2 class="h2">${icon('how_to_reg')}En voksen godkender</h2><div class="act-list">${availableFirst(adult, c.id).map(row).join('')}</div></section>` : ''}`;
  },
  actions: {
    pickTrainToy({ id }) {
      app.draft.trainToy = id;
      sfx.tap();
      rerender();
    },
    startExercise({ id }) {
      const act = activityById(id);
      const can = canDoActivity(app.childId, act);
      if (!can.ok) return toast(can.reason, { icon: 'schedule' });
      go('exercise', { id, toyId: app.draft.trainToy });
    },
    adultTraining({ id }) {
      const act = activityById(id);
      const can = canDoActivity(app.childId, act);
      if (!can.ok) return toast(can.reason, { icon: 'schedule' });
      go('task', { id, toyId: app.draft.trainToy });
    },
  },
};

// Opgaver, der kan laves nu, først – brugte opgaver nederst, til de kan laves igen
function availableFirst(list, childId) {
  const ok = [];
  const used = [];
  for (const a of list) (activityUsage(S, childId, a).ok ? ok : used).push(a);
  return [...ok, ...used];
}

function speakBtn(id, kind = 'readAct') {
  return `<button type="button" class="speak-mini" data-act="${kind}" data-id="${esc(id)}" aria-label="Læs op">${icon('volume_up')}</button>`;
}

// Tekst, der læses op for en opgave eller træning
export function activitySpeech(a, childId) {
  if (!a) return '';
  const c = childById(childId);
  const u = childId ? activityUsage(S, childId, a) : { ok: true };
  let how;
  if (a.kind === 'camera') {
    const target = scaledTarget(a, c?.difficulty);
    how = `Kameraet tæller. Lav ${target} ${a.cam.unit === 'sec' ? 'sekunder' : 'gange'}.`;
  } else if (a.kind === 'photo') how = 'Tag et billede, når du er færdig. Så godkender en voksen det.';
  else how = 'Når du er færdig, godkender en voksen det.';
  const used = u.ok ? '' : u.per === 'week' ? ' Den er klaret nok gange denne uge.' : ' Den er klaret i dag. Prøv igen i morgen!';
  return `${a.title}. ${a.desc || ''} ${how} Du får ${a.xp} XP.${used}`;
}

// ---------- Opgaver ----------

export const tasks = {
  nav: 'tasks',
  render() {
    const c = me();
    const filter = app.draft.taskCat || 'alle';
    const cats = CATEGORIES.filter((x) => x.id !== 'bevaegelse' && S.activities.some((a) => a.active && a.cat === x.id));
    const acts = S.activities.filter((a) => a.active && a.cat !== 'bevaegelse' && (filter === 'alle' || a.cat === filter));
    const mine = S.submissions
      .filter((s) => s.childId === c.id && s.via !== 'camera')
      .slice(-8)
      .reverse();
    return `${pageHead('Opgaver', { sub: 'Løs opgaver i den virkelige verden og få XP til en figur' })}
      <div class="chips" role="tablist">
        <button type="button" class="chip ${filter === 'alle' ? 'is-on' : ''}" data-act="taskCat" data-id="alle">Alle</button>
        ${cats.map((x) => `<button type="button" class="chip ${filter === x.id ? 'is-on' : ''}" data-act="taskCat" data-id="${x.id}">${icon(x.icon)}${x.name}</button>`).join('')}
      </div>
      <div class="act-list">${availableFirst(acts, c.id)
        .map((a) => {
          const u = activityUsage(S, c.id, a);
          return `<div class="act-item"><button type="button" class="act-row ${u.ok ? '' : 'is-used'}" data-act="openTask" data-id="${a.id}">
            <span class="act-ic">${icon(u.ok ? a.icon || 'task_alt' : 'check')}</span>
            <span class="act-body"><b>${esc(a.title)}</b><span>${esc(a.desc || '')}</span><small>${kindPill(a.kind)} ${limitText(u)}</small></span>
            <span class="act-speak-space" aria-hidden="true"></span><span class="act-xp">+${a.xp}<small>XP</small></span>
          </button>${speakBtn(a.id)}</div>`;
        })
        .join('')}</div>
      ${
        mine.length
          ? `<section class="block"><h2 class="h2">${icon('inbox')}Det har jeg sendt</h2><ul class="sent">${mine
              .map((s) => `<li><span><b>${esc(activityById(s.activityId)?.title || 'Opgave')}</b><small>${esc(toyName(s.toyId))} · ${timeAgo(s.createdAt)}</small></span>${statusPill(s.status)}</li>`)
              .join('')}</ul></section>`
          : ''
      }`;
  },
  actions: {
    taskCat({ id }) {
      app.draft.taskCat = id;
      rerender();
    },
    openTask({ id }) {
      const can = canDoActivity(app.childId, activityById(id));
      if (!can.ok) return toast(can.reason, { icon: 'schedule' });
      go('task', { id });
    },
  },
};

export const task = {
  nav: 'tasks',
  render({ id, toyId }) {
    const a = activityById(id);
    const list = toysOf(app.childId);
    if (!a) return empty({ icon: 'search_off', title: 'Opgaven findes ikke' });
    if (!list.length) return requireToys(a.title);
    const d = app.draft.task && app.draft.task.id === id ? app.draft.task : (app.draft.task = { id, toyId: toyId || app.draft.trainToy || list[0].id, before: null, after: null });
    if (!list.some((t) => t.id === d.toyId)) d.toyId = list[0].id;
    const photoStep = a.kind === 'photo';
    return `${pageHead(a.title, {
      backTo: true,
      sub: `+${a.xp} XP · ${a.kind === 'photo' ? 'Tag et billede, så godkender en voksen' : 'En voksen godkender'}`,
      right: `<button type="button" class="icon-btn" data-act="readTask" data-id="${a.id}" aria-label="Læs opgaven op">${icon('volume_up')}</button>`,
    })}
      ${a.desc ? `<p class="lead-text">${esc(a.desc)}</p>` : ''}
      <section class="block">
        <h2 class="h3">Hvem skal have XP'en?</h2>
        ${toyPicker(list, d.toyId, 'pickTaskToy')}
      </section>
      ${
        photoStep
          ? `<section class="block">
          <h2 class="h3">Billeder</h2>
          <div class="proof-grid">
            ${a.beforeAfter ? proofSlot('before', 'Før', d.before, 'Valgfrit') : ''}
            ${proofSlot('after', a.beforeAfter ? 'Efter' : 'Billede', d.after, 'Skal med')}
          </div>
        </section>`
          : `<section class="block"><div class="note-box">${icon('how_to_reg')}<p>Når du er færdig, så tryk på knappen. Så kan en voksen godkende det i forældrepanelet.</p></div></section>`
      }
      <button type="button" class="btn btn-lg btn-block" data-act="sendTask" ${photoStep && !d.after ? 'disabled' : ''}>${icon('send')}Send til godkendelse</button>`;
  },
  changes: {
    async proof(el) {
      const f = el.files?.[0];
      if (!f) return;
      try {
        const url = await fileToDataUrl(f, { max: 900, quality: 0.75 });
        app.draft.task[el.dataset.slot] = url;
        rerender();
      } catch {
        toast('Billedet kunne ikke læses', { icon: 'error', tone: 'coral' });
      }
    },
  },
  actions: {
    pickTaskToy({ id }) {
      app.draft.task.toyId = id;
      rerender();
    },
    readTask({ id }) {
      const a = activityById(id);
      if (!a) return;
      const how = a.kind === 'photo'
        ? 'Tag et billede, når du er færdig, og send det. Så godkender en voksen det.'
        : 'Når du er færdig, så tryk send. Så godkender en voksen det.';
      say(`${a.title}. ${a.desc || ''} Du får ${a.xp} XP. ${how}`, { interrupt: true });
    },
    async sendTask(_d, el) {
      const d = app.draft.task;
      const a = activityById(d.id);
      el.disabled = true;
      const photos = [];
      if (d.before) photos.push({ role: 'foer', dataUrl: d.before });
      if (d.after) photos.push({ role: 'efter', dataUrl: d.after });
      const r = await submitActivity({ childId: app.childId, toyId: d.toyId, activityId: d.id, photos, via: a.kind });
      if (!r.ok) {
        el.disabled = false;
        return toast(r.reason, { icon: 'error', tone: 'coral' });
      }
      app.draft.task = null;
      sfx.coin();
      toast('Sendt! En voksen godkender den snart.', { icon: 'send', tone: 'mint' });
      say('Sendt! En voksen godkender den snart.', { interrupt: true });
      back(a.cat === 'bevaegelse' ? 'training' : 'tasks');
    },
  },
};

function proofSlot(slot, label, url, hint) {
  return `<label class="proof ${url ? 'has-photo' : ''}">
    ${url ? `<img src="${url}" alt="${esc(label)}">` : `${icon('photo_camera', 'drop-ic')}`}
    <b>${esc(label)}</b><small>${url ? 'Tryk for at tage et nyt' : esc(hint)}</small>
    <input type="file" accept="image/*" capture="environment" class="sr-only" data-change="proof" data-slot="${slot}">
  </label>`;
}

// ---------- Pokaler ----------

export const trophies = {
  nav: 'home',
  render() {
    const c = me();
    const got = S.achievements[c.id] || {};
    const ctx = achievementContext(S, c.id);
    const hist = S.xpLog.filter((e) => e.childId === c.id).slice(-25).reverse();
    const recs = [
      ['sports_gymnastics', 'Sprællemænd', ctx.reps.sprael || 0],
      ['chair', 'Squats', ctx.reps.squat || 0],
      ['directions_run', 'Knæløft', ctx.reps.knae || 0],
      ['arrow_upward', 'Hop', ctx.reps.hop || 0],
      ['sprint', 'Træninger', ctx.trainings],
      ['cleaning_services', 'Oprydninger', ctx.cats.oprydning || 0],
      ['volunteer_activism', 'Hjælp hjemme', ctx.cats.hjaelp || 0],
      ['emoji_events', 'Sejre', ctx.wins],
      ['flag', 'Missioner', ctx.missions],
      ['favorite', 'Pleje', ctx.care],
    ];
    return `${pageHead('Pokaler og rekorder', { backTo: true, sub: `${Object.keys(got).length} af ${ACHIEVEMENTS.length} pokaler` })}
      <div class="ach-grid">${ACHIEVEMENTS.map(
        (a) => `<div class="ach ${got[a.id] ? 'is-got' : ''}">${icon(got[a.id] ? a.icon : 'lock', 'ach-ic')}<b>${esc(a.title)}</b><span>${esc(a.desc)}</span></div>`,
      ).join('')}</div>
      <section class="panel"><h2 class="h3">${icon('military_tech')}Mine rekorder</h2>
        <div class="recs">${recs.map(([ic, n, v]) => `<div>${icon(ic)}<b>${v}</b><span>${n}</span></div>`).join('')}</div>
      </section>
      <section class="panel"><h2 class="h3">${icon('history')}Seneste XP</h2>
        ${hist.length ? `<ul class="hist">${hist.map((e) => historyLine(e, { withToy: true })).join('')}</ul>` : '<p class="help">Ingen XP endnu.</p>'}
      </section>`;
  },
};

export { historyLine, toyPicker };
