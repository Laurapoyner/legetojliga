// Genbrugelige byggeklodser til skærmene.

import { esc } from '../util.js';
import { levelInfo, tierFor, toyStats, careNow, moodLabel, trainingBonus } from '../rules.js';
import { TOY_TYPES, CLASSES, STAT_NAMES, STAT_ICONS, KIND_LABEL } from '../catalog.js';

export const icon = (name, cls = '') => `<span class="ms ${cls}" aria-hidden="true">${esc(name)}</span>`;

export const typeEmoji = (type) => (TOY_TYPES.find((t) => t.id === type) || TOY_TYPES[TOY_TYPES.length - 1]).emoji;

export function photo(id, alt, cls = '', fallback = '⭐') {
  if (!id) return `<span class="${cls} photo-fallback" role="img" aria-label="${esc(alt)}">${fallback}</span>`;
  return `<img class="${cls}" data-photo="${esc(id)}" alt="${esc(alt)}" draggable="false">`;
}

export function toyPhoto(toy, cls = 'toy-img') {
  return photo(toy.photoId, toy.name, cls, typeEmoji(toy.type));
}

export function levelBadge(level, cls = '') {
  return `<span class="lvl ${cls}" aria-label="Level ${level}"><small>LV</small>${level}</span>`;
}

export function xpBar(xp, { noLabel = false, cls = '' } = {}) {
  const info = levelInfo(xp);
  const pct = Math.round(info.pct * 100);
  const label = info.isMax ? `Max level · ${info.total} XP i alt` : `${info.into} / ${info.need} XP`;
  return `<span class="xp ${cls}">
    <span class="xp-track" role="progressbar" aria-label="XP mod næste level" aria-valuemin="0" aria-valuemax="${info.need || 1}" aria-valuenow="${info.into}"><i style="width:${pct}%"></i></span>
    ${noLabel ? '' : `<span class="xp-label">${label}</span>`}
  </span>`;
}

export function toyCard(toy, { act = null, size = 'md', note = '', disabled = false, selected = false, extra = '', data = {} } = {}) {
  const info = levelInfo(toy.xp);
  const t = tierFor(info.level);
  const cls = CLASSES[toy.cls] || CLASSES.staerk;
  const tag = act && !disabled ? 'button' : 'div';
  const dataAttrs = Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
  const attrs = act && !disabled ? `type="button" data-act="${esc(act)}" data-id="${esc(toy.id)}"${dataAttrs}` : '';
  return `<${tag} class="tcard ${t.tier} tcard-${size}${disabled ? ' is-disabled' : ''}${selected ? ' is-selected' : ''}" ${attrs} ${selected ? 'aria-pressed="true"' : ''}>
    <span class="tcard-photo">${toyPhoto(toy)}${levelBadge(info.level)}</span>
    <span class="tcard-body">
      <span class="tcard-name">${esc(toy.name)}</span>
      <span class="tcard-meta">${icon(cls.icon)}${esc(cls.name)} · ${esc(t.title)}</span>
      ${xpBar(toy.xp, { noLabel: size === 'sm' })}
      ${note ? `<span class="tcard-note">${note}</span>` : ''}
    </span>
    ${extra}
  </${tag}>`;
}

export function statBars(toy) {
  const st = toyStats(toy);
  const max = 75;
  return `<div class="stats">${['sty', 'for', 'hur']
    .map((k) => {
      const bonus = trainingBonus(toy, k);
      return `<div class="stat stat-${k}">
        <span class="stat-name">${icon(STAT_ICONS[k])}${STAT_NAMES[k]}</span>
        <span class="stat-track"><i style="width:${Math.min(100, Math.round((st[k] / max) * 100))}%"></i></span>
        <span class="stat-val">${st[k]}${bonus ? `<small title="Fra træning">+${bonus}</small>` : ''}</span>
      </div>`;
    })
    .join('')}</div>`;
}

export function careMeters(toy) {
  const c = careNow(toy);
  return `<div class="meters">
    <div class="meter meter-energi"><span>${icon('bolt')}Energi</span><span class="meter-track"><i style="width:${c.energi}%"></i></span><b>${c.energi}</b></div>
    <div class="meter meter-glaede"><span>${icon('favorite')}Glæde</span><span class="meter-track"><i style="width:${c.glaede}%"></i></span><b>${c.glaede}</b></div>
    <p class="mood">${esc(moodLabel(c))}</p>
  </div>`;
}

export function avatar(child, size = 'md') {
  if (!child) return '';
  const initial = esc((child.name || '?').trim().charAt(0).toUpperCase());
  return `<span class="avatar avatar-${size}" style="--av:${esc(child.color || '#3A7BFF')}" aria-hidden="true">${initial}</span>`;
}

export function kindPill(kind) {
  const ic = kind === 'camera' ? 'photo_camera' : kind === 'photo' ? 'add_a_photo' : 'how_to_reg';
  return `<span class="pill pill-${kind}">${icon(ic)}${KIND_LABEL[kind] || ''}</span>`;
}

export function statusPill(status) {
  if (status === 'approved') return `<span class="pill pill-ok">${icon('check_circle')}Godkendt</span>`;
  if (status === 'rejected') return `<span class="pill pill-no">${icon('cancel')}Afvist</span>`;
  return `<span class="pill pill-wait">${icon('hourglass_top')}Venter på en voksen</span>`;
}

export function empty({ icon: ic = 'toys', title, text = '', action = '' }) {
  return `<div class="empty">${icon(ic, 'empty-ic')}<h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export function pageHead(title, { backTo = null, sub = '', right = '' } = {}) {
  return `<div class="page-head">
    ${backTo ? `<button type="button" class="icon-btn" data-act="back" aria-label="Tilbage">${icon('arrow_back')}</button>` : ''}
    <div class="page-head-text"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
    ${right}
  </div>`;
}

export function progressBar(value, max, cls = '') {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<span class="pbar ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(value, max)}"><i style="width:${pct}%"></i></span>`;
}

export function moveIcon(move) {
  const map = { angreb: 'swords', forsvar: 'shield', finte: 'cyclone', super: 'auto_awesome' };
  return icon(map[move] || 'help');
}
