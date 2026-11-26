// Cobalt data model: dates, tasks, events, occurrences and the sync merge. Mirrors the Android app
// (data/Models.kt, data/Event.kt, sync/Merge.kt) and docs/SYNC.md exactly. Pure functions, no DOM.

// ------------------------------------------------------------------ days (epoch-day = days since 1970-01-01)
const DAY_MS = 86400000;
export const dayOf = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
export const ymd = (day) => { const t = new Date(day * DAY_MS); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
export const today = () => { const n = new Date(); return dayOf(n.getFullYear(), n.getMonth() + 1, n.getDate()); };
/** ISO weekday, 1 = Monday … 7 = Sunday */
export const isoDow = (day) => ((new Date(day * DAY_MS).getUTCDay() + 6) % 7) + 1;
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Java LocalDate.plusMonths: day clamped to the month's length. */
export function plusMonths(day, k) {
  const { y, m, d } = ymd(day);
  const idx = y * 12 + (m - 1) + k;
  const ny = Math.floor(idx / 12), nm = (idx % 12 + 12) % 12 + 1;
  return dayOf(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
export const plusYears = (day, k) => plusMonths(day, 12 * k);
export const toIso = (day) => { const { y, m, d } = ymd(day); return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };
export const fromIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return y && m && d ? dayOf(y, m, d) : null; };
export const minToHHMM = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const hhmmToMin = (s) => { const [h, m] = String(s).split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null; };
/** Local wall-clock millis for day + minute. */
export const msOf = (day, min) => { const { y, m, d } = ymd(day); return new Date(y, m - 1, d, 0, min).getTime(); };

// ------------------------------------------------------------------ constants
export const REPEATS = [
  ["None", "Never"], ["Daily", "Daily"], ["Weekdays", "Weekdays"], ["Weekly", "Weekly"],
  ["Biweekly", "Every 2 weeks"], ["Monthly", "Monthly"], ["Yearly", "Yearly"], ["Custom", "Custom days"],
];
export const COLORS = [
  ["Theme", null], ["Cobalt", "#1F5BFF"], ["Sky", "#0EA5E9"], ["Teal", "#14B8A6"], ["Green", "#22C55E"],
  ["Amber", "#F59E0B"], ["Coral", "#F97316"], ["Rose", "#F43F5E"], ["Violet", "#8B5CF6"],
];
export const REMIND_CHOICES = [[0, "At start"], [5, "5 min"], [10, "10 min"], [30, "30 min"], [60, "1 hour"], [1440, "1 day"], [10080, "1 week"]];
const REPEAT_NAMES = new Set(REPEATS.map((r) => r[0]));

/** Unique across devices: millis × 1000 + random (exact in JS, matches Android). */
export function newId(existing = []) {
  const max = existing.reduce((a, x) => Math.max(a, x.id), 0);
  return Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), max + 1);
}

const ints = (a) => (Array.isArray(a) ? a.map(Number).filter(Number.isFinite) : []);

// ------------------------------------------------------------------ tasks (Models.kt Task JSON)
export function normTask(o) {
  const t = {
    id: Number(o.id), title: String(o.title ?? ""), note: String(o.note ?? ""),
    priority: Number.isFinite(+o.priority) ? +o.priority : 1,
    done: !!o.done, createdAt: Number(o.createdAt ?? 0),
    repeat: REPEAT_NAMES.has(o.repeat) ? o.repeat : "None",
    repeatDays: [...new Set(ints(o.repeatDays))].sort((a, b) => a - b),
  };
  if (o.due != null) t.due = Number(o.due);
  if (o.doneAt != null) t.doneAt = Number(o.doneAt);
  if (o.dueMin != null) t.dueMin = Math.min(1439, Math.max(0, Number(o.dueMin)));
  t.u = Number(o.u ?? t.createdAt);
  return t;
}

