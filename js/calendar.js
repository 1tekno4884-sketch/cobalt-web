// Calendar view: Month grid + selected day, Week time grid, Agenda list. Same rules as the Android CalendarScreen.
import * as M from "./model.js";
import { S, render } from "./state.js";
import { pref } from "./store.js";
import { $, $$, esc, icon, fmtTime, fmtDate, monthTitle, weekdayName, reduceMotion } from "./dom.js";
import { eventEditor, taskEditor } from "./editors.js";
import { taskRow, bindTaskRows } from "./tasks.js";

const HOUR = 48; // px per hour in the week grid
export const colorOf = (e) => M.COLORS[e.color]?.[1] ?? "var(--primary)";
const startOfWeek = (day) => day - ((M.isoDow(day) - S.weekStart + 7) % 7);

function timeText(e, occ, day) {
  if (e.allDay) return M.evLength(e) > 0 ? `All day · ${day - occ + 1}/${M.evLength(e) + 1}` : "All day";
  if (e.kind === "reminder") return fmtTime(e.sMin);
  const len = M.evLength(e);
  if (len === 0) return `${fmtTime(e.sMin)} – ${fmtTime(e.eMin % 1440)}`;
  if (day === occ) return `From ${fmtTime(e.sMin)}`;
  if (day === occ + len) return `Until ${fmtTime(e.eMin % 1440)}`;
  return "All day";
}

/** Day → [{type, e, occ} | {type, t}] for a range, events expanded over every day they cover. */
function itemsInRange(from, to) {
  const map = new Map();
  const push = (d, x) => { if (d < from || d > to) return; if (!map.has(d)) map.set(d, []); map.get(d).push(x); };
  for (const e of S.doc.events) for (const o of M.occurrences(e, from, to)) for (let d = o; d <= o + M.evLength(e); d++) push(d, { type: "event", e, occ: o });
  for (const t of S.doc.tasks) if (t.due != null) push(t.due, { type: "task", t });
  for (const list of map.values()) list.sort((a, b) => sortKey(a) - sortKey(b));
  return map;
}
const sortKey = (x) => (x.type === "event" ? (x.e.allDay ? -1 : x.e.sMin) : 1500 + (x.t.done ? 1 : 0));

function eventRow(x, day) {
  const { e, occ } = x;
  return `<li class="ev-row" style="--ev:${colorOf(e)}">
    <button data-ev="${e.id}" data-occ="${occ}">
      <span class="ev-bar"></span>
      <span class="ev-text"><span class="title">${esc(e.title || "(untitled)")}</span>
        <span class="sub">${e.kind === "reminder" ? icon("bell") : ""}${esc(timeText(e, occ, day))}${e.repeat !== "None" ? icon("repeat") : ""}${e.loc ? " · " + esc(e.loc) : ""}${e.note ? " · " + esc(e.note) : ""}</span></span>
    </button></li>`;
}
function dayList(day, items) {
  if (!items?.length) return `<p class="muted empty-day">Nothing planned.</p>`;
  return `<ul class="day-list">${items.map((x) => (x.type === "event" ? eventRow(x, day) : taskRow(x.t, { compact: true }))).join("")}</ul>`;
}
function bindLists(root) {
  $$("[data-ev]", root).forEach((b) => b.addEventListener("click", () => {
    const e = S.doc.events.find((x) => x.id === Number(b.dataset.ev));
    if (e) eventEditor(e, { occ: Number(b.dataset.occ) });
  }));
  bindTaskRows(root);
}

export function renderCalendar(root) {
  const td = M.today();
  const c = S.cal;
  c.selected ??= td; c.cursor ??= td;
  const mode = c.mode;
  const title = mode === "week"
    ? (() => { const s = startOfWeek(c.cursor); return `${fmtDate(s, { month: "short", day: "numeric" })} – ${fmtDate(s + 6, { month: "short", day: "numeric", year: "numeric" })}`; })()
    : mode === "agenda" ? "Agenda" : monthTitle(c.cursor);
  root.innerHTML = `
    <div class="page-head cal-head">
      <h1 class="cal-title">${esc(title)}</h1>
      <div class="cal-tools">
        <div class="seg small" role="tablist">${[["month", "Month"], ["week", "Week"], ["agenda", "Agenda"]].map(([v, l]) =>
          `<button role="tab" aria-selected="${mode === v}" class="${mode === v ? "on" : ""}" data-mode="${v}">${l}</button>`).join("")}</div>
        ${mode !== "agenda" ? `<button class="icon-btn" data-nav="-1" aria-label="Previous">${icon("left")}</button>
        <button class="btn tonal small" data-today>Today</button>
        <button class="icon-btn" data-nav="1" aria-label="Next">${icon("right")}</button>` : ""}
      </div>
    </div>
    <div class="cal-body ${mode}"></div>
    <button class="fab" data-new-ev>${icon("add")}<span>New event</span></button>`;
  const body = $(".cal-body", root);
  if (mode === "month") month(body, td);
  else if (mode === "week") week(body, td);
  else agenda(body, td);

  $$("[data-mode]", root).forEach((b) => b.addEventListener("click", () => { c.mode = b.dataset.mode; pref.set("calMode", c.mode); c.cursor = c.selected; render(); }));
  $$("[data-nav]", root).forEach((b) => b.addEventListener("click", () => {
    const n = Number(b.dataset.nav);
    if (mode === "month") { c.cursor = M.plusMonths(M.dayOf(M.ymd(c.cursor).y, M.ymd(c.cursor).m, 1), n); c.selected = c.cursor; }
    else { c.cursor += 7 * n; c.selected = startOfWeek(c.cursor); }
    render();
  }));
  $("[data-today]", root)?.addEventListener("click", () => { c.cursor = c.selected = td; render(); });
  $("[data-new-ev]", root).addEventListener("click", () => eventEditor(null, { day: c.selected }));
}

