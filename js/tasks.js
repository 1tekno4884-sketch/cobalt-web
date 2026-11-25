// Tasks view: progress, filters, list (Android TasksScreen).
import * as M from "./model.js";
import { S, edit, render } from "./state.js";
import { $$, esc, icon, toast, dueLabel, fmtTime } from "./dom.js";
import { taskEditor } from "./editors.js";

const FILTERS = ["Active", "Today", "Upcoming", "Done"];
const REPEAT_LABEL = Object.fromEntries(M.REPEATS);

export function repeatText(t) {
  if (t.repeat !== "Custom") return REPEAT_LABEL[t.repeat];
  const d = t.repeatDays;
  if (!d.length) return "Custom";
  if (d.length === 7) return "Every day";
  if (d.join() === "1,2,3,4,5") return "Weekdays";
  if (d.join() === "6,7") return "Weekends";
  return "Every " + d.map((x) => new Intl.DateTimeFormat(navigator.language, { weekday: "short" }).format(new Date(2024, 0, x))).join(", ");
}

export function taskRow(t, { compact = false } = {}) {
  const due = dueLabel(t.due);
  const overdue = due?.startsWith("Overdue") && !t.done;
  const prio = ["low", "normal", "high"][t.priority] ?? "normal";
  return `<li class="task ${t.done ? "done" : ""}" data-task="${t.id}">
    <button class="check prio-${prio}" data-toggle="${t.id}" aria-label="${t.done ? "Mark not done" : "Complete"}: ${esc(t.title)}" aria-pressed="${t.done}">${icon("check")}</button>
    <button class="task-body" data-open="${t.id}">
      <span class="title">${esc(t.title)}</span>
      ${t.note && !compact ? `<span class="note">${esc(t.note)}</span>` : ""}
      ${due || t.repeat !== "None" ? `<span class="tags">
        ${t.repeat !== "None" ? `<span class="tag tertiary">${icon("repeat")}${esc(repeatText(t))}</span>` : ""}
        ${due ? `<span class="tag ${overdue ? "error" : "secondary"}">${icon("calendar")}${esc(due)}${t.dueMin != null ? " · " + esc(fmtTime(t.dueMin)) : ""}</span>` : ""}
      </span>` : ""}
    </button>
    ${t.priority === 2 ? `<span class="bang" aria-label="High priority">!!</span>` : ""}
  </li>`;
}

/** Shared click handling for task rows anywhere (tasks view, calendar lists). */
export function bindTaskRows(root) {
  $$("[data-toggle]", root).forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = Number(b.dataset.toggle);
    const li = b.closest(".task");
    li?.classList.toggle("checking");
    setTimeout(() => edit((doc) => M.toggleTask(doc, id)), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 380);
  }));
  $$("[data-open]", root).forEach((b) => b.addEventListener("click", () => {
    const t = S.doc.tasks.find((x) => x.id === Number(b.dataset.open));
    if (t) taskEditor(t);
  }));
}

export function renderTasks(root) {
  const td = M.today();
  const tasks = S.doc.tasks;
  const doneToday = tasks.filter(M.doneToday).length;
  const total = doneToday + tasks.filter((t) => !t.done).length;
  const f = S.taskFilter;
  const shown = tasks.filter((t) => f === "Active" ? !t.done : f === "Today" ? !t.done && t.due != null && t.due <= td
    : f === "Upcoming" ? !t.done && t.due != null && t.due > td : t.done)
    .sort(f === "Done" ? (a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)
      : (a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || (a.dueMin ?? 1500) - (b.dueMin ?? 1500) || b.priority - a.priority || a.createdAt - b.createdAt);
  const pct = total ? Math.round((doneToday / total) * 100) : 0;
  root.innerHTML = `
    <div class="page-head">
      <h1>Tasks</h1>
      ${tasks.some((t) => t.done) ? `<button class="icon-btn" data-clear title="Clear completed" aria-label="Clear completed">${icon("sweep")}</button>` : ""}
    </div>
    <section class="card primary-container progress-card">
      <p class="title-m">${total === 0 ? "Nothing on your list" : doneToday === total ? "All done — nice work! 🎉" : `${doneToday} of ${total} done today`}</p>
      <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    </section>
    <div class="chips filters" role="tablist">${FILTERS.map((x) => `<button class="chip ${x === f ? "on" : ""}" role="tab" aria-selected="${x === f}" data-filter="${x}">${x === f ? icon("check") : ""}${x}</button>`).join("")}</div>
    ${shown.length ? `<ul class="task-list">${shown.map((t) => taskRow(t)).join("")}</ul>` : `
      <div class="empty">${icon("tasks", "big")}<h2>${f === "Done" ? "Nothing completed yet" : "You're all caught up"}</h2>
      <p class="muted">${f === "Done" ? "Finished tasks will show up here" : "Tap “New task” to add something"}</p></div>`}
    <button class="fab" data-new>${icon("add")}<span>New task</span></button>`;
  $$("[data-filter]", root).forEach((b) => b.addEventListener("click", () => { S.taskFilter = b.dataset.filter; render(); }));
  root.querySelector("[data-new]").addEventListener("click", () => taskEditor(null));
  root.querySelector("[data-clear]")?.addEventListener("click", () => {
    const removed = S.doc.tasks.filter((t) => t.done);
    edit((doc) => M.clearCompleted(doc));
    toast(`Cleared ${removed.length} completed`, "Undo", () => edit((doc) => removed.reduce((d, t) => M.restoreTask(d, t), doc)));
  });
  bindTaskRows(root);
}
