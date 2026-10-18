// Forældrepanelet: godkend opgaver, ret point og grænser, styr profiler og lav backup.

import * as A from '../actions.js';
import { S } from '../actions.js';
import { levelInfo, xpForLevel, MAX_LEVEL, limitText, activityUsage } from '../rules.js';
import { CATEGORIES, DIFFICULTY, AVATAR_COLORS, KIND_LABEL } from '../catalog.js';
import { esc, timeAgo, fmtDate } from '../util.js';
import { app, go, back, rerender, parentUnlocked, unlockParent, lockParent } from './app.js';
import { icon, toyPhoto, avatar, kindPill, photo, empty, statusPill } from './components.js';
import { sfx, toast, openModal, closeModal } from './fx.js';
import { historyLine } from './screens.js';
import * as cloud from '../cloud.js';
import { AZURE_VOICES, RATES, voiceSettings, voiceProvider, resetVoiceProvider, say, stopSpeaking } from '../voice.js';

const TABS = [
  { id: 'godkend', name: 'Godkend', icon: 'how_to_reg' },
  { id: 'opgaver', name: 'Opgaver og XP', icon: 'checklist' },
  { id: 'boern', name: 'Børn', icon: 'family_restroom' },
  { id: 'legetoej', name: 'Legetøj', icon: 'toys' },
  { id: 'graenser', name: 'Grænser', icon: 'tune' },
  { id: 'stemme', name: 'Stemme', icon: 'record_voice_over' },
  { id: 'historik', name: 'Historik', icon: 'history' },
  { id: 'data', name: 'Data', icon: 'save' },
];

const VIA = { photo: 'Foto', adult: 'Voksen bekræfter', manual: 'Kameraet virkede ikke' };

let pinBuf = '';