function month(body, td) {
  const c = S.cal;
  const { y, m } = M.ymd(c.cursor);
  const first = M.dayOf(y, m, 1);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((first - gridStart + M.daysInMonth(y, m)) / 7);
  const gridEnd = gridStart + weeks * 7 - 1;
  const items = itemsInRange(gridStart, gridEnd);
  const head = Array.from({ length: 7 }, (_, i) => `<div class="wd" aria-hidden="true">${esc(weekdayName(((S.weekStart - 1 + i) % 7) + 1))}</div>`).join("");
  let cells = "";
  for (let d = gridStart; d <= gridEnd; d++) {
    const list = items.get(d) ?? [];
    const out = M.ymd(d).m !== m;
    const chips = list.slice(0, 3).map((x) => x.type === "event"
      ? `<span class="mchip ${x.e.allDay || M.evLength(x.e) ? "solid" : ""}" style="--ev:${colorOf(x.e)}">${esc(x.e.title || "•")}</span>`
      : `<span class="mchip task ${x.t.done ? "done" : ""}">${esc(x.t.title)}</span>`).join("");
    cells += `<button class="mcell ${out ? "out" : ""} ${d === td ? "today" : ""} ${d === c.selected ? "sel" : ""}" data-day="${d}"
      aria-label="${esc(fmtDate(d, { weekday: "long", month: "long", day: "numeric" }))}${list.length ? `, ${list.length} item${list.length > 1 ? "s" : ""}` : ""}" aria-pressed="${d === c.selected}">
      <span class="num">${M.ymd(d).d}</span><span class="mchips">${chips}${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ""}</span>
      ${list.length ? `<span class="dots">${list.slice(0, 4).map((x) => `<i style="--ev:${x.type === "event" ? colorOf(x.e) : "var(--tertiary)"}"></i>`).join("")}</span>` : ""}
    </button>`;
  }
  const sel = c.selected;
  body.innerHTML = `
    <div class="month card"><div class="mgrid">${head}${cells}</div></div>
    <section class="card day-panel">
      <div class="day-head"><h2>${esc(fmtDate(sel, { weekday: "long", month: "long", day: "numeric" }))}</h2>
        <div class="row gap"><button class="btn tonal small" data-add-task>${icon("add")} Task</button><button class="btn tonal small" data-add-ev>${icon("add")} Event</button></div></div>
      ${dayList(sel, M.itemsOn(S.doc, sel).sort((a, b) => sortKey(a) - sortKey(b)))}
    </section>`;
  $$("[data-day]", body).forEach((b) => {
    b.addEventListener("click", () => { c.selected = Number(b.dataset.day); if (M.ymd(c.selected).m !== m) c.cursor = c.selected; render(); });
    b.addEventListener("dblclick", () => eventEditor(null, { day: Number(b.dataset.day) }));
  });
  $("[data-add-ev]", body).addEventListener("click", () => eventEditor(null, { day: sel }));
  $("[data-add-task]", body).addEventListener("click", () => taskEditor(null, { due: sel }));
  bindLists(body);
}

