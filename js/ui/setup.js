// Første gang: opret familien med børn og en forældre-PIN – eller prøv med eksempeldata.

import { setupFamily } from '../actions.js';
import { AVATAR_COLORS } from '../catalog.js';
import { app, go } from './app.js';
import { icon } from './components.js';
import { toast, sfx, unlockAudio } from './fx.js';
import { logo } from './screens.js';
import { drawArt, loadDemo } from './demo.js';
import * as cloud from '../cloud.js';

function kidInput(i) {
  return `<label class="field kid-field"><span>Barn ${i + 1}</span><input type="text" name="kid" maxlength="24" autocomplete="off" placeholder="Navn" style="--av:${AVATAR_COLORS[i % AVATAR_COLORS.length]}"></label>`;
}

export const setup = {
  chrome: false,
  render() {
    return `<div class="setup">
      <header class="setup-hero">
        <div class="brand brand-big">${logo()}</div>
        <p class="setup-lead">Dit legetøj bliver til en spilfigur. Træn den med rigtige bevægelser foran kameraet, pas på den, ryd op for at gøre den stærkere – og udfordr dine søskende i arenaen.</p>
        <div class="setup-cards" aria-hidden="true">
          <div class="mini-card t3"><img data-demo-art="bear" alt=""><b>Kaptajn Krummel</b><span>LV 10 · Stærk</span></div>
          <div class="mini-card t2"><img data-demo-art="dino" alt=""><b>Lyn-Lotte</b><span>LV 6 · Hurtig</span></div>
          <div class="mini-card t1"><img data-demo-art="bunny" alt=""><b>Sir Pjuske</b><span>LV 2 · Forsvarer</span></div>
        </div>
        <ul class="setup-points">
          <li>${icon('photo_camera')}Kameraet tæller sprællemænd, squats og hop</li>
          <li>${icon('cleaning_services')}Oprydning og hjælp hjemme giver XP</li>
          <li>${icon('swords')}Kampe med dagsgrænser – ingen mister point</li>
        </ul>
      </header>
      ${app.storage === 'memory' ? `<p class="warn">${icon('warning')}Denne visning kan ikke gemme. Det, I laver, forsvinder, når siden lukkes.</p>` : ''}
      ${
        cloud.isAvailable()
          ? `<form class="panel stack setup-join" data-form="join" novalidate>
        <h2>Har I allerede LegetøjsLigaen på en anden enhed?</h2>
        <p class="help">Skriv familiekoden fra den anden enhed (Forældrepanel → Data) og jeres forældre-PIN.</p>
        <div class="field-row">
          <label class="field"><span>Familiekode</span><input type="text" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" maxlength="12"></label>
          <label class="field"><span>Forældre-PIN</span><input type="password" name="pin" inputmode="numeric" maxlength="4" autocomplete="off"></label>
        </div>
        <button type="submit" class="btn btn-lg btn-block">${icon('cloud_download')}Forbind til familien</button>
      </form>`
          : ''
      }
      <form class="panel stack setup-form" data-form="setup" novalidate>
        <h2>Opret jeres familie</h2>
        <div class="kids" id="kids">${kidInput(0)}${kidInput(1)}</div>
        <button type="button" class="link" data-act="addKid">${icon('person_add')}Tilføj et barn mere</button>
        <div class="field-row">
          <label class="field"><span>Forældre-PIN</span><input type="password" name="pin1" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="4 cifre"></label>
          <label class="field"><span>Gentag PIN</span><input type="password" name="pin2" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="4 cifre"></label>
        </div>
        <p class="help">PIN-koden låser forældrepanelet, hvor I godkender opgaver og bestemmer point og grænser.</p>
        <button type="submit" class="btn btn-lg btn-block">${icon('rocket_launch')}Start LegetøjsLigaen</button>
      </form>
      <div class="panel setup-demo">
        <div><h2 class="h3">Vil I kigge først?</h2><p>Prøv med en eksempel-familie med færdige figurer, en kamp der venter og en opgave til godkendelse. PIN er 1234.</p></div>
        <button type="button" class="btn btn-ghost" data-act="loadDemo">${icon('science')}Prøv eksempel-familien</button>
      </div>
      <p class="setup-foot">Testversion · alt gemmes kun på denne enhed</p>
    </div>`;
  },
  mount(root) {
    for (const img of root.querySelectorAll('img[data-demo-art]')) {
      try {
        img.src = drawArt(img.dataset.demoArt, 240);
      } catch {
        /* ikke vigtigt */
      }
    }
  },
  actions: {
    addKid() {
      const box = document.getElementById('kids');
      const n = box.querySelectorAll('input[name=kid]').length;
      if (n >= 6) return toast('Højst 6 børn her – I kan tilføje flere senere', { icon: 'info' });
      box.insertAdjacentHTML('beforeend', kidInput(n));
      box.querySelectorAll('input[name=kid]')[n].focus();
    },
    async loadDemo(_d, el) {
      el.disabled = true;
      unlockAudio();
      await loadDemo();
      sfx.coin();
      go('who', {}, { replace: true });
    },
  },
  forms: {
    async setup(form) {
      const names = [...form.querySelectorAll('input[name=kid]')].map((i) => i.value.trim()).filter(Boolean);
      const pin = form.pin1.value.trim();
      if (!names.length) return toast('Skriv mindst ét barns navn', { icon: 'person', tone: 'coral' });
      if (!/^\d{4}$/.test(pin)) return toast('PIN skal være 4 cifre', { icon: 'lock', tone: 'coral' });
      if (pin !== form.pin2.value.trim()) return toast('De to PIN-koder er ikke ens', { icon: 'lock', tone: 'coral' });
      unlockAudio();
      await setupFamily({ pin, children: names.map((name, i) => ({ name, color: AVATAR_COLORS[i % AVATAR_COLORS.length] })) });
      sfx.levelUp();
      if (cloud.isAvailable()) {
        try {
          const code = await cloud.createFamily();
          toast(`Familien er gemt i skyen. Familiekode: ${code}`, { icon: 'cloud_done', tone: 'mint', ms: 7000 });
        } catch {
          toast('Familien er gemt på enheden. I kan gemme den i skyen fra forældrepanelet.', { icon: 'cloud_off', ms: 6000 });
        }
      }
      go('who', {}, { replace: true });
    },
    async join(form) {
      const code = form.code.value.trim();
      const pin = form.pin.value.trim();
      if (code.replace(/[^a-z0-9]/gi, '').length !== 8) return toast('Familiekoden har 8 tegn, fx ABCD-EFGH', { icon: 'error', tone: 'coral' });
      if (!/^\d{4}$/.test(pin)) return toast('PIN skal være 4 cifre', { icon: 'lock', tone: 'coral' });
      unlockAudio();
      try {
        await cloud.joinFamily(code, pin);
      } catch (e) {
        return toast(e.message || 'Kunne ikke forbinde', { icon: 'error', tone: 'coral', ms: 5000 });
      }
      sfx.levelUp();
      toast('Forbundet til familien!', { icon: 'cloud_done', tone: 'mint' });
      go('who', {}, { replace: true });
    },
  },
};
