// Arenaen: udfordringer, svar og selve kampen med animation og replay.

import {
  S, toysOf, toyById, childById, battleById, createChallenge, acceptChallenge, declineChallenge,
  cancelChallenge, markBattleSeen,
} from '../actions.js';
import { levelInfo, checkBattleAllowed, battleCounts, SPECIAL_LEVEL, specialUnlocked } from '../rules.js';
import { CLASSES, MOVES } from '../catalog.js';
import { esc, dayKey, timeAgo, pick } from '../util.js';
import { app, go, back, rerender, me, others, setUnmount } from './app.js';
import { icon, toyCard, toyPhoto, levelBadge, avatar, empty, pageHead, moveIcon, photo, typeEmoji } from './components.js';
import { sfx, toast, confetti, reducedMotion } from './fx.js';
import { holdCelebrations } from './celebrations.js';
import { say, prefetch, stopSpeaking } from '../voice.js';

const childName = (id) => childById(id)?.name || 'En spiller';

function sideOf(b, childId) {
  return b.opponentId === childId ? 'b' : 'a';
}

function outcomeFor(b, side) {
  const w = b.result?.winner;
  if (!w) return null;
  if (w === 'draw') return 'draw';
  return w === side ? 'win' : 'loss';
}

const OUTCOME = {
  win: { text: 'Sejr', cls: 'ok', ic: 'emoji_events' },
  loss: { text: 'Nederlag', cls: 'no', ic: 'sentiment_dissatisfied' },
  draw: { text: 'Uafgjort', cls: 'wait', ic: 'handshake' },
};

// ---------- Arenaen ----------

