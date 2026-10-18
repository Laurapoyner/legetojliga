// Starter spillet, viser den rigtige skærm og fordeler tryk til skærmenes handlinger.

import * as A from './actions.js';
import { app, setRenderer, go, back, rerender, me } from './ui/app.js';
import * as K from './ui/screens.js';
import { exercise } from './ui/exercise.js';
import { arena, challenge, respond, battle } from './ui/arena.js';
import { parent } from './ui/parent.js';
import { setup } from './ui/setup.js';
import { flushCelebrations } from './ui/celebrations.js';
import { icon, avatar } from './ui/components.js';
import { sfx, toast, closeModal, isSoundOn, setSound, unlockAudio, modalOpen, celebrating } from './ui/fx.js';
import { esc } from './util.js';
import { unlockVoice, stopSpeaking } from './voice.js';
import * as cloud from './cloud.js';

const SCREENS = {
  setup,
  who: K.who,
  home: K.home,
  toys: K.toys,
  newtoy: K.newtoy,
  toy: K.toy,
  care: K.care,
  training: K.training,
  exercise,
  tasks: K.tasks,
  task: K.task,
  trophies: K.trophies,
  arena,
  challenge,
  respond,
  battle,
  parent,
};

// Skærme der kan vises uden en valgt spiller
const OPEN = new Set(['setup', 'who', 'parent']);

const NAV = [
  { id: 'home', to: 'home', name: 'Hjem', icon: 'home' },
  { id: 'toys', to: 'toys', name: 'Figurer', icon: 'kid_star' },
  { id: 'training', to: 'training', name: 'Træn', icon: 'sprint' },
  { id: 'tasks', to: 'tasks', name: 'Opgaver', icon: 'task_alt' },
  { id: 'arena', to: 'arena', name: 'Arena', icon: 'swords' },
];

const root = document.getElementById('app');

function badgeFor(id, c) {
  if (id === 'arena') {
    return A.S.battles.filter(
      (b) => (b.status === 'pending' && b.opponentId === c.id) || (b.challengerId === c.id && b.seen?.[c.id] === false),
    ).length;
  }
  if (id === 'home') return K.claimableMissions(c.id) + A.S.submissions.filter((s) => s.childId === c.id && s.seen === false).length;
  return 0;
}

function shell(body, scr) {
  const c = me();
  const active = scr.nav;
  return `<header class="topbar">
      <button type="button" class="me-chip" data-act="go" data-to="who" aria-label="Skift spiller (${esc(c.name)})">${avatar(c, 'sm')}<span>${esc(c.name)}</span>${icon('expand_more')}</button>
      <span class="brand">${K.logo()}</span>
      <div class="top-actions">
        <button type="button" class="icon-btn" data-act="toggleSound" aria-label="${isSoundOn() ? 'Slå lyd fra' : 'Slå lyd til'}" aria-pressed="${isSoundOn()}">${icon(isSoundOn() ? 'volume_up' : 'volume_off')}</button>
        <button type="button" class="icon-btn" data-act="go" data-to="parent" aria-label="Forældrepanel">${icon('lock')}</button>
      </div>
    </header>
    <main class="page" id="main" tabindex="-1">${body}</main>
    <nav class="tabbar" aria-label="Hovedmenu">${NAV.map((n) => {
      const b = badgeFor(n.id, c);
      return `<button type="button" class="tab ${active === n.id ? 'is-on' : ''}" data-act="go" data-to="${n.to}" ${active === n.id ? 'aria-current="page"' : ''}>
        ${icon(n.icon)}<span>${n.name}</span>${b ? `<b class="badge" aria-label="${b} nye">${b}</b>` : ''}
      </button>`;
    }).join('')}</nav>`;
}

function render(navChanged) {
  if (!A.S.family && app.route.name !== 'setup') app.route = { name: 'setup', params: {} };
  if (A.S.family && app.route.name === 'setup') app.route = { name: 'who', params: {} };
  if (!OPEN.has(app.route.name) && (!me() || me().archived)) {
    app.childId = null;
    app.route = { name: 'who', params: {} };
  }
  const scr = SCREENS[app.route.name] || SCREENS.who;
  const params = app.route.params || {};
  const y = window.scrollY;
  let html;
  try {
    html = scr.render(params);
  } catch (e) {
    console.error(e);
    html = `<div class="crash"><h1>Ups!</h1><p>Noget gik galt på denne skærm.</p><button type="button" class="btn" data-act="go" data-to="who">Til start</button></div>`;
  }
  root.innerHTML = scr.chrome === false ? html : shell(html, scr);
  root.dataset.screen = app.route.name;
  document.documentElement.dataset.screen = app.route.name;
  try {
    scr.mount?.(root, params);
  } catch (e) {
    console.error(e);
  }
  if (navChanged) {
    window.scrollTo(0, 0);
    root.querySelector('h1')?.setAttribute('tabindex', '-1');
  } else {
    window.scrollTo(0, y);
  }
  flushCelebrations();
}

// ---------- Billeder hentes, når de dukker op på skærmen ----------