/** Next due day strictly after max(due, today), following the repeat rule (Task.nextDue). */
export function nextDue(t, td = today()) {
  const due = t.due ?? td;
  const from = Math.max(due, td);
  const stepUntil = (step) => { let d = due; while (!(d > from)) d = step(d); return d; };
  const firstAfter = (ok) => { let d = from + 1; while (!ok(d)) d++; return d; };
  switch (t.repeat) {
    case "Daily": return from + 1;
    case "Weekdays": return firstAfter((d) => isoDow(d) <= 5);
    case "Weekly": return stepUntil((d) => d + 7);
    case "Biweekly": return stepUntil((d) => d + 14);
    case "Monthly": { let n = 1; while (!(plusMonths(due, n) > from)) n++; return plusMonths(due, n); }
    case "Yearly": { let n = 1; while (!(plusYears(due, n) > from)) n++; return plusYears(due, n); }
    case "Custom": { const days = t.repeatDays.length ? t.repeatDays : [isoDow(due)]; return firstAfter((d) => days.includes(isoDow(d))); }
    default: return from;
  }
}

export function doneToday(t) {
  if (!t.done || t.doneAt == null) return false;
  const d = new Date(t.doneAt);
  return dayOf(d.getFullYear(), d.getMonth() + 1, d.getDate()) === today();
}

// ------------------------------------------------------------------ events (Event.kt)
export function normEvent(o) {
  const start = Number(o.start);
  const e = {
    id: Number(o.id), title: String(o.title ?? ""), note: String(o.note ?? ""),
    kind: o.kind === "reminder" ? "reminder" : "event",
    start, end: Math.max(Number(o.end ?? start), start), allDay: !!o.allDay,
    sMin: Math.min(1439, Math.max(0, Number(o.sMin ?? 540))), eMin: Math.min(1440, Math.max(0, Number(o.eMin ?? 600))),
    repeat: REPEAT_NAMES.has(o.repeat) ? o.repeat : "None",
    repeatDays: [...new Set(ints(o.repeatDays))].sort((a, b) => a - b),
    skip: [...new Set(ints(o.skip))].sort((a, b) => a - b),
    color: Math.min(COLORS.length - 1, Math.max(0, Number(o.color ?? 0) | 0)),
    remind: [...new Set(ints(o.remind).filter((m) => m >= 0 && m <= 40320))],
    u: Number(o.u ?? 0),
  };
  if (o.until != null) e.until = Number(o.until);
  // Update 4: optional location ("loc"), same as Event.location on Android
  const loc = String(o.loc ?? "").trim().slice(0, 500);
  if (loc) e.loc = loc;
  return e;
}
export const evLength = (e) => Math.max(0, e.end - e.start);

