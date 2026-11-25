// Shared app state. Views read `S` and change data only through `edit()`, which bumps the local revision,
// saves the encrypted cache, re-renders and schedules a sync (debounced 3 s), like Repo + Sync on Android.
import { emptyDoc } from "./model.js";
import { pref } from "./store.js";

export const S = {
  sess: null,            // signed-in session (vault.js)
  doc: emptyDoc(),
  rev: 0,
  route: pref.get("route", "tasks"),
  syncing: false,
  error: null,
  needsSignIn: false,
  weekStart: pref.get("weekStart", 1),   // 1 = Monday, 7 = Sunday
  cal: { mode: pref.get("calMode", "month"), cursor: null, selected: null },
  taskFilter: "Active",
};

const hooks = { render: () => {}, changed: () => {} };
export const setHooks = (h) => Object.assign(hooks, h);
export const render = () => hooks.render();

/** Apply a local edit: fn(doc) → doc. */
export function edit(fn) {
  const next = fn(S.doc);
  if (next === S.doc) return;
  S.doc = next;
  S.rev++;
  hooks.changed();
  hooks.render();
}