function week(body, td) {
  const c = S.cal;
  const s = startOfWeek(c.cursor);
  const items = itemsInRange(s, s + 6);
  const days = Array.from({ length: 7 }, (_, i) => s + i);
  const head = days.map((d) => `<button class="wk-day ${d === td ? "today" : ""} ${d === c.selected ? "sel" : ""}" data-day="${d}">
    <span>${esc(weekdayName(M.isoDow(d)))}</span><b>${M.ymd(d).d}</b></button>`).join("");
  const allDay = days.map((d) => {
    const list = (items.get(d) ?? []).filter((x) => x.type === "task" || x.e.allDay);
    return `<div class="wk-allday-cell">${list.map((x) => x.type === "event"
      ? `<button class="mchip solid" style="--ev:${colorOf(x.e)}" data-ev="${x.e.id}" data-occ="${x.occ}">${esc(x.e.title || "•")}</button>`
      : `<button class="mchip task ${x.t.done ? "done" : ""}" data-open="${x.t.id}">${x.t.dueMin != null ? esc(fmtTime(x.t.dueMin)) + " " : ""}${esc(x.t.title)}</button>`).join("")}</div>`;
  }).join("");
  const cols = days.map((d) => {
    const segs = [];
    for (const x of items.get(d) ?? []) {
      if (x.type !== "event" || x.e.allDay) continue;
      const { e, occ } = x;
      const a = d === occ ? e.sMin : 0;
      const b = e.kind === "reminder" ? a + 30 : d === occ + M.evLength(e) ? e.eMin : 1440;
      segs.push({ e, occ, a, b: Math.max(b, a + 20) });
    }
    // greedy lanes so overlapping events sit side by side
    segs.sort((p, q) => p.a - q.a);
    const lanes = [];
    for (const g of segs) { let i = lanes.findIndex((end) => end <= g.a); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = g.b; g.lane = i; }
    const n = Math.max(1, lanes.length);
    const now = d === td ? (() => { const t = new Date(); return t.getHours() * 60 + t.getMinutes(); })() : null;
    return `<div class="wk-col ${d === td ? "today" : ""}" data-col="${d}">
      ${segs.map((g) => `<button class="wk-ev ${g.e.kind}" style="--ev:${colorOf(g.e)};top:${(g.a / 60) * HOUR}px;height:${((g.b - g.a) / 60) * HOUR - 2}px;left:${(g.lane / n) * 100}%;width:${100 / n}%"
        data-ev="${g.e.id}" data-occ="${g.occ}"><b>${esc(g.e.title || "(untitled)")}</b><span>${g.e.kind === "reminder" ? icon("bell") : ""}${esc(fmtTime(g.a))}</span></button>`).join("")}
      ${now != null ? `<div class="now-line" style="top:${(now / 60) * HOUR}px"></div>` : ""}
    </div>`;
  }).join("");
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="hr" style="height:${HOUR}px"><span>${h === 0 ? "" : esc(fmtTime(h * 60).replace(":00", ""))}</span></div>`).join("");
  body.innerHTML = `
    <div class="card week">
      <div class="wk-head"><div class="wk-gutter"></div>${head}</div>
      <div class="wk-allday"><div class="wk-gutter small muted">all day</div>${allDay}</div>
      <div class="wk-scroll"><div class="wk-grid"><div class="wk-hours">${hours}</div>${cols}</div></div>
    </div>`;
  const sc = $(".wk-scroll", body);
  sc.scrollTop = (c.weekScroll ?? 7 * HOUR);
  sc.addEventListener("scroll", () => { c.weekScroll = sc.scrollTop; }, { passive: true });
  $$("[data-day]", body).forEach((b) => b.addEventListener("click", () => { c.selected = Number(b.dataset.day); c.mode = "month"; c.cursor = c.selected; pref.set("calMode", "month"); render(); }));
  $$("[data-col]", body).forEach((col) => col.addEventListener("click", (ev) => {
    if (ev.target !== col) return;
    const min = Math.floor((ev.offsetY / HOUR) * 2) * 30;
    eventEditor(null, { day: Number(col.dataset.col), sMin: Math.min(23 * 60, min) });
  }));
  bindLists(body);
  if (!reduceMotion()) body.firstElementChild.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 180 });
}

function agenda(body, td) {
  const items = itemsInRange(td, td + 59);
  let html = "";
  for (let d = td; d < td + 60; d++) {
    const list = items.get(d);
    if (!list?.length) continue;
    html += `<section class="agenda-day ${d === td ? "today" : ""}">
      <h2><span class="ad-num">${M.ymd(d).d}</span><span>${esc(d === td ? "Today" : d === td + 1 ? "Tomorrow" : fmtDate(d, { weekday: "long" }))}<small>${esc(fmtDate(d, { month: "long", year: "numeric" }))}</small></span></h2>
      ${dayList(d, list)}</section>`;
  }
  const overdue = S.doc.tasks.filter((t) => !t.done && t.due != null && t.due < td);
  body.innerHTML = `
    ${overdue.length ? `<section class="card agenda-day overdue"><h2>Overdue</h2><ul class="day-list">${overdue.map((t) => taskRow(t, { compact: true })).join("")}</ul></section>` : ""}
    ${html || `<div class="empty">${icon("calendar", "big")}<h2>Nothing in the next 60 days</h2><p class="muted">Add an event or give a task a due date.</p></div>`}`;
  bindLists(body);
}