/** Occurrence start days whose span touches [from, to] (inclusive), in order (Event.occurrences). */
export function occurrences(e, from, to, limit = 500) {
  const len = evLength(e);
  const lo = from - len;
  const last = Math.min(to, e.until ?? Infinity);
  if (last < e.start || lo > last) return [];
  const out = [];
  const skip = new Set(e.skip);
  const add = (d) => { if (d >= lo && d <= last && d >= e.start && !skip.has(d)) out.push(d); };
  const S = e.start;
  switch (e.repeat) {
    case "None": add(S); break;
    case "Daily": for (let d = Math.max(S, lo); d <= last && out.length < limit; d++) add(d); break;
    case "Weekly": case "Biweekly": {
      const step = e.repeat === "Weekly" ? 7 : 14;
      let d = lo <= S ? S : S + Math.floor((lo - S + step - 1) / step) * step;
      for (; d <= last && out.length < limit; d += step) add(d);
      break;
    }
    case "Weekdays": case "Custom": {
      const days = e.repeat === "Weekdays" ? [1, 2, 3, 4, 5] : (e.repeatDays.length ? e.repeatDays : [isoDow(S)]);
      for (let d = Math.max(S, lo); d <= last && out.length < limit; d++) if (days.includes(isoDow(d))) add(d);
      break;
    }
    case "Monthly": {
      const s = ymd(S), l = ymd(Math.max(lo, S));
      let k = Math.max(0, (l.y - s.y) * 12 + (l.m - s.m) - 1);
      while (out.length < limit) { const d = plusMonths(S, k); if (d > last) break; add(d); k++; }
      break;
    }
    case "Yearly": {
      let k = Math.max(0, ymd(Math.max(lo, S)).y - ymd(S).y - 1);
      while (out.length < limit) { const d = plusYears(S, k); if (d > last) break; add(d); k++; }
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------ doc + merge (Merge.kt)
export const TOMB_DAYS = 90;
export const emptyDoc = () => ({ format: 1, tasks: [], events: [], tomb: {} });

export function normDoc(o) {
  if (!o || typeof o !== "object") return emptyDoc();
  if ((o.format ?? 1) > 1) throw new Error("This sync copy was made by a newer Cobalt. Update to sync.");
  const tomb = {};
  for (const [k, v] of Object.entries(o.tomb ?? {})) tomb[k] = Number(v);
  const safe = (arr, f) => (Array.isArray(arr) ? arr : []).flatMap((x) => { try { const r = f(x); return Number.isFinite(r.id) ? [r] : []; } catch { return []; } });
  return { format: 1, tasks: safe(o.tasks, normTask), events: safe(o.events, normEvent), tomb };
}

function prune(doc, now) {
  const cutoff = now - TOMB_DAYS * DAY_MS;
  const tomb = {};
  for (const [k, v] of Object.entries(doc.tomb)) if (v >= cutoff) tomb[k] = v;
  return { ...doc, tomb };
}

const uMap = (list) => { const m = new Map(); for (const x of list) m.set(x.id, x.u); return m; };
function sameMap(a, b) { if (a.size !== b.size) return false; for (const [k, v] of a) if (!b.has(k) || b.get(k) !== v) return false; return true; }
export function same(a, b) {
  const ta = Object.entries(a.tomb), tb = b.tomb;
  return sameMap(uMap(a.tasks), uMap(b.tasks)) && sameMap(uMap(a.events), uMap(b.events)) &&
    ta.length === Object.keys(tb).length && ta.every(([k, v]) => tb[k] === v);
}

/** Last writer wins per item; deletions win over older edits; remote wins an exact tie. */
export function merge(local, remote, now = Date.now()) {
  if (!remote) return { doc: prune(local, now), changedLocal: false, needPush: true };
  const tomb = {};
  for (const k of new Set([...Object.keys(local.tomb), ...Object.keys(remote.tomb)])) {
    tomb[k] = Math.max(local.tomb[k] ?? -Infinity, remote.tomb[k] ?? -Infinity);
  }
  const pick = (prefix, l, r) => {
    const lm = new Map(l.map((x) => [x.id, x])), rm = new Map(r.map((x) => [x.id, x]));
    const out = [];
    for (const id of new Set([...lm.keys(), ...rm.keys()])) {
      const a = lm.get(id), b = rm.get(id);
      // same edit but an older client (Cobalt 1.2) dropped fields it didn't know (e.g. loc): keep the richer copy
      const win = !a ? b : !b ? a : a.u > b.u ? a : a.u === b.u && a.loc && !b.loc ? a : b;
      if (win.u > (tomb[`${prefix}:${id}`] ?? -Infinity)) out.push(win);
    }
    return out;
  };
  const doc = prune({ format: 1, tasks: pick("t", local.tasks, remote.tasks), events: pick("e", local.events, remote.events), tomb }, now);
  return { doc, changedLocal: !same(doc, local), needPush: !same(doc, remote) };
}

// ------------------------------------------------------------------ edits (Repo.kt semantics; return a new doc)
const withTomb = (doc, key, now) => ({ ...doc, tomb: { ...doc.tomb, [key]: now } });
const withoutTomb = (doc, key) => { const t = { ...doc.tomb }; delete t[key]; return { ...doc, tomb: t }; };

export function addTask(doc, f, now = Date.now()) {
  const repeat = f.repeat ?? "None";
  const due = repeat !== "None" && f.due == null ? today() : f.due ?? null;
  const t = normTask({ id: newId(doc.tasks), title: (f.title ?? "").trim(), note: (f.note ?? "").trim(), priority: f.priority ?? 1,
    due, done: false, createdAt: now, repeat, repeatDays: repeat === "Custom" ? f.repeatDays ?? [] : [],
    dueMin: due == null ? null : f.dueMin ?? null, u: now });
  return { ...doc, tasks: [...doc.tasks, t] };
}
export function updateTask(doc, t, now = Date.now()) {
  return { ...doc, tasks: doc.tasks.map((x) => (x.id === t.id ? normTask({ ...t, u: now }) : x)) };
}
export function toggleTask(doc, id, now = Date.now()) {
  const t = doc.tasks.find((x) => x.id === id);
  if (!t) return doc;
  if (!t.done && t.repeat !== "None") {
    const doneCopy = normTask({ ...t, id: newId(doc.tasks), done: true, doneAt: now, repeat: "None", repeatDays: [], createdAt: now, u: now });
    const next = { ...t, due: nextDue(t), u: now };
    return { ...doc, tasks: [...doc.tasks.map((x) => (x.id === id ? next : x)), doneCopy] };
  }
  return { ...doc, tasks: doc.tasks.map((x) => {
    if (x.id !== id) return x;
    if (x.done) { const y = { ...x, done: false, u: now }; delete y.doneAt; return y; }
    return { ...x, done: true, doneAt: now, u: now };
  }) };
}
export function deleteTask(doc, id, now = Date.now()) {
  if (!doc.tasks.some((x) => x.id === id)) return doc;
  return withTomb({ ...doc, tasks: doc.tasks.filter((x) => x.id !== id) }, `t:${id}`, now);
}
export function restoreTask(doc, t, now = Date.now()) {
  const d = doc.tasks.some((x) => x.id === t.id) ? doc : { ...doc, tasks: [...doc.tasks, { ...t, u: now }] };
  return withoutTomb(d, `t:${t.id}`);
}
export function clearCompleted(doc, now = Date.now()) {
  let d = { ...doc, tasks: doc.tasks.filter((x) => !x.done) };
  for (const t of doc.tasks) if (t.done) d = withTomb(d, `t:${t.id}`, now);
  return d;
}

export function saveEvent(doc, e, now = Date.now()) {
  const id = e.id ? e.id : newId(doc.events);
  const saved = normEvent({ ...e, id, title: (e.title ?? "").trim(), note: (e.note ?? "").trim(), end: Math.max(e.end ?? e.start, e.start), u: now });
  const exists = doc.events.some((x) => x.id === id);
  return { doc: withoutTomb({ ...doc, events: exists ? doc.events.map((x) => (x.id === id ? saved : x)) : [...doc.events, saved] }, `e:${id}`), event: saved };
}
export function deleteEvent(doc, id, now = Date.now()) {
  if (!doc.events.some((x) => x.id === id)) return doc;
  return withTomb({ ...doc, events: doc.events.filter((x) => x.id !== id) }, `e:${id}`, now);
}
export function restoreEvent(doc, e, now = Date.now()) {
  const d = doc.events.some((x) => x.id === e.id) ? doc : { ...doc, events: [...doc.events, { ...e, u: now }] };
  return withoutTomb(d, `e:${e.id}`);
}
export function skipOccurrence(doc, id, day, now) {
  const e = doc.events.find((x) => x.id === id);
  return e ? saveEvent(doc, { ...e, skip: [...e.skip, day] }, now).doc : doc;
}
export function endSeriesBefore(doc, id, day, now) {
  const e = doc.events.find((x) => x.id === id);
  if (!e) return doc;
  return day <= e.start ? deleteEvent(doc, id, now) : saveEvent(doc, { ...e, until: day - 1 }, now).doc;
}

/** Everything on one day: [{type:'event', e, occ}, {type:'task', t}] sorted all-day first, then by time. */
export function itemsOn(doc, day) {
  const out = [];
  for (const e of doc.events) for (const o of occurrences(e, day, day)) out.push({ type: "event", e, occ: o });
  for (const t of doc.tasks) if (t.due === day) out.push({ type: "task", t });
  const key = (x) => (x.type === "event" ? (x.e.allDay || x.occ !== day ? -1 : x.e.sMin) : x.t.dueMin ?? 1500);
  return out.sort((a, b) => key(a) - key(b));
}