export const arena = {
  nav: 'arena',
  render() {
    const c = me();
    const day = dayKey();
    const used = battleCounts(S, day).perChild[c.id] || 0;
    const opp = others();
    const incoming = S.battles.filter((b) => b.status === 'pending' && b.opponentId === c.id);
    const outgoing = S.battles.filter((b) => b.status === 'pending' && b.challengerId === c.id);
    const done = S.battles
      .filter((b) => b.status === 'done' && (b.challengerId === c.id || b.opponentId === c.id))
      .slice(-10)
      .reverse();
    const st = S.settings;
    return `${pageHead('Arenaen', { sub: `Kampe i dag: ${used} af ${st.battlesPerChild}` })}
      ${
        opp.length
          ? `<button type="button" class="btn btn-lg btn-coral btn-block arena-cta" data-act="newChallenge">${icon('swords')}Udfordr nogen</button>`
          : `<div class="note-box">${icon('group_add')}<p>Der er ingen at kæmpe mod endnu. En voksen kan tilføje flere spillere i forældrepanelet.</p></div>`
      }
      ${
        incoming.length
          ? `<section class="block"><h2 class="h2">${icon('notifications_active')}Du er udfordret</h2>${incoming
              .map((b) => {
                const t = toyById(b.challengerToyId);
                return `<div class="fight-row fight-in">
                  ${t ? toyPhoto(t, 'fight-img') : ''}
                  <div><b>${esc(childName(b.challengerId))} vil kæmpe</b><span>med ${esc(t?.name || 'et legetøj')} · LV ${t ? levelInfo(t.xp).level : '?'} · ${timeAgo(b.createdAt)}</span></div>
                  <button type="button" class="btn btn-sm btn-coral" data-act="go" data-to="respond" data-id="${b.id}">Svar</button>
                </div>`;
              })
              .join('')}</section>`
          : ''
      }
      ${
        outgoing.length
          ? `<section class="block"><h2 class="h2">${icon('hourglass_top')}Venter på svar</h2>${outgoing
              .map((b) => {
                const t = toyById(b.challengerToyId);
                return `<div class="fight-row">
                  ${t ? toyPhoto(t, 'fight-img') : ''}
                  <div><b>Til ${esc(childName(b.opponentId))}</b><span>${esc(t?.name || '')} er klar · ${timeAgo(b.createdAt)}</span></div>
                  <button type="button" class="btn btn-sm btn-ghost" data-act="cancelFight" data-id="${b.id}">Træk tilbage</button>
                </div>`;
              })
              .join('')}</section>`
          : ''
      }
      ${
        done.length
          ? `<section class="block"><h2 class="h2">${icon('history')}Seneste kampe</h2>${done
              .map((b) => {
                const side = sideOf(b, c.id);
                const o = OUTCOME[outcomeFor(b, side)];
                const mine = b.snap[side];
                const theirs = b.snap[side === 'a' ? 'b' : 'a'];
                const xp = b.xp?.[side] ?? 0;
                return `<button type="button" class="fight-row fight-done" data-act="go" data-to="battle" data-id="${b.id}">
                  ${photo(mine.photoId, mine.name, 'fight-img', typeEmoji(mine.type))}
                  <div><b>${esc(mine.name)} mod ${esc(theirs.name)}</b><span>${esc(childName(side === 'a' ? b.opponentId : b.challengerId))} · ${timeAgo(b.completedAt)} · +${xp} XP</span></div>
                  <span class="pill pill-${o.cls}">${icon(o.ic)}${o.text}</span>
                </button>`;
              })
              .join('')}</section>`
          : ''
      }
      <section class="panel rules">
        <h2 class="h3">${icon('menu_book')}Sådan kæmper man</h2>
        <div class="rps">
          <div>${moveIcon('angreb')}<b>Angreb</b><span>slår Finte</span></div>
          <div>${moveIcon('finte')}<b>Finte</b><span>slår Forsvar</span></div>
          <div>${moveIcon('forsvar')}<b>Forsvar</b><span>slår Angreb</span></div>
        </div>
        <p>Begge vælger tre træk i hemmelighed – ét til hver runde. Styrke, forsvar og hurtighed betyder meget, men gode gæt kan slå et højere level. Fra level ${SPECIAL_LEVEL} kan man bruge sit specialangreb én gang pr. kamp.</p>
        <p class="help">Hver figur kan kæmpe ${st.battlesPerToy} gange om dagen, og hver spiller ${st.battlesPerChild} gange. Sejr giver ${st.xpWin} XP, uafgjort ${st.xpDraw} og nederlag ${st.xpLoss} – højst ${st.battleXpCap} kamp-XP om dagen. Man mister aldrig XP.</p>
      </section>`;
  },
  actions: {
    newChallenge() {
      app.draft.challenge = { toyId: null, opponentId: null, moves: [] };
      go('challenge');
    },
    cancelFight({ id }) {
      const r = cancelChallenge(id, app.childId);
      if (!r.ok) return toast(r.reason, { icon: 'error' });
      toast('Udfordringen er trukket tilbage', { icon: 'undo' });
      rerender();
    },
  },
};

// ---------- Vælg træk ----------

function movePicker(moves, level, prefix) {
  const canSuper = specialUnlocked(level) && !moves.includes('super');
  const slots = [0, 1, 2]
    .map((i) => {
      const m = moves[i];
      return `<button type="button" class="slot ${m ? `slot-${m}` : ''}" data-act="${prefix}Clear" data-i="${i}" aria-label="Runde ${i + 1}: ${m ? MOVES[m].name : 'ikke valgt'}">
        <small>Runde ${i + 1}</small>${m ? `${moveIcon(m)}<b>${MOVES[m].name}</b>` : `${icon('help')}<b>?</b>`}
      </button>`;
    })
    .join('');
  const full = moves.length >= 3;
  const btn = (m, enabled = true) =>
    `<button type="button" class="move-btn move-${m}" data-act="${prefix}Move" data-move="${m}" ${full || !enabled ? 'disabled' : ''}>${moveIcon(m)}<b>${MOVES[m].name}</b><small>${MOVES[m].hint}</small></button>`;
  return `<div class="slots">${slots}</div>
    <div class="moves">${btn('angreb')}${btn('forsvar')}${btn('finte')}${specialUnlocked(level) ? btn('super', canSuper) : ''}</div>
    <div class="moves-foot">
      <button type="button" class="link" data-act="${prefix}Random">${icon('casino')}Vælg tilfældigt for mig</button>
      ${moves.length ? `<button type="button" class="link" data-act="${prefix}Reset">${icon('backspace')}Start forfra</button>` : ''}
    </div>`;
}