function pinPad(error = '') {
  return `<div class="pin">
    <div class="brand">${icon('lock', 'pin-lock')}</div>
    <h1>Forældrepanel</h1>
    <p>Skriv jeres PIN-kode</p>
    <div class="pin-dots ${error ? 'shake' : ''}" aria-live="polite" aria-label="${pinBuf.length} af 4 cifre">${[0, 1, 2, 3].map((i) => `<i class="${i < pinBuf.length ? 'on' : ''}"></i>`).join('')}</div>
    ${error ? `<p class="pin-err">${esc(error)}</p>` : ''}
    <div class="pin-pad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" data-act="pinKey" data-d="${d}">${d}</button>`).join('')}
      <button type="button" data-act="pinBack" aria-label="Slet">${icon('backspace')}</button>
      <button type="button" data-act="pinKey" data-d="0">0</button>
      <button type="button" data-act="pinCancel" aria-label="Tilbage">${icon('close')}</button>
    </div>
    ${S.demo ? '<p class="demo-note">Eksempel-familiens PIN er 1234.</p>' : ''}
  </div>`;
}

export const parent = {
  chrome: false,
  mount() {
    const el = document.getElementById('voice-status');
    if (!el) return;
    voiceProvider().then((p) => {
      if (!el.isConnected) return;
      const text = {
        azure: 'Azure-stemmen er sat op på serveren og bruges til oplæsningen.',
        device: 'Bruger enhedens egen danske stemme. Sæt Azure op på jeres server for en flottere stemme (se README).',
        none: 'Der blev ikke fundet en dansk stemme på denne enhed, og Azure er ikke sat op.',
      }[p];
      el.textContent = text;
      el.className = `voice-status voice-${p}`;
    });
  },
  render() {
    if (!parentUnlocked()) return pinPad(app.draft.pinError || '');
    app.draft.pinError = '';
    const tab = app.draft.parentTab || 'godkend';
    const pending = S.submissions.filter((s) => s.status === 'pending').length;
    return `<div class="parent">
      <header class="parent-top">
        <button type="button" class="icon-btn" data-act="pClose" aria-label="Tilbage til spillet">${icon('arrow_back')}</button>
        <h1>Forældrepanel</h1>
        <button type="button" class="btn btn-sm btn-ghost" data-act="pLock">${icon('lock')}Lås</button>
      </header>
      ${app.storage !== 'indexeddb' ? `<p class="warn">${icon('warning')}${app.storage === 'memory' ? 'Denne visning kan ikke gemme. Alt forsvinder, når siden lukkes.' : 'Gemmes i browserens lille lager. Tag en backup jævnligt.'}</p>` : ''}
      <nav class="ptabs" aria-label="Forældrepanel">${TABS.map(
        (t) => `<button type="button" class="ptab ${tab === t.id ? 'is-on' : ''}" data-act="pTab" data-id="${t.id}" aria-current="${tab === t.id ? 'page' : 'false'}">${icon(t.icon)}<span>${t.name}</span>${t.id === 'godkend' && pending ? `<b class="badge">${pending}</b>` : ''}</button>`,
      ).join('')}</nav>
      <section class="pbody">${TAB_RENDER[tab]()}</section>
    </div>`;
  },
  actions: {
    async pinKey({ d }) {
      if (pinBuf.length >= 4) return;
      pinBuf += d;
      sfx.tap();
      if (pinBuf.length === 4) {
        const ok = await A.checkPin(pinBuf);
        pinBuf = '';
        if (ok) {
          unlockParent(15);
          app.draft.pinError = '';
        } else {
          sfx.error();
          app.draft.pinError = 'Forkert PIN – prøv igen';
        }
      }
      rerender();
    },
    pinBack() {
      pinBuf = pinBuf.slice(0, -1);
      rerender();
    },
    pinCancel() {
      pinBuf = '';
      app.draft.pinError = '';
      back(app.childId ? 'home' : 'who');
    },
    pTab({ id }) {
      app.draft.parentTab = id;
      unlockParent(15);
      rerender();
    },
    pLock() {
      lockParent();
      go(app.childId ? 'home' : 'who', {}, { replace: true });
    },
    pClose() {
      back(app.childId ? 'home' : 'who');
    },
    // Godkendelser
    approve({ id }) {
      const note = document.getElementById(`note-${id}`)?.value || '';
      const r = A.decideSubmission(id, true, note);
      if (!r.ok) return toast(r.reason, { icon: 'error' });
      sfx.coin();
      toast(`Godkendt · +${r.gained} XP`, { icon: 'check_circle', tone: 'mint' });
      rerender();
    },
    reject({ id }) {
      const note = document.getElementById(`note-${id}`)?.value || '';
      const r = A.decideSubmission(id, false, note);
      if (!r.ok) return toast(r.reason, { icon: 'error' });
      toast('Afvist – barnet kan prøve igen', { icon: 'undo' });
      rerender();
    },
    zoom({ id }) {
      openModal(`<div class="zoom">${photo(id, 'Billede', 'zoom-img')}</div>`, { label: 'Billede', wide: true });
    },
    // Aktiviteter
    saveAct({ id }) {
      const row = document.getElementById(`act-${id}`);
      if (!row) return;
      app.draft.openCat = A.activityById(id)?.cat;
      A.updateActivity(id, {
        xp: row.querySelector('[name=xp]').value,
        limitCount: row.querySelector('[name=limit]').value,
        limitPer: row.querySelector('[name=per]').value,
        active: row.querySelector('[name=active]').checked,
      });
      toast('Gemt', { icon: 'check', tone: 'mint', ms: 1500 });
      rerender();
    },
    delAct({ id }) {
      app.draft.openCat = A.activityById(id)?.cat;
      const r = A.removeActivity(id);
      if (!r.ok) return toast(r.reason, { icon: 'error' });
      toast('Opgaven er slettet', { icon: 'delete' });
      rerender();
    },
    // Børn
    saveChild({ id }) {
      const box = document.getElementById(`child-${id}`);
      const color = box.querySelector('input[name="color-' + id + '"]:checked')?.value;
      const r = A.updateChild(id, { name: box.querySelector('[name=name]').value, difficulty: box.querySelector('[name=difficulty]').value, color });
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      toast('Gemt', { icon: 'check', tone: 'mint', ms: 1500 });
      rerender();
    },
    archiveChild({ id }) {
      const c = A.childById(id);
      A.updateChild(id, { archived: !c.archived });
      if (app.childId === id && !c.archived) app.childId = null;
      rerender();
    },
    // Legetøj
    adjustToy({ id }) {
      const t = A.toyById(id);
      openModal(
        `<h2>Ret XP for ${esc(t.name)}</h2>
        <p class="help">Nu: ${t.xp} XP (level ${levelInfo(t.xp).level}). Skriv et plus- eller minustal. Level ${MAX_LEVEL} kræver ${xpForLevel(MAX_LEVEL)} XP.</p>
        <form data-form="adjustXp" class="stack" data-id="${t.id}">
          <label class="field"><span>XP (fx 50 eller -30)</span><input type="number" name="amount" inputmode="numeric" step="1" required></label>
          <label class="field"><span>Grund (vises i historikken)</span><input type="text" name="note" maxlength="80" placeholder="Fx Rettelse efter fejlregistrering"></label>
          <button type="submit" class="btn btn-block">${icon('check')}Gem</button>
        </form>`,
        { label: 'Ret XP' },
      );
    },
    delToy({ id }, el) {
      if (el.dataset.confirm !== '1') {
        el.dataset.confirm = '1';
        el.innerHTML = `${icon('warning')}Tryk igen for at slette`;
        el.classList.add('btn-coral');
        return;
      }
      A.deleteToy(id).then(() => {
        toast('Legetøjet er slettet', { icon: 'delete' });
        rerender();
      });
    },
    // Stemme
    saveVoice() {
      const box = document.getElementById('voice-form');
      const v = A.updateVoice({
        on: box.querySelector('[name=voiceOn]').checked,
        name: box.querySelector('input[name=voiceName]:checked')?.value,
        rate: box.querySelector('[name=voiceRate]').value,
      });
      if (!v.on) stopSpeaking();
      toast('Stemmen er gemt', { icon: 'check', tone: 'mint', ms: 1500 });
      rerender();
    },
    testVoice() {
      const box = document.getElementById('voice-form');
      A.updateVoice({
        on: true,
        name: box.querySelector('input[name=voiceName]:checked')?.value,
        rate: box.querySelector('[name=voiceRate]').value,
      });
      say('Hej! Jeg er stemmen i LegetøjsLigaen. Klar til at træne? En, to, tre!', { interrupt: true });
    },
    recheckVoice() {
      resetVoiceProvider();
      rerender();
    },
    // Data
    async backup() {
      const text = await A.exportBackup();
      const name = `legetoejsligaen-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const ok = await saveFile(name, text);
      if (ok === 'saved') toast('Backup gemt', { icon: 'save', tone: 'mint' });
      else if (ok === 'declined') toast('Backup blev ikke gemt', { icon: 'info' });
      else toast('Backup kan ikke gemmes i denne visning. Åbn spillet på jeres egen adresse.', { icon: 'error', tone: 'coral', ms: 5000 });
    },
    async cloudCreate(_d, el) {
      el.disabled = true;
      try {
        const code = await cloud.createFamily();
        toast(`Gemt i skyen. Familiekode: ${code}`, { icon: 'cloud_done', tone: 'mint', ms: 6000 });
      } catch (e) {
        toast(e.message || 'Kunne ikke gemme i skyen', { icon: 'error', tone: 'coral' });
      }
      rerender();
    },
    async cloudSync(_d, el) {
      el.disabled = true;
      await cloud.syncNow();
      toast(cloud.lastError || 'Synkroniseret', { icon: cloud.lastError ? 'cloud_off' : 'cloud_done', tone: cloud.lastError ? 'coral' : 'mint' });
      rerender();
    },
    async cloudCopy() {
      const code = cloud.familyCode();
      try {
        await navigator.clipboard.writeText(code);
        toast('Familiekoden er kopieret', { icon: 'content_copy', tone: 'mint' });
      } catch {
        toast(`Familiekode: ${code}`, { icon: 'info', ms: 6000 });
      }
    },
    async cloudLeave(_d, el) {
      if (el.dataset.confirm !== '1') {
        el.dataset.confirm = '1';
        el.innerHTML = `${icon('warning')}Tryk igen for at afbryde`;
        return;
      }
      await cloud.leaveFamily();
      toast('Enheden synkroniserer ikke længere. Data ligger stadig her.', { icon: 'cloud_off', ms: 5000 });
      rerender();
    },
    async demoOff() {
      await A.resetAll();
      app.childId = null;
      lockParent();
      go('setup', {}, { replace: true });
    },
  },
  changes: {
    async restore(el) {
      const f = el.files?.[0];
      if (!f) return;
      const savedLink = cloud.currentLink();
      const r = await A.importBackup(await f.text());
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      if (savedLink) {
        try {
          await cloud.replaceWithLocal(savedLink);
        } catch (e) {
          toast(`Backuppen er indlæst her, men ikke i skyen: ${e.message}`, { icon: 'cloud_off', tone: 'coral', ms: 6000 });
        }
      }
      app.childId = null;
      toast('Backup indlæst', { icon: 'restore', tone: 'mint' });
      go('who', {}, { replace: true });
    },
  },
  forms: {
    adjustXp(form) {
      const r = A.adjustXp(form.dataset.id, form.amount.value, form.note.value.trim() || 'Rettet af en voksen');
      if (!r.ok) return toast(r.reason || 'Ugyldigt tal', { icon: 'error', tone: 'coral' });
      closeModal();
      toast(`XP rettet (${r.gained > 0 ? '+' : ''}${r.gained})`, { icon: 'check', tone: 'mint' });
      rerender();
    },
    addAct(form) {
      app.draft.openCat = form.cat.value;
      const r = A.addActivity({
        title: form.title.value,
        cat: form.cat.value,
        kind: form.kind.value,
        xp: form.xp.value,
        limitCount: form.limit.value,
        limitPer: form.per.value,
      });
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      toast('Opgaven er tilføjet', { icon: 'add_task', tone: 'mint' });
      rerender();
    },
    addChild(form) {
      const r = A.addChild({ name: form.name.value, difficulty: form.difficulty.value });
      if (!r.ok) return toast(r.reason, { icon: 'error', tone: 'coral' });
      toast(`${r.child.name} er med i ligaen`, { icon: 'person_add', tone: 'mint' });
      rerender();
    },
    limits(form) {
      const patch = {};
      for (const el of form.querySelectorAll('input[type=number]')) patch[el.name] = el.value;
      A.updateSettings(patch);
      toast('Grænser gemt', { icon: 'check', tone: 'mint' });
      rerender();
    },
    async pin(form) {
      const a = form.pin1.value.trim();
      const b = form.pin2.value.trim();
      if (!/^\d{4}$/.test(a)) return toast('PIN skal være 4 cifre', { icon: 'error', tone: 'coral' });
      if (a !== b) return toast('De to PIN-koder er ikke ens', { icon: 'error', tone: 'coral' });
      await A.changePin(a);
      form.reset();
      toast('PIN er skiftet', { icon: 'lock', tone: 'mint' });
    },
    async reset(form) {
      if (form.confirm.value.trim().toUpperCase() !== 'SLET') return toast('Skriv SLET for at bekræfte', { icon: 'error', tone: 'coral' });
      if (cloud.isLinked()) {
        try {
          await cloud.deleteFamily();
        } catch (e) {
          return toast(`Kunne ikke slette i skyen: ${e.message}`, { icon: 'error', tone: 'coral' });
        }
      }
      await A.resetAll();
      app.childId = null;
      lockParent();
      go('setup', {}, { replace: true });
    },
  },
};

