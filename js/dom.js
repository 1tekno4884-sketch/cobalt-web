// Small DOM helpers shared by the views.
import { minToHHMM, ymd, today } from "./model.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------------------------------------------------------------- icons (Material Symbols paths, inline)
const P = {
  check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  tasks: "M22 5.18 10.59 16.6l-4.24-4.24 1.41-1.41 2.83 2.83 10-10L22 5.18zm-2.21 5.04c.13.57.21 1.17.21 1.78 0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8c1.58 0 3.04.46 4.28 1.25l1.44-1.44A9.9 9.9 0 0 0 12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-1.19-.22-2.33-.6-3.39l-1.61 1.61z",
  calendar: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zm-7 5h5v5h-5z",
  account: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  sync: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  left: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
  right: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  sweep: "M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0zM5.99 4.58a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 0 0 1.41-1.41L5.99 4.58zm12.37 12.37a1 1 0 0 0-1.41 1.41l1.06 1.06a1 1 0 0 0 1.41-1.41l-1.06-1.06zm1.06-10.96a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 0 0 1.41 1.41l1.06-1.06zM7.05 18.36a1 1 0 0 0-1.41-1.41l-1.06 1.06a1 1 0 0 0 1.41 1.41l1.06-1.06z",
  moon: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.39 5.39 0 0 1-4.4 2.26 5.4 5.4 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  auto: "M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18V6c3.31 0 6 2.69 6 6s-2.69 6-6 6z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z",
  time: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
};
export const icon = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name]}"/></svg>`;
export const MARK = `<svg class="mark" viewBox="0 0 108 108" aria-hidden="true"><use href="#cobalt-mark"/></svg>`;

// ---------------------------------------------------------------- formatting
const locale = navigator.language || "en";
const use24 = !/[ap]m|午/i.test(new Intl.DateTimeFormat(locale, { hour: "numeric" }).format(new Date(2020, 0, 1, 15)));
export function fmtTime(min) {
  if (use24) return minToHHMM(min);
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const dateOf = (day) => { const { y, m, d } = ymd(day); return new Date(y, m - 1, d); };
export const fmtDate = (day, opts) => new Intl.DateTimeFormat(locale, opts).format(dateOf(day));
export const monthTitle = (day) => fmtDate(day, { month: "long", year: "numeric" });
export const weekdayShort = (day) => fmtDate(day, { weekday: "short" });
export const weekdayNarrow = (iso) => new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2024, 0, iso)); // 2024-01-01 is a Monday
export const weekdayName = (iso) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(2024, 0, iso));

/** "Today", "Tomorrow", "Overdue · Nov 3", weekday name within a week, else "Tue, Dec 8" (Components.dueLabel). */
export function dueLabel(day, td = today()) {
  if (day == null) return null;
  if (day === td) return "Today";
  if (day === td + 1) return "Tomorrow";
  if (day === td - 1) return "Yesterday";
  if (day < td) return "Overdue · " + fmtDate(day, { month: "short", day: "numeric" });
  if (day < td + 7) return fmtDate(day, { weekday: "long" });
  return fmtDate(day, { weekday: "short", month: "short", day: "numeric" });
}
export function ago(ms) {
  if (!ms) return "never";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

// ---------------------------------------------------------------- toast + dialogs
let toastTimer;
export function toast(text, action, onAction) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button class="btn text" type="button">${esc(action)}</button>` : ""}`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  if (action) $("button", el).onclick = () => { hide(); onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 3200);
  function hide() { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 250); }
}

/** Opens a <dialog> with the given inner HTML; returns it. onClose runs once. */
export function openDialog(html, { className = "", onClose } = {}) {
  const d = document.createElement("dialog");
  d.className = "sheet " + className;
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener("close", () => { onClose?.(d.returnValue); d.remove(); });
  d.addEventListener("click", (e) => { if (e.target === d) d.close("cancel"); }); // click on the backdrop
  d.showModal();
  return d;
}

/** Simple choice dialog → resolves with the chosen value or null. */
export function choose(title, body, options) {
  return new Promise((resolve) => {
    let picked = null;
    const d = openDialog(`
      <form method="dialog" class="choice">
        <h2>${esc(title)}</h2>${body ? `<p class="muted">${esc(body)}</p>` : ""}
        <div class="choice-buttons">${options.map((o, i) => `<button class="btn ${o.kind ?? "tonal"}" value="${i}">${esc(o.label)}</button>`).join("")}
          <button class="btn text" value="cancel">Cancel</button></div>
      </form>`, { onClose: () => resolve(picked) });
    d.querySelector("form").addEventListener("submit", (e) => { const v = e.submitter?.value; picked = v != null && v !== "cancel" ? options[+v].value : null; });
  });
}