function randomMoves(level) {
  const m = [0, 1, 2].map(() => pick(['angreb', 'forsvar', 'finte']));
  if (specialUnlocked(level) && Math.random() < 0.4) m[Math.floor(Math.random() * 3)] = 'super';
  return m;
}

function battleToyPicker(childId, selectedId, act) {
  const day = dayKey();
  const list = toysOf(childId);
  return `<div class="toy-grid toy-grid-tight">${list
    .map((t) => {
      const ok = checkBattleAllowed(S, childId, t.id, day);
      return toyCard(t, {
        act,
        size: 'sm',
        selected: t.id === selectedId,
        disabled: !ok.ok,
        note: ok.ok ? `${ok.toyLeft} ${ok.toyLeft === 1 ? 'kamp' : 'kampe'} tilbage i dag` : 'Hviler resten af dagen',
      });
    })
    .join('')}</div>`;
}

// ---------- Udfordr ----------

export const challenge = {
  nav: 'arena',
  render() {
    const c = me();
    const d = (app.draft.challenge = app.draft.challenge || { toyId: null, opponentId: null, moves: [] });
    const list = toysOf(c.id);
    if (!list.length) {
      return `${pageHead('Udfordr nogen', { backTo: true })}${empty({
        icon: 'add_a_photo',
        title: 'Du skal have en figur først',
        action: `<button type="button" class="btn btn-lg" data-act="go" data-to="newtoy">${icon('add_a_photo')}Opret legetøj</button>`,
      })}`;
    }
    const opp = others();
    if (opp.length === 1 && !d.opponentId) d.opponentId = opp[0].id;
    const day = dayKey();
    if (d.toyId && !checkBattleAllowed(S, c.id, d.toyId, day).ok) d.toyId = null;
    const toy = d.toyId ? toyById(d.toyId) : null;
    const level = toy ? levelInfo(toy.xp).level : 1;
    const ready = toy && d.opponentId && d.moves.length === 3;
    return `${pageHead('Udfordr nogen', { backTo: true, sub: 'Modstanderen kan ikke se dine træk' })}
      <section class="block">
        <h2 class="step-h"><span class="step-n">1</span>Vælg din figur</h2>
        ${battleToyPicker(c.id, d.toyId, 'chToy')}
      </section>
      <section class="block">
        <h2 class="step-h"><span class="step-n">2</span>Hvem vil du udfordre?</h2>
        <div class="opp-grid">${opp
          .map((o) => {
            const best = toysOf(o.id).reduce((m, t) => Math.max(m, levelInfo(t.xp).level), 0);
            return `<button type="button" class="opp-btn ${d.opponentId === o.id ? 'is-selected' : ''}" data-act="chOpp" data-id="${o.id}" aria-pressed="${d.opponentId === o.id}">
              ${avatar(o, 'md')}<b>${esc(o.name)}</b><small>${best ? `Bedste figur LV ${best}` : 'Har ingen figurer endnu'}</small>
            </button>`;
          })
          .join('')}</div>
      </section>
      <section class="block ${toy ? '' : 'is-dim'}">
        <h2 class="step-h"><span class="step-n">3</span>Vælg dine tre træk</h2>
        ${toy ? movePicker(d.moves, level, 'ch') : '<p class="help">Vælg en figur først.</p>'}
      </section>
      <button type="button" class="btn btn-lg btn-coral btn-block" data-act="chSend" ${ready ? '' : 'disabled'}>${icon('send')}Send udfordringen</button>`;
  },
  actions: {
    chToy({ id }) {
      const d = app.draft.challenge;
      if (d.toyId !== id) d.moves = [];
      d.toyId = id;
      sfx.tap();
      rerender();
    },
    chOpp({ id }) {
      app.draft.challenge.opponentId = id;
      sfx.tap();
      rerender();
    },
    chMove({ move }) {
      const d = app.draft.challenge;
      if (d.moves.length < 3) d.moves.push(move);
      sfx.tap();
      rerender();
    },
    chClear({ i }) {
      const d = app.draft.challenge;
      d.moves.splice(Number(i), 1);
      rerender();
    },
    chReset() {
      app.draft.challenge.moves = [];
      rerender();
    },
    chRandom() {
      const d = app.draft.challenge;
      const t = toyById(d.toyId);
      if (!t) return;
      d.moves = randomMoves(levelInfo(t.xp).level);
      sfx.whoosh();
      rerender();
    },
    chSend() {
      const d = app.draft.challenge;
      const r = createChallenge({ challengerId: app.childId, toyId: d.toyId, opponentId: d.opponentId, moves: d.moves });
      if (!r.ok) {
        sfx.error();
        return toast(r.reason, { icon: 'error', tone: 'coral' });
      }
      app.draft.challenge = null;
      sfx.coin();
      toast(`Udfordringen er sendt til ${childName(r.battle.opponentId)}!`, { icon: 'send', tone: 'mint', ms: 3500 });
      say(`Udfordringen er sendt til ${childName(r.battle.opponentId)}!`, { interrupt: true });
      go('arena', {}, { replace: true });
    },
  },
};