async function saveFile(filename, text) {
  if (globalThis.claude?.use) {
    const dl = await globalThis.claude.use('downloads').catch(() => null);
    if (!dl) return 'unavailable';
    try {
      await dl.save({ filename, data: text });
      return 'saved';
    } catch (e) {
      return e?.code === 'declined' ? 'declined' : 'unavailable';
    }
  }
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  return 'saved';
}

// ---------- Faner ----------

const TAB_RENDER = {
  godkend() {
    const list = S.submissions.filter((s) => s.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
    const recent = S.submissions.filter((s) => s.status !== 'pending' && s.via !== 'camera').slice(-6).reverse();
    return `${
      list.length
        ? list
            .map((s) => {
              const c = A.childById(s.childId);
              const t = A.toyById(s.toyId);
              const a = A.activityById(s.activityId);
              return `<article class="appr">
                <header>${avatar(c, 'sm')}<div><b>${esc(c?.name || '?')}: ${esc(a?.title || 'Opgave')}</b><span>${timeAgo(s.createdAt)} · ${esc(VIA[s.via] || KIND_LABEL[s.kind] || '')}</span></div><span class="appr-xp">+${s.xp} XP</span></header>
                <p class="appr-toy">${t ? toyPhoto(t, 'appr-toy-img') : ''}Til <b>${esc(t?.name || 'slettet legetøj')}</b></p>
                ${
                  s.photos?.length
                    ? `<div class="appr-photos">${s.photos
                        .map((p) => `<button type="button" class="appr-photo" data-act="zoom" data-id="${p.id}"><span>${p.role === 'foer' ? 'Før' : 'Efter'}</span>${photo(p.id, p.role === 'foer' ? 'Før' : 'Efter', 'appr-img')}</button>`)
                        .join('')}</div>`
                    : ''
                }
                <label class="field"><span>Besked til barnet (valgfri)</span><input type="text" id="note-${s.id}" maxlength="140" placeholder="Fx Flot klaret!"></label>
                <div class="appr-btns">
                  <button type="button" class="btn btn-ghost" data-act="reject" data-id="${s.id}">${icon('close')}Afvis</button>
                  <button type="button" class="btn btn-mint" data-act="approve" data-id="${s.id}">${icon('check')}Godkend</button>
                </div>
              </article>`;
            })
            .join('')
        : empty({ icon: 'task_alt', title: 'Intet at godkende', text: 'Når børnene sender opgaver med billeder eller beder om godkendelse, kommer de her.' })
    }
    ${
      recent.length
        ? `<h2 class="h3">Senest afgjort</h2><ul class="sent">${recent
            .map((s) => `<li><span><b>${esc(A.activityById(s.activityId)?.title || 'Opgave')}</b><small>${esc(A.childById(s.childId)?.name || '')} · ${timeAgo(s.decidedAt || s.createdAt)}</small></span>${statusPill(s.status)}</li>`)
            .join('')}</ul>`
        : ''
    }`;
  },

  opgaver() {
    const groups = CATEGORIES.map((c) => ({ c, acts: S.activities.filter((a) => a.cat === c.id) })).filter((g) => g.acts.length);
    return `<p class="help">Ret XP, hvor ofte en opgave kan laves, og om den er med. Kameraøvelsernes antal gentagelser følger barnets sværhedsgrad under Børn.</p>
      ${groups
        .map(
          (g) => `<details class="aa-group" ${g.c.id === (app.draft.openCat || groups[0].c.id) ? 'open' : ''}><summary>${icon(g.c.icon)}${g.c.name}<small>${g.acts.filter((a) => a.active).length} af ${g.acts.length} med ${icon('expand_more')}</small></summary>
        <div class="act-admin">${g.acts
          .map(
            (a) => `<div class="aa-row ${a.active ? '' : 'is-off'}" id="act-${a.id}">
              <div class="aa-title"><b>${esc(a.title)}</b>${kindPill(a.kind)}</div>
              <label class="aa-f"><span>XP</span><input type="number" name="xp" min="0" max="1000" value="${a.xp}" inputmode="numeric"></label>
              <label class="aa-f"><span>Højst</span><input type="number" name="limit" min="0" max="50" value="${a.limit?.count ?? 0}" inputmode="numeric"></label>
              <label class="aa-f"><span>pr.</span><select name="per"><option value="day" ${a.limit?.per !== 'week' ? 'selected' : ''}>dag</option><option value="week" ${a.limit?.per === 'week' ? 'selected' : ''}>uge</option></select></label>
              <label class="aa-toggle"><input type="checkbox" name="active" ${a.active ? 'checked' : ''}><span>Med</span></label>
              <div class="aa-btns">
                <button type="button" class="btn btn-sm" data-act="saveAct" data-id="${a.id}">Gem</button>
                ${a.builtin ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-act="delAct" data-id="${a.id}" aria-label="Slet opgaven">${icon('delete')}</button>`}
              </div>
            </div>`,
          )
          .join('')}</div></details>`,
        )
        .join('')}
      <form class="panel stack" data-form="addAct">
        <h2 class="h3">${icon('add_task')}Lav jeres egen opgave</h2>
        <label class="field"><span>Titel</span><input type="text" name="title" maxlength="60" placeholder="Fx Fej trappen" required></label>
        <div class="field-row">
          <label class="field"><span>Kategori</span><select name="cat">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === 'hjaelp' ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
          <label class="field"><span>Hvordan</span><select name="kind"><option value="adult">Voksen bekræfter</option><option value="photo">Foto + voksen</option></select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>XP</span><input type="number" name="xp" value="25" min="0" max="1000" inputmode="numeric"></label>
          <label class="field"><span>Højst</span><input type="number" name="limit" value="1" min="1" max="50" inputmode="numeric"></label>
          <label class="field"><span>pr.</span><select name="per"><option value="day">dag</option><option value="week">uge</option></select></label>
        </div>
        <button type="submit" class="btn">${icon('add')}Tilføj opgave</button>
      </form>`;
  },

  boern() {
    return `${S.children
      .map(
        (c) => `<div class="panel child-admin ${c.archived ? 'is-off' : ''}" id="child-${c.id}">
          <div class="ca-head">${avatar(c, 'md')}<b>${esc(c.name)}</b>${c.archived ? '<span class="pill pill-wait">Sat på pause</span>' : ''}</div>
          <label class="field"><span>Navn</span><input type="text" name="name" maxlength="24" value="${esc(c.name)}"></label>
          <fieldset class="swatches"><legend>Farve</legend>${AVATAR_COLORS.map(
            (col) => `<label class="swatch"><input type="radio" name="color-${c.id}" value="${col}" ${c.color === col ? 'checked' : ''}><i style="--av:${col}"></i><span class="sr-only">${col}</span></label>`,
          ).join('')}</fieldset>
          <label class="field"><span>Sværhedsgrad i kameratræning</span><select name="difficulty">${Object.entries(DIFFICULTY)
            .map(([k, d]) => `<option value="${k}" ${c.difficulty === k ? 'selected' : ''}>${d.name} – ${d.note}</option>`)
            .join('')}</select></label>
          <div class="row-btns">
            <button type="button" class="btn btn-sm" data-act="saveChild" data-id="${c.id}">${icon('check')}Gem</button>
            <button type="button" class="btn btn-sm btn-ghost" data-act="archiveChild" data-id="${c.id}">${c.archived ? 'Tag med igen' : 'Sæt på pause'}</button>
          </div>
        </div>`,
      )
      .join('')}
      <form class="panel stack" data-form="addChild">
        <h2 class="h3">${icon('person_add')}Tilføj et barn</h2>
        <label class="field"><span>Navn</span><input type="text" name="name" maxlength="24" required></label>
        <label class="field"><span>Sværhedsgrad</span><select name="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<option value="${k}" ${k === 'normal' ? 'selected' : ''}>${d.name}</option>`).join('')}</select></label>
        <button type="submit" class="btn">${icon('add')}Tilføj</button>
      </form>`;
  },

  legetoej() {
    const kids = S.children;
    return kids
      .map((c) => {
        const toys = A.toysOf(c.id);
        return `<h2 class="h3">${avatar(c, 'sm')} ${esc(c.name)}</h2>
          ${
            toys.length
              ? `<div class="toy-admin">${toys
                  .map((t) => {
                    const info = levelInfo(t.xp);
                    return `<div class="ta-row">${toyPhoto(t, 'ta-img')}<div><b>${esc(t.name)}</b><span>Level ${info.level} · ${t.xp} XP · ${t.record?.wins || 0} sejre</span></div>
                      <div class="row-btns"><button type="button" class="btn btn-sm btn-ghost" data-act="adjustToy" data-id="${t.id}">${icon('tune')}Ret XP</button><button type="button" class="btn btn-sm btn-ghost" data-act="delToy" data-id="${t.id}">${icon('delete')}Slet</button></div></div>`;
                  })
                  .join('')}</div>`
              : '<p class="help">Intet legetøj endnu.</p>'
          }`;
      })
      .join('');
  },

  graenser() {
    const s = S.settings;
    const f = (name, label, help, min = 0, max = 1000) =>
      `<label class="field"><span>${label}</span><input type="number" name="${name}" value="${s[name]}" min="${min}" max="${max}" inputmode="numeric">${help ? `<small>${help}</small>` : ''}</label>`;
    return `<form class="panel stack" data-form="limits">
      <h2 class="h3">${icon('swords')}Kampe</h2>
      <div class="field-row">
        ${f('battlesPerToy', 'Kampe pr. figur om dagen', '', 0, 50)}
        ${f('battlesPerChild', 'Kampe pr. barn om dagen', '', 0, 100)}
      </div>
      <div class="field-row">
        ${f('xpWin', 'XP for sejr')}
        ${f('xpDraw', 'XP for uafgjort')}
        ${f('xpLoss', 'XP for nederlag')}
      </div>
      ${f('battleXpCap', 'Højst kamp-XP pr. barn om dagen', 'Så kampe ikke bliver den hurtigste vej til level 25')}
      ${f('maxOpenChallenges', 'Udfordringer et barn kan have ude ad gangen', '', 1, 20)}
      ${f('challengeHours', 'Timer før en ubesvaret udfordring udløber', '', 1, 240)}
      <h2 class="h3">${icon('favorite')}Pleje og billeder</h2>
      ${f('careXpCap', 'Højst pleje-XP pr. figur om dagen', '', 0, 200)}
      ${f('proofPhotoDays', 'Dage før dokumentationsbilleder slettes', 'Gælder billeder fra opgaver, efter de er godkendt eller afvist', 1, 365)}
      <p class="help">Alle grænser nulstilles ved midnat dansk tid. Figurerne mister aldrig levels eller XP ved nederlag eller pauser.</p>
      <button type="submit" class="btn">${icon('check')}Gem grænser</button>
    </form>`;
  },

  stemme() {
    const v = voiceSettings();
    return `<div class="panel stack" id="voice-form">
      <h2 class="h3">${icon('record_voice_over')}Oplæsning for børnene</h2>
      <p id="voice-status" class="voice-status">Tjekker stemmen …</p>
      <label class="aa-toggle"><input type="checkbox" name="voiceOn" ${v.on ? 'checked' : ''}><span>Læs op (tæller højt i træning, fortæller i kampe og ved level up)</span></label>
      <fieldset class="voice-pick"><legend>Azure-stemme</legend>
        ${AZURE_VOICES.map((x) => `<label class="voice-opt"><input type="radio" name="voiceName" value="${x.id}" ${v.name === x.id ? 'checked' : ''}><span>${x.name}</span></label>`).join('')}
      </fieldset>
      <label class="field"><span>Tempo</span><select name="voiceRate">${Object.entries(RATES)
        .map(([k, n]) => `<option value="${k}" ${v.rate === k ? 'selected' : ''}>${n}</option>`)
        .join('')}</select></label>
      <div class="row-btns">
        <button type="button" class="btn" data-act="saveVoice">${icon('check')}Gem</button>
        <button type="button" class="btn btn-ghost" data-act="testVoice">${icon('volume_up')}Prøv stemmen</button>
        <button type="button" class="btn btn-ghost" data-act="recheckVoice">${icon('refresh')}Tjek igen</button>
      </div>
      <p class="help">Azure-stemmen (Christel eller Jeppe) kræver, at spillet kører på jeres egen server med en Azure-nøgle. Ellers bruges enhedens egen danske stemme. Højttaler-knappen øverst slår al lyd fra på den enhed.</p>
    </div>`;
  },

  historik() {
    const filter = app.draft.histChild || 'alle';
    const list = S.xpLog.filter((e) => filter === 'alle' || e.childId === filter).slice(-120).reverse();
    return `<div class="chips">
        <button type="button" class="chip ${filter === 'alle' ? 'is-on' : ''}" data-act="histChild" data-id="alle">Alle</button>
        ${S.children.map((c) => `<button type="button" class="chip ${filter === c.id ? 'is-on' : ''}" data-act="histChild" data-id="${c.id}">${esc(c.name)}</button>`).join('')}
      </div>
      ${list.length ? `<ul class="hist hist-admin">${list.map((e) => historyLine(e, { withToy: true })).join('')}</ul>` : '<p class="help">Ingen XP endnu.</p>'}`;
  },

  data() {
    const where = app.storage === 'indexeddb' ? 'i denne browsers database (IndexedDB)' : app.storage === 'local' ? 'i denne browsers lille lager' : 'kun midlertidigt';
    const linked = cloud.isLinked();
    let cloudBox;
    if (linked) {
      cloudBox = `<div class="panel stack cloud-box">
        <h2 class="h3">${icon('cloud_done')}Familien i skyen</h2>
        <p>Alle enheder med familiekoden deler figurer, point, opgaver og kampe.</p>
        <div class="family-code"><span>Familiekode</span><b>${esc(cloud.familyCode())}</b></div>
        <p class="help">Forbind en ny iPad: åbn spillet, og vælg "Forbind til familien" med koden og jeres forældre-PIN.</p>
        <p class="help">${cloud.lastError ? `${icon('cloud_off')}${esc(cloud.lastError)}` : cloud.lastSync ? `Sidst synkroniseret ${timeAgo(cloud.lastSync)}` : 'Synkroniserer …'}</p>
        <div class="row-btns">
          <button type="button" class="btn" data-act="cloudSync">${icon('sync')}Synkroniser nu</button>
          <button type="button" class="btn btn-ghost" data-act="cloudCopy">${icon('content_copy')}Kopiér kode</button>
          <button type="button" class="btn btn-ghost" data-act="cloudLeave">${icon('cloud_off')}Afbryd denne enhed</button>
        </div>
      </div>`;
    } else if (cloud.isAvailable()) {
      cloudBox = `<div class="panel stack cloud-box">
        <h2 class="h3">${icon('cloud_upload')}Gem familien i skyen</h2>
        <p>Så kan flere iPads dele figurer og point, og børnene kan udfordre hinanden fra hver sin enhed. Alt på denne enhed bliver familiens fælles data.</p>
        <button type="button" class="btn" data-act="cloudCreate">${icon('cloud_upload')}Gem i skyen og lav familiekode</button>
        <p class="help">Har I allerede en familiekode fra en anden enhed? Brug "Slet alt" nederst, og vælg "Forbind til familien" på startsiden. Det, der er på denne enhed, bliver så erstattet.</p>
      </div>`;
    } else {
      cloudBox = `<div class="panel stack"><h2 class="h3">${icon('cloud_off')}Skyen</h2><p>${cloud.isConfigured() ? 'Serveren kan ikke nå databasen lige nu. Prøv igen om lidt.' : 'Der er ingen database på denne adresse, så alt gemmes kun på enheden.'}</p></div>`;
    }
    return `${cloudBox}<div class="panel stack">
        <h2 class="h3">${icon('save')}Backup</h2>
        <p>${linked ? 'Alt gemmes i skyen og på denne enhed. En backup er en ekstra sikkerhed.' : `Alt gemmes ${where} på denne enhed. Tag en backup, før I skifter enhed eller rydder browseren.`}</p>
        <div class="row-btns">
          <button type="button" class="btn" data-act="backup">${icon('download')}Gem backup</button>
          <label class="btn btn-ghost file-btn">${icon('upload')}Indlæs backup<input type="file" accept="application/json,.json" class="sr-only" data-change="restore"></label>
        </div>
        <p class="help">At indlæse en backup erstatter alt på denne enhed.</p>
      </div>
      <form class="panel stack" data-form="pin">
        <h2 class="h3">${icon('lock')}Skift PIN</h2>
        <div class="field-row">
          <label class="field"><span>Ny PIN</span><input type="password" name="pin1" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
          <label class="field"><span>Gentag</span><input type="password" name="pin2" inputmode="numeric" maxlength="4" autocomplete="new-password"></label>
        </div>
        <button type="submit" class="btn">Skift PIN</button>
      </form>
      ${
        S.demo
          ? `<div class="panel stack"><h2 class="h3">${icon('science')}Eksempel-familie</h2><p>I bruger eksempeldata lige nu. Start forfra med jeres egne børn, når I er klar.</p><button type="button" class="btn btn-coral" data-act="demoOff">Slet eksempeldata og start forfra</button></div>`
          : ''
      }
      <form class="panel stack danger" data-form="reset">
        <h2 class="h3">${icon('delete_forever')}Slet alt</h2>
        <p>${cloud.isLinked() ? 'Sletter alle profiler, figurer, billeder og point for hele familien – på alle enheder og i skyen.' : 'Sletter alle profiler, figurer, billeder og point på denne enhed.'}</p>
        <label class="field"><span>Skriv SLET for at bekræfte</span><input type="text" name="confirm" autocomplete="off"></label>
        <button type="submit" class="btn btn-coral">Slet alt</button>
      </form>`;
  },
};

parent.actions.histChild = ({ id }) => {
  app.draft.histChild = id;
  rerender();
};
