// Fælles skærmtilstand: hvilken skærm der vises, hvem der spiller, og navigation.

import { S, childById } from '../actions.js';

export const app = {
  route: { name: 'boot', params: {} },
  history: [],
  childId: null,
  parentUntil: 0,
  draft: {},
  storage: 'indexeddb',
};

let renderer = () => {};
let unmounter = null;

export function setRenderer(fn) {
  renderer = fn;
}

export function setUnmount(fn) {
  unmounter = fn;
}

export function go(name, params = {}, { replace = false } = {}) {
  if (unmounter) {
    try {
      unmounter();
    } catch (e) {
      console.error(e);
    }
    unmounter = null;
  }
  if (!replace && app.route.name !== 'boot') app.history.push(app.route);
  if (app.history.length > 30) app.history.shift();
  app.route = { name, params };
  renderer(true);
}

export function back(fallback = 'home') {
  const prev = app.history.pop();
  if (prev) {
    if (unmounter) {
      try {
        unmounter();
      } catch (e) {
        console.error(e);
      }
      unmounter = null;
    }
    app.route = prev;
    renderer(true);
  } else {
    go(fallback, {}, { replace: true });
  }
}

export function rerender() {
  renderer(false);
}

export const me = () => (app.childId ? childById(app.childId) : null);

export function parentUnlocked() {
  return Date.now() < app.parentUntil;
}

export function unlockParent(minutes = 10) {
  app.parentUntil = Date.now() + minutes * 60000;
}

export function lockParent() {
  app.parentUntil = 0;
}

export function others() {
  return S.children.filter((c) => c.id !== app.childId && !c.archived);
}