// ---------- Svar på en udfordring ----------

export const respond = {
  nav: 'arena',
  render({ id }) {
    const c = me();
    const b = battleById(id);
    if (!b || b.status !== 'pending' || b.opponentId !== c.id) {
      return `${pageHead('Udfordring', { backTo: true })}${empty({ icon: 'hourglass_disabled', title: 'Udfordringen er ikke længere aktiv', action: `<button type="button" class="btn" data-act="go" data-to="arena">Til arenaen</button>` })}`;
    }
    const d = app.draft.respond && app.draft.respond.id === id ? app.draft.respond : (app.draft.respond = { id, toyId: null, moves: [] });
    const day = dayKey();
    if (d.toyId && !checkBattleAllowed(S, c.id, d.toyId, day).ok) d.toyId = null;
    const theirs = toyById(b.challengerToyId);
    const toy = d.toyId ? toyById(d.toyId) : null;
    const level = toy ? levelInfo(toy.xp).level : 1;
    const list = toysOf(c.id);
    const ready = toy && d.moves.length === 3;
    return `${pageHead('Du er udfordret!', { backTo: true, sub: `${esc(childName(b.challengerId))} har valgt sine træk i hemmelighed` })}
      <section class="challenger">
        ${theirs ? toyCard(theirs, { size: 'md' }) : ''}
        <p>${avatar(childById(b.challengerId), 'sm')} <b>${esc(childName(b.challengerId))}</b> kæmper med ${esc(theirs?.name || 'et legetøj')}</p>
      </section>
      ${
        list.length
          ? `<section class="block">
          <h2 class="step-h"><span class="step-n">1</span>Vælg din figur</h2>
          ${battleToyPicker(c.id, d.toyId, 'reToy')}
        </section>
        <section class="block ${toy ? '' : 'is-dim'}">
          <h2 class="step-h"><span class="step-n">2</span>Vælg dine tre træk</h2>
          ${toy ? movePicker(d.moves, level, 're') : '<p class="help">Vælg en figur først.</p>'}
        </section>
        <button type="button" class="btn btn-lg btn-coral btn-block" data-act="reFight" ${ready ? '' : 'disabled'}>${icon('swords')}Kæmp!</button>`
          : `<div class="note-box">${icon('add_a_photo')}<p>Du skal have en figur for at kæmpe. <button type="button" class="link" data-act="go" data-to="newtoy">Opret en nu</button></p></div>`
      }
      <button type="button" class="btn btn-ghost btn-block" data-act="reDecline">Nej tak, ikke nu</button>`;
  },
  actions: {
    reToy({ id }) {
      const d = app.draft.respond;
      if (d.toyId !== id) d.moves = [];
      d.toyId = id;
      sfx.tap();
      rerender();
    },
    reMove({ move }) {
      const d = app.draft.respond;
      if (d.moves.length < 3) d.moves.push(move);
      sfx.tap();
      rerender();
    },
    reClear({ i }) {
      app.draft.respond.moves.splice(Number(i), 1);
      rerender();
    },
    reReset() {
      app.draft.respond.moves = [];
      rerender();
    },
    reRandom() {
      const d = app.draft.respond;
      const t = toyById(d.toyId);
      if (!t) return;
      d.moves = randomMoves(levelInfo(t.xp).level);
      sfx.whoosh();
      rerender();
    },
    reDecline() {
      const d = app.draft.respond;
      const r = declineChallenge(d.id, app.childId);
      app.draft.respond = null;
      if (!r.ok) return toast(r.reason, { icon: 'error' });
      toast('Du sagde nej tak. Måske næste gang!', { icon: 'waving_hand' });
      say('Du sagde nej tak. Måske næste gang!', { interrupt: true });
      go('arena', {}, { replace: true });
    },
    reFight() {
      const d = app.draft.respond;
      holdCelebrations(true);
      const r = acceptChallenge(d.id, { childId: app.childId, toyId: d.toyId, moves: d.moves });
      if (!r.ok) {
        holdCelebrations(false);
        sfx.error();
        toast(r.reason, { icon: 'error', tone: 'coral', ms: 4500 });
        rerender();
        return;
      }
      app.draft.respond = null;
      go('battle', { id: r.battle.id, fresh: true }, { replace: true });
    },
  },
};

