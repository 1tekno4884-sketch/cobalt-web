// Task and event editors (dialogs). Mirror the Android TaskSheet / EventSheet fields.
import * as M from "./model.js";
import { S, edit } from "./state.js";
import { $, $$, esc, icon, openDialog, choose, toast, weekdayNarrow, weekdayName, dueLabel } from "./dom.js";

const seg = (name, items, value) => `<div class="seg" role="radiogroup">${items.map(([v, l]) =>
  `<label><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}</div>`;
const dayToggles = (name, days) => `<div class="days">${[1, 2, 3, 4, 5, 6, 7].map((d) =>
  `<label title="${esc(weekdayName(d))}"><input type="checkbox" name="${name}" value="${d}" ${days.includes(d) ? "checked" : ""}><span>${esc(weekdayNarrow(d))}</span></label>`).join("")}</div>`;
const repeatChips = (value) => `<div class="chips wrap" role="radiogroup">${M.REPEATS.map(([v, l]) =>
  `<label class="chip"><input type="radio" name="repeat" value="${v}" ${v === value ? "checked" : ""}><span>${esc(l)}</span></label>`).join("")}</div>`;

// ------------------------------------------------------------------ task
export function taskEditor(task = null, defaults = {}) {
  const td = M.today();
  const t = task ?? { title: "", note: "", priority: 1, due: defaults.due ?? td, repeat: "None", repeatDays: [], dueMin: undefined };
  const d = openDialog(`
    <form method="dialog" class="editor" novalidate>
      <header><h2>${task ? "Edit task" : "New task"}</h2><button class="icon-btn" value="cancel" aria-label="Close">${icon("close")}</button></header>
      <label class="field"><span>What needs doing?</span><input name="ttl" value="${esc(t.title)}" maxlength="300" autocomplete="off" required></label>
      <label class="field"><span>Notes (optional)</span><textarea name="note" rows="2" maxlength="4000">${esc(t.note)}</textarea></label>
      <fieldset><legend>Priority</legend>${seg("priority", [[0, "Low"], [1, "Normal"], [2, "High"]], t.priority)}</fieldset>
      <fieldset><legend>Due</legend>
        <div class="chips wrap" data-due-chips>
          <button type="button" class="chip" data-due="none">No date</button>
          <button type="button" class="chip" data-due="${td}">Today</button>
          <button type="button" class="chip" data-due="${td + 1}">Tomorrow</button>
          <button type="button" class="chip" data-due="${td + 7}">Next week</button>
        </div>
        <div class="row gap">
          <label class="field grow"><span>Date</span><input type="date" name="due" value="${t.due != null ? M.toIso(t.due) : ""}"></label>
          <label class="field grow"><span>Time (reminds you)</span><input type="time" name="dueMin" value="${t.dueMin != null ? M.minToHHMM(t.dueMin) : ""}"></label>
        </div>
      </fieldset>
      <fieldset><legend>${icon("repeat")} Repeat</legend>${repeatChips(t.repeat)}
        <div data-custom ${t.repeat === "Custom" ? "" : "hidden"}>${dayToggles("rd", t.repeatDays)}</div>
        <p class="hint" data-repeat-hint></p>
      </fieldset>
      <div class="actions">
        ${task ? `<button type="button" class="btn danger-text" data-delete>${icon("del")} Delete</button>` : ""}
        <span class="grow"></span>
        <button class="btn text" value="cancel">Cancel</button>
        <button class="btn filled" value="save" data-save>${task ? "Save" : "Add task"}</button>
      </div>
    </form>`, { className: "editor-dialog" });
  const f = $("form", d);
  const sync = () => {
    const due = M.fromIso(f.due.value);
    $$("[data-due]", f).forEach((b) => b.classList.toggle("on", b.dataset.due === "none" ? due == null : Number(b.dataset.due) === due));
    f.dueMin.disabled = due == null;
    const rep = f.repeat.value;
    $("[data-custom]", f).hidden = rep !== "Custom";
    $("[data-repeat-hint]", f).textContent = rep === "None" ? "" : "When you complete it, it comes back " + (M.REPEATS.find((r) => r[0] === rep)[1]).toLowerCase() + ".";
    $("[data-save]", f).disabled = !f.ttl.value.trim();
  };
  $$("[data-due]", f).forEach((b) => b.addEventListener("click", () => {
    f.due.value = b.dataset.due === "none" ? "" : M.toIso(Number(b.dataset.due));
    if (b.dataset.due === "none") { f.dueMin.value = ""; const n = $('input[name=repeat][value="None"]', f); n.checked = true; }
    sync();
  }));
  f.addEventListener("input", sync);
  f.addEventListener("change", (e) => {
    if (e.target.name === "repeat" && e.target.value !== "None" && !f.due.value) f.due.value = M.toIso(td);
    if (e.target.name === "repeat" && e.target.value === "Custom" && !$$("input[name=rd]:checked", f).length) {
      const dd = M.fromIso(f.due.value) ?? td; $(`input[name=rd][value="${M.isoDow(dd)}"]`, f).checked = true;
    }
    sync();
  });
  sync();
  setTimeout(() => { if (!task) f.ttl.focus(); }, 50);
  f.addEventListener("submit", (e) => {
    if (e.submitter?.value !== "save") return;
    const due = M.fromIso(f.due.value);
    const repeat = f.repeat.value;
    const rd = repeat === "Custom" ? $$("input[name=rd]:checked", f).map((x) => +x.value) : [];
    const fields = { title: f.ttl.value.trim(), note: f.note.value.trim(), priority: +f.priority.value, due, repeat,
      repeatDays: repeat === "Custom" && !rd.length ? [M.isoDow(due ?? td)] : rd, dueMin: due == null ? null : M.hhmmToMin(f.dueMin.value) };
    if (!fields.title) { e.preventDefault(); return; }
    if (!task) edit((doc) => M.addTask(doc, fields));
    else edit((doc) => {
      const cur = doc.tasks.find((x) => x.id === task.id);
      if (!cur) return doc;
      const upd = { ...cur, ...fields, due: due ?? (repeat !== "None" ? td : undefined) };
      if (upd.due == null) { delete upd.due; delete upd.dueMin; }
      if (upd.dueMin == null) delete upd.dueMin;
      return M.updateTask(doc, upd);
    });
  });
  $("[data-delete]", f)?.addEventListener("click", () => { d.close("delete"); deleteTask(task); });
}

export function deleteTask(task) {
  edit((doc) => M.deleteTask(doc, task.id));
  toast("Task deleted", "Undo", () => edit((doc) => M.restoreTask(doc, task)));
}

// ------------------------------------------------------------------ event
export function eventEditor(ev = null, { day = M.today(), occ = null, sMin = null } = {}) {
  const startMin = sMin ?? Math.min(23 * 60, (new Date().getHours() + 1) * 60);
  const e = ev ?? M.normEvent({ id: 0, title: "", start: day, end: day, allDay: false, sMin: startMin, eMin: Math.min(1440, startMin + 60), remind: [10], u: 0 });
  const colors = M.COLORS.map(([name, hex], i) => `<label class="swatch" title="${esc(name)}" style="--sw:${hex ?? "var(--primary)"}"><input type="radio" name="color" value="${i}" ${e.color === i ? "checked" : ""} aria-label="${esc(name)}"><span></span></label>`).join("");
  const reminds = M.REMIND_CHOICES.map(([m, l]) => `<label class="chip"><input type="checkbox" name="remind" value="${m}" ${e.remind.includes(m) ? "checked" : ""}><span>${esc(l)}</span></label>`).join("");
  const d = openDialog(`
    <form method="dialog" class="editor" novalidate>
      <header><h2>${ev ? "Edit" : "New"} <span data-kind-word>${e.kind === "reminder" ? "reminder" : "event"}</span></h2><button class="icon-btn" value="cancel" aria-label="Close">${icon("close")}</button></header>
      ${seg("kind", [["event", "Event"], ["reminder", "Reminder"]], e.kind)}
      <label class="field"><span>Title</span><input name="ttl" value="${esc(e.title)}" maxlength="300" autocomplete="off" required></label>
      <label class="switch-row" data-allday-row><span>All day</span><input type="checkbox" role="switch" name="allDay" ${e.allDay ? "checked" : ""}></label>
      <div class="row gap wrap">
        <label class="field grow"><span data-start-label>Starts</span><input type="date" name="start" value="${M.toIso(e.start)}" required></label>
        <label class="field grow" data-time><span>Time</span><input type="time" name="sMin" value="${M.minToHHMM(e.sMin)}"></label>
      </div>
      <div class="row gap wrap" data-end-row>
        <label class="field grow" data-end-date><span>Ends</span><input type="date" name="end" value="${M.toIso(e.end)}"></label>
        <label class="field grow" data-end-time><span>End time</span><input type="time" name="eMin" value="${M.minToHHMM(e.eMin % 1440)}"></label>
      </div>
      <fieldset><legend>${icon("repeat")} Repeat</legend>${repeatChips(e.repeat)}
        <div data-custom ${e.repeat === "Custom" ? "" : "hidden"}>${dayToggles("rd", e.repeatDays)}</div>
        <label class="field" data-until ${e.repeat === "None" ? "hidden" : ""}><span>Repeat until (optional)</span><input type="date" name="until" value="${e.until != null ? M.toIso(e.until) : ""}"></label>
      </fieldset>
      <fieldset><legend>${icon("bell")} Remind me</legend><div class="chips wrap">${reminds}</div>
        <p class="hint">Notifications show on your phone with the Cobalt app. All-day items remind at 9:00.</p></fieldset>
      <fieldset><legend>Colour</legend><div class="swatches">${colors}</div></fieldset>
      <label class="field"><span>Notes</span><textarea name="note" rows="2" maxlength="4000">${esc(e.note)}</textarea></label>
      <div class="actions">
        ${ev ? `<button type="button" class="btn danger-text" data-delete>${icon("del")} Delete</button>` : ""}
        <span class="grow"></span>
        <button class="btn text" value="cancel">Cancel</button>
        <button class="btn filled" value="save" data-save>Save</button>
      </div>
    </form>`, { className: "editor-dialog" });
  const f = $("form", d);
  const sync = () => {
    const rem = f.kind.value === "reminder";
    const all = f.allDay.checked;
    $("[data-kind-word]", f).textContent = rem ? "reminder" : "event";
    $("[data-allday-row]", f).hidden = rem;
    $("[data-time]", f).hidden = all && !rem;
    $("[data-end-row]", f).hidden = rem;
    $("[data-end-date]", f).hidden = !all;
    $("[data-end-time]", f).hidden = all;
    $("[data-start-label]", f).textContent = rem ? "Date" : "Starts";
    $("[data-custom]", f).hidden = f.repeat.value !== "Custom";
    $("[data-until]", f).hidden = f.repeat.value === "None";
    $("[data-save]", f).disabled = !f.ttl.value.trim() || !M.fromIso(f.start.value);
  };
  f.addEventListener("input", sync);
  f.addEventListener("change", (x) => {
    if (x.target.name === "start" && M.fromIso(f.start.value) != null && (M.fromIso(f.end.value) ?? 0) < M.fromIso(f.start.value)) f.end.value = f.start.value;
    if (x.target.name === "sMin") { const s = M.hhmmToMin(f.sMin.value); if (s != null) f.eMin.value = M.minToHHMM(Math.min(1439, s + 60)); }
    if (x.target.name === "repeat" && f.repeat.value === "Custom" && !$$("input[name=rd]:checked", f).length) $(`input[name=rd][value="${M.isoDow(M.fromIso(f.start.value) ?? day)}"]`, f).checked = true;
    sync();
  });
  sync();
  setTimeout(() => { if (!ev) f.ttl.focus(); }, 50);
  f.addEventListener("submit", (x) => {
    if (x.submitter?.value !== "save") return;
    const start = M.fromIso(f.start.value);
    if (!f.ttl.value.trim() || start == null) { x.preventDefault(); return; }
    const kind = f.kind.value, rem = kind === "reminder", allDay = !rem && f.allDay.checked;
    const s = M.hhmmToMin(f.sMin.value) ?? 540;
    let end = start, eMin = rem ? s : M.hhmmToMin(f.eMin.value) ?? Math.min(1440, s + 60);
    if (allDay) end = Math.max(start, M.fromIso(f.end.value) ?? start);
    else if (!rem && eMin <= s) end = start + 1;   // ends after midnight
    const repeat = f.repeat.value;
    const rd = $$("input[name=rd]:checked", f).map((y) => +y.value);
    const until = repeat === "None" ? null : M.fromIso(f.until.value);
    const fields = { ...(ev ?? {}), id: ev?.id ?? 0, title: f.ttl.value, note: f.note.value, kind, start, end, allDay,
      sMin: s, eMin, repeat, repeatDays: repeat === "Custom" ? (rd.length ? rd : [M.isoDow(start)]) : [],
      until: until != null && until >= start ? until : null, color: +(f.color.value || 0),
      remind: $$("input[name=remind]:checked", f).map((y) => +y.value) };
    if (fields.until == null) delete fields.until;
    if (repeat === "None") fields.skip = [];
    edit((doc) => M.saveEvent(doc, fields).doc);
  });
  $("[data-delete]", f)?.addEventListener("click", () => { d.close("delete"); deleteEvent(ev, occ); });
}

export async function deleteEvent(ev, occ) {
  let how = "all";
  if (ev.repeat !== "None" && occ != null) {
    how = await choose("Delete repeating event", `“${ev.title}” repeats. What should go?`, [
      { label: "Only this one", value: "one" }, { label: "This and following", value: "following" }, { label: "All of them", value: "all", kind: "danger" },
    ]);
    if (!how) return;
  }
  if (how === "one") edit((doc) => M.skipOccurrence(doc, ev.id, occ));
  else if (how === "following") edit((doc) => M.endSeriesBefore(doc, ev.id, occ));
  else edit((doc) => M.deleteEvent(doc, ev.id));
  toast(how === "one" ? "Removed this one" : "Event deleted", "Undo", () => edit((doc) => {
    const cur = doc.events.find((x) => x.id === ev.id);
    return cur ? M.saveEvent(doc, { ...ev }).doc : M.restoreEvent(doc, ev);
  }));
}