function hydrate(scope) {
  const imgs = scope.querySelectorAll ? scope.querySelectorAll('img[data-photo]:not([src])') : [];
  for (const img of imgs) {
    const id = img.dataset.photo;
    const cached = A.cachedPhoto(id);
    if (cached) {
      img.src = cached;
      continue;
    }
    A.photoUrl(id).then((url) => {
      if (url) img.src = url;
      else img.classList.add('is-missing');
    });
  }
}

new MutationObserver((list) => {
  for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) hydrate(n.matches?.('img[data-photo]') ? n.parentNode || n : n);
}).observe(document.body, { childList: true, subtree: true });

// ---------- Tryk, formularer og felter ----------

const GLOBAL = {
  go({ to, id }) {
    sfx.tap();
    closeModal();
    go(to, id ? { id } : {});
  },
  back() {
    closeModal();
    back();
  },
  openToy({ id }) {
    sfx.tap();
    closeModal();
    go('toy', { id });
  },
  toggleSound() {
    setSound(!isSoundOn());
    if (isSoundOn()) {
      unlockAudio();
      sfx.coin();
    } else {
      stopSpeaking();
    }
    rerender();
  },
  closeModal() {
    closeModal();
  },
};

let firstTap = true;

document.addEventListener('click', async (e) => {
  // iPad tillader først lyd og oplæsning efter et tryk
  if (firstTap) {
    firstTap = false;
    unlockAudio();
    unlockVoice();
  }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const scr = SCREENS[app.route.name];
  const fn = GLOBAL[act] || scr?.actions?.[act];
  if (!fn) return;
  e.preventDefault();
  try {
    await fn(el.dataset, el, e);
  } catch (err) {
    console.error(err);
    toast('Noget gik galt. Prøv igen.', { icon: 'error', tone: 'coral' });
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = SCREENS[app.route.name]?.forms?.[form.dataset.form];
  if (!fn) return;
  const btn = form.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  try {
    await fn(form, e);
  } catch (err) {
    console.error(err);
    toast('Noget gik galt. Prøv igen.', { icon: 'error', tone: 'coral' });
  } finally {
    if (btn && btn.isConnected) btn.disabled = false;
  }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = SCREENS[app.route.name]?.changes?.[el.dataset.change];
  if (fn) Promise.resolve(fn(el, e)).catch((err) => console.error(err));
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (!el) return;
  SCREENS[app.route.name]?.inputs?.[el.dataset.input]?.(el.value, el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen()) closeModal();
});

// ---------- Start ----------

function iconsReady() {
  const done = () => document.documentElement.classList.add('icons-ready');
  if (!document.fonts?.load) return done();
  document.fonts
    .load('24px "Material Symbols Rounded"', 'home')
    .then((faces) => {
      if (faces && faces.length) done();
      else document.documentElement.classList.add('icons-fallback');
    })
    .catch(() => document.documentElement.classList.add('icons-fallback'));
  setTimeout(() => {
    if (!document.documentElement.classList.contains('icons-ready')) {
      if (document.fonts.check('24px "Material Symbols Rounded"')) done();
      else document.documentElement.classList.add('icons-fallback');
    }
  }, 4000);
}

async function boot() {
  iconsReady();
  try {
    app.storage = await A.loadGame();
  } catch (e) {
    console.error(e);
    root.innerHTML = '<div class="crash"><h1>Spillet kunne ikke starte</h1><p>Prøv at genindlæse siden.</p></div>';
    return;
  }
  A.bus.on('saveError', () => toast('Kunne ikke gemme. Der er måske ikke mere plads på enheden.', { icon: 'warning', tone: 'coral', ms: 5000 }));
  window.addEventListener('pagehide', () => A.flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) A.flushSave();
  });
  setRenderer(render);
  go(A.S.family ? 'who' : 'setup', {}, { replace: true });

  const isBusy = () => modalOpen() || celebrating() || ['exercise', 'battle', 'newtoy', 'task'].includes(app.route.name);
  const isTyping = () => document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

  // Nyt fra en anden enhed: vis det, når barnet ikke er midt i noget
  let pendingRemote = false;
  const showRemote = () => {
    if (isBusy() || isTyping()) {
      pendingRemote = true;
      return;
    }
    pendingRemote = false;
    if (app.route.name === 'setup' && A.S.family) go('who', {}, { replace: true });
    else rerender();
  };
  A.bus.on('remote', showRemote);
  A.bus.on('cloud', (e) => {
    if (e.kind === 'unlinked') toast('Denne enhed er ikke længere forbundet til familien.', { icon: 'cloud_off', tone: 'coral', ms: 5000 });
  });
  cloud.initCloud().then(() => {
    if (app.route.name === 'setup' || app.route.name === 'parent') rerender();
  });

  // Opdater nedtællinger og udløbne udfordringer en gang i minuttet
  setInterval(() => {
    A.cleanup();
    if (!isBusy() && !isTyping() && !document.hidden && !['setup', 'parent'].includes(app.route.name)) rerender();
  }, 60000);
  setInterval(() => {
    if (pendingRemote) showRemote();
  }, 3000);
}

boot();