// ---------- Selve kampen ----------

function special(cls) {
  return CLASSES[cls]?.special?.name || 'Super';
}

function roundText(L, R, mL, mR) {
  const n = (x) => x.name;
  if (mL === 'super' && mR === 'super') return `${n(L)} bruger ${special(L.cls)}, og ${n(R)} bruger ${special(R.cls)}! Det brager!`;
  if (mL === 'super') return `${n(L)} bruger sit specialangreb: ${special(L.cls)}!`;
  if (mR === 'super') return `${n(R)} bruger sit specialangreb: ${special(R.cls)}!`;
  const key = `${mL}-${mR}`;
  const T = {
    'angreb-angreb': `${n(L)} og ${n(R)} angriber på samme tid!`,
    'angreb-forsvar': `${n(R)} blokerer angrebet og slår igen!`,
    'forsvar-angreb': `${n(L)} blokerer angrebet og slår igen!`,
    'angreb-finte': `${n(L)} angriber lige igennem ${n(R)}s finte!`,
    'finte-angreb': `${n(R)} angriber lige igennem ${n(L)}s finte!`,
    'forsvar-forsvar': 'Begge holder garden. Ingen tør angribe!',
    'forsvar-finte': `${n(R)} narrer ${n(L)} med en finte!`,
    'finte-forsvar': `${n(L)} narrer ${n(R)} med en finte!`,
    'finte-finte': 'To finter på én gang – de snubler begge!',
  };
  return T[key] || '';
}

let play = null;

function releaseWaits(p) {
  p.timers.forEach(clearTimeout);
  p.timers = [];
  const ws = p.waiters;
  p.waiters = [];
  ws.forEach((r) => r());
}

function stopPlay() {
  if (!play) return;
  play.cancelled = true;
  releaseWaits(play);
  play = null;
  stopSpeaking();
}

// Venter, men kan afbrydes af "Spring over" eller når man forlader skærmen
function wait(p, ms) {
  return new Promise((res) => {
    if (p.skip || p.cancelled) return res();
    const k = reducedMotion() ? 0.5 : 1;
    const done = () => {
      p.waiters = p.waiters.filter((w) => w !== done);
      res();
    };
    p.waiters.push(done);
    p.timers.push(setTimeout(done, ms * k));
  });
}

export const battle = {
  chrome: false,
  render({ id }) {
    const b = battleById(id);
    const c = me();
    if (!b || b.status !== 'done') {
      return `<div class="battle"><p class="battle-missing">Kampen findes ikke.</p><button type="button" class="btn" data-act="go" data-to="arena">Til arenaen</button></div>`;
    }
    const mySide = sideOf(b, c.id);
    const L = b.snap[mySide];
    const R = b.snap[mySide === 'a' ? 'b' : 'a'];
    const fighter = (s, pos) => `<div class="fighter fighter-${pos}" id="f-${pos}">
      <div class="fighter-move" id="m-${pos}" aria-hidden="true"></div>
      <div class="fighter-card">
        ${photo(s.photoId, s.name, 'fighter-img', typeEmoji(s.type))}
        ${levelBadge(s.level)}
        <div class="fighter-dmg" id="d-${pos}" aria-hidden="true"></div>
      </div>
      <b class="fighter-name">${esc(s.name)}</b>
      <div class="hp"><span class="hp-track"><i id="hp-${pos}" style="width:100%"></i></span><b id="hpn-${pos}">100</b></div>
    </div>`;
    return `<div class="battle" id="battle">
      <header class="battle-top">
        <button type="button" class="icon-btn icon-btn-dark" data-act="btClose" aria-label="Luk">${icon('close')}</button>
        <p class="battle-round" id="round">Kampen starter!</p>
        <button type="button" class="btn btn-sm btn-ghost-dark" data-act="btSkip" id="bt-skip">${icon('skip_next')}Spring over</button>
      </header>
      <div class="battle-stage">
        <div class="battle-floor">
          ${fighter(L, 'left')}
          <div class="vs" aria-hidden="true">VS</div>
          ${fighter(R, 'right')}
        </div>
        <p class="commentary" id="commentary" aria-live="polite"></p>
        <div class="battle-result" id="result" hidden></div>
      </div>
    </div>`;
  },
  mount(root, { id, fresh }) {
    stopPlay();
    const b = battleById(id);
    if (!b || b.status !== 'done') return;
    const firstView = fresh || b.seen?.[app.childId] === false;
    markBattleSeen(id, app.childId);
    holdCelebrations(true);
    setUnmount(() => {
      stopPlay();
      holdCelebrations(false);
    });
    play = { timers: [], waiters: [], skip: false, cancelled: false, b, firstView };
    prefetch(battleSpeech(b, sideOf(b, app.childId)));
    runBattle(play);
  },
  actions: {
    btSkip() {
      if (!play) return;
      play.skip = true;
      releaseWaits(play);
    },
    btClose() {
      stopPlay();
      go('arena', {}, { replace: true });
    },
    btReplay() {
      const id = app.route.params.id;
      go('battle', { id }, { replace: true });
    },
    btArena() {
      stopPlay();
      go('arena', {}, { replace: true });
    },
  },
};

async function runBattle(p) {
  const b = p.b;
  const mySide = sideOf(b, app.childId);
  const pos = (side) => (side === mySide ? 'left' : 'right');
  const snap = { left: b.snap[mySide], right: b.snap[mySide === 'a' ? 'b' : 'a'] };
  const $ = (id) => document.getElementById(id);
  const setText = (id, t) => {
    const el = $(id);
    if (el) el.textContent = t;
  };
  const setHp = (where, hp) => {
    const bar = $(`hp-${where}`);
    if (bar) {
      bar.style.width = `${hp}%`;
      bar.classList.toggle('low', hp <= 30);
    }
    setText(`hpn-${where}`, String(hp));
  };
  const anim = (id, cls) => {
    const el = $(id);
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };
  const showMove = (where, m) => {
    const el = $(`m-${where}`);
    if (!el) return;
    el.className = `fighter-move move-${m} show`;
    el.innerHTML = `${moveIcon(m)}<b>${m === 'super' ? esc(special(snap[where].cls)) : MOVES[m].name}</b>`;
  };
  const clearMoves = () => ['left', 'right'].forEach((w) => {
    const el = $(`m-${w}`);
    if (el) el.className = 'fighter-move';
  });

  $('f-left')?.classList.add('enter');
  $('f-right')?.classList.add('enter');
  sfx.whoosh();
  say('Kampen starter!', { interrupt: true });
  await wait(p, 1200);

  for (const r of b.result.rounds) {
    if (p.cancelled) return;
    if (p.skip) break;
    clearMoves();
    setText('round', `Runde ${r.round}`);
    anim('round', 'pop');
    sfx.beep(false);
    say(`Runde ${r.round}!`, { interrupt: true });
    await wait(p, 800);
    const mL = mySide === 'a' ? r.mA : r.mB;
    const mR = mySide === 'a' ? r.mB : r.mA;
    showMove('left', mL);
    showMove('right', mR);
    sfx.whoosh();
    setText('commentary', roundText(snap.left, snap.right, mL, mR));
    say(roundText(snap.left, snap.right, mL, mR));
    await wait(p, 1100);
    if (!r.hits.length && !p.skip) {
      sfx.block();
      anim('f-left', 'guard');
      anim('f-right', 'guard');
      await wait(p, 900);
    }
    for (const h of r.hits) {
      if (p.cancelled) return;
      if (p.skip) break;
      const att = pos(h.by);
      const def = att === 'left' ? 'right' : 'left';
      anim(`f-${att}`, `lunge-${att}`);
      await wait(p, 220);
      if (h.dodged) {
        sfx.whoosh();
        anim(`f-${def}`, 'dodge');
        setText(`d-${def}`, 'Undveg!');
        anim(`d-${def}`, 'float');
        setText('commentary', `${snap[def].name} undviger!`);
      } else {
        h.crit ? sfx.crit() : sfx.hit();
        anim(`f-${def}`, 'hurt');
        setText(`d-${def}`, `-${h.dmg}${h.crit ? '!' : ''}`);
        anim(`d-${def}`, 'float');
        if (h.crit) {
          setText('commentary', `Fuldtræffer fra ${snap[att].name}!`);
          say('Fuldtræffer!');
        }
      }
      // HP efter dette slag: regn baglæns fra rundens hits
      const hpAfter = hpAfterHit(b, r, h);
      setHp('left', mySide === 'a' ? hpAfter.a : hpAfter.b);
      setHp('right', mySide === 'a' ? hpAfter.b : hpAfter.a);
      await wait(p, 950);
    }
  }
  if (p.cancelled) return;
  finishBattle(p, mySide, snap);
}

// HP for begge efter et bestemt slag i en runde
function hpAfterHit(b, round, hit) {
  const idx = b.result.rounds.indexOf(round);
  const prev = idx > 0 ? b.result.rounds[idx - 1] : { hpA: 100, hpB: 100 };
  let a = prev.hpA;
  let bb = prev.hpB;
  for (const h of round.hits) {
    if (h.by === 'a') bb = Math.max(0, bb - h.dmg);
    else a = Math.max(0, a - h.dmg);
    if (h === hit) break;
  }
  return { a, b: bb };
}

function finishBattle(p, mySide, snap) {
  if (p.cancelled) return;
  const b = p.b;
  const $ = (id) => document.getElementById(id);
  const res = b.result;
  const myHp = mySide === 'a' ? res.hpA : res.hpB;
  const theirHp = mySide === 'a' ? res.hpB : res.hpA;
  $('hp-left') && ($('hp-left').style.width = `${myHp}%`);
  $('hp-right') && ($('hp-right').style.width = `${theirHp}%`);
  const n1 = $('hpn-left');
  const n2 = $('hpn-right');
  if (n1) n1.textContent = myHp;
  if (n2) n2.textContent = theirHp;
  const outcome = outcomeFor(b, mySide);
  const winnerPos = outcome === 'win' ? 'left' : outcome === 'loss' ? 'right' : null;
  if (winnerPos) {
    $(`f-${winnerPos}`)?.classList.add('winner');
    $(`f-${winnerPos === 'left' ? 'right' : 'left'}`)?.classList.add(res.ko ? 'ko' : 'beaten');
  }
  const skip = $('bt-skip');
  if (skip) skip.hidden = true;
  const round = $('round');
  if (round) round.textContent = res.ko ? 'K.O.!' : 'Slut!';
  const xp = b.xp?.[mySide] ?? 0;
  const capped = mySide === 'a' ? b.xp?.cappedA : b.xp?.cappedB;
  const title = outcome === 'win' ? 'Du vandt!' : outcome === 'loss' ? 'Du tabte' : 'Uafgjort!';
  const sub =
    outcome === 'win'
      ? `${esc(snap.left.name)} besejrede ${esc(snap.right.name)}${res.ko ? ' med et knockout' : ''}.`
      : outcome === 'loss'
        ? `${esc(snap.right.name)} vandt denne gang. ${esc(snap.left.name)} får stadig XP for at kæmpe.`
        : 'Lige stærke! Begge får XP.';
  const el = $('result');
  if (el) {
    el.innerHTML = `<div class="result-card result-${outcome}">
      <h2>${title}</h2>
      <p>${sub}</p>
      <p class="result-xp">+${xp} XP <small>til ${esc(snap.left.name)}</small></p>
      ${capped ? `<p class="help">Du har fået de ${S.settings.battleXpCap} kamp-XP, man kan få i dag. Træn eller løs opgaver for mere XP.</p>` : ''}
      <div class="result-btns">
        <button type="button" class="btn btn-ghost-dark" data-act="btReplay">${icon('replay')}Se igen</button>
        <button type="button" class="btn" data-act="btArena">${icon('check')}Færdig</button>
      </div>
    </div>`;
    el.hidden = false;
  }
  if (outcome === 'win') {
    sfx.win();
    if (p.firstView) confetti();
  } else if (outcome === 'loss') sfx.lose();
  else sfx.coin();
  say(resultSpeech(b, mySide), { interrupt: true });
  setTimeout(() => holdCelebrations(false), 2600);
}

function resultSpeech(b, mySide) {
  const L = b.snap[mySide];
  const R = b.snap[mySide === 'a' ? 'b' : 'a'];
  const outcome = outcomeFor(b, mySide);
  const xp = b.xp?.[mySide] ?? 0;
  if (outcome === 'win') return `Du vandt! ${L.name} besejrede ${R.name}${b.result.ko ? ' med et knockout' : ''}. Du får ${xp} XP.`;
  if (outcome === 'loss') return `Du tabte denne gang. ${L.name} får stadig ${xp} XP for at kæmpe.`;
  return `Uafgjort! Begge får ${xp} XP.`;
}

// Alt det, der bliver sagt i kampen, så Azure-lyden kan hentes på forhånd
function battleSpeech(b, mySide) {
  const L = b.snap[mySide];
  const R = b.snap[mySide === 'a' ? 'b' : 'a'];
  const out = ['Kampen starter!', 'Fuldtræffer!', resultSpeech(b, mySide)];
  for (const r of b.result.rounds) {
    out.push(`Runde ${r.round}!`);
    out.push(roundText(L, R, mySide === 'a' ? r.mA : r.mB, mySide === 'a' ? r.mB : r.mA));
  }
  return out;
}
