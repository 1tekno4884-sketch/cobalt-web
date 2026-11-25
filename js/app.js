// Cobalt web: shell, sign-in, account and sync orchestration.
import { API_URL, IS_LIVE, VERSION } from "../config.js";
import * as M from "./model.js";
import * as V from "./vault.js";
import * as store from "./store.js";
import { S, setHooks, render } from "./state.js";
import { $, $$, esc, icon, MARK, toast, ago, choose, reduceMotion } from "./dom.js";
import { renderTasks } from "./tasks.js";
import { renderCalendar } from "./calendar.js";

const app = $("#app");
const browser = (() => {
  const u = navigator.userAgent;
  return /Edg\//.test(u) ? "Edge" : /Firefox\//.test(u) ? "Firefox" : /OPR\//.test(u) ? "Opera" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Browser";
})();
const DEVICE = `Web · ${browser}`;

// ------------------------------------------------------------------ theme
function applyTheme() {
  const t = store.pref.get("theme", "system");
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  $('meta[name="theme-color"]').content = dark ? "#0D1220" : "#F8F9FF";
}
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

// ------------------------------------------------------------------ sync
let syncTimer = null, syncing = null;
function scheduleSync(ms) {
  clearTimeout(syncTimer);
  if (!S.sess || S.needsSignIn) return;
  syncTimer = setTimeout(() => syncNow().catch(() => {}), ms);
}
async function persist() {
  if (!S.sess) return;
  try { await store.saveCache(S.sess.dek, S.doc, S.rev); } catch {}
}
async function syncNow({ quiet = true } = {}) {
  if (!S.sess || S.needsSignIn) return;
  if (syncing) return syncing;
  S.syncing = true; renderStatus();
  syncing = (async () => {
    try {
      await V.sync(API_URL, S.sess, {
        device: DEVICE,
        getLocal: () => ({ doc: S.doc, rev: S.rev }),
        apply: (doc, rev) => { if (rev !== S.rev) return false; S.doc = doc; persist(); render(); return true; },
      });
      S.error = null;
      store.saveSyncInfo(S.sess);
    } catch (e) {
      S.error = e.message || "Sync failed";
      if (e.needsSignIn) { S.needsSignIn = true; render(); }
      if (!quiet) toast(S.error);
      throw e;
    } finally {
      S.syncing = false; syncing = null; renderStatus();
    }
  })();
  return syncing;
}
addEventListener("focus", () => { if (S.sess && Date.now() - (S.sess.lastSync || 0) > 60000) scheduleSync(0); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.sess && Date.now() - (S.sess.lastSync || 0) > 60000) scheduleSync(0); });
addEventListener("online", () => scheduleSync(0));
setInterval(() => { if (!document.hidden) { renderStatus(); if (S.sess && Date.now() - (S.sess.lastSync || 0) > 5 * 60000) scheduleSync(0); } }, 30000);

setHooks({
  render: () => draw(),
  changed: () => { persist(); scheduleSync(3000); },
});

function statusText() {
  if (S.needsSignIn) return "Sign in again to keep syncing";
  if (S.syncing) return "Syncing…";
  if (S.error) return S.error;
  if (!S.sess?.lastSync) return "Not synced yet";
  return `Synced ${ago(S.sess.lastSync)}${S.sess.lastDevice ? ` from ${S.sess.lastDevice}` : ""}`;
}
function renderStatus() {
  for (const el of $$("[data-status]")) {
    el.textContent = statusText();
    el.closest(".sync-chip")?.classList.toggle("err", !!(S.error || S.needsSignIn));
    el.closest(".sync-chip")?.classList.toggle("busy", S.syncing);
  }
}

// ------------------------------------------------------------------ sign in
const symbols = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#071E6B"/><stop offset=".55" stop-color="#1F5BFF"/><stop offset="1" stop-color="#4FA8FF"/></linearGradient>
  <symbol id="cobalt-mark" viewBox="0 0 108 108"><rect width="108" height="108" rx="28" fill="url(#cg)"/>
    <circle cx="54" cy="54" r="30" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="6"/>
    <path d="M54 24a30 30 0 0 1 30 30" fill="none" stroke="#7FE3FF" stroke-width="6" stroke-linecap="round"/>
    <path d="M40 55l10 10 20-22" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></symbol></defs></svg>`;

function signInScreen({ locked = null, msg = "" } = {}) {
  const u = locked?.username ?? S.sess?.username ?? "";
  app.innerHTML = symbols + `
    <main class="signin" id="main-pane">
      <div class="signin-card card">
        ${MARK.replace('class="mark"', 'class="mark big"')}
        <h1>Cobalt</h1>
        ${locked ? `
          <p class="muted">${icon("lock")} Your synced data is locked with your <b>previous</b> Ripple password (it was changed since). Enter the old one to unlock it — it's re-locked with your new password right away.</p>
          <form data-old>
            <label class="field"><span>Previous password</span><input type="password" name="old" autocomplete="off" required></label>
            <p class="err" role="alert">${esc(msg)}</p>
            <button class="btn filled wide">Unlock</button>
          </form>
          <button class="btn danger-text wide" data-fresh>Start fresh instead…</button>
          <button class="btn text wide" data-back>Back</button>` : `
          <p class="muted">Tasks and calendar, synced end-to-end encrypted with your phone.<br>Sign in with your <b>Ripple</b> account.</p>
          <form data-signin>
            <label class="field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(u)}" required></label>
            <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
            <p class="err" role="alert">${esc(msg)}</p>
            <button class="btn filled wide">Sign in</button>
          </form>
          <p class="hint">No account yet? Create one for free in the Ripple or Sonar app. Your password never leaves this browser; it also unlocks your encrypted data.</p>
          ${IS_LIVE ? "" : `<p class="hint mono">Server: ${esc(API_URL)}</p>`}`}
      </div>
      <p class="enc-note">Your data is encrypted on this device before it's uploaded. The server can't read it.</p>
    </main>`;
  const busy = (form, on) => { $$("button, input", form).forEach((x) => { x.disabled = on; }); const b = $("button", form); if (b) b.textContent = on ? "Unlocking…" : b.dataset.label ?? b.textContent; };
  $("[data-signin]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const username = f.username.value, password = f.password.value;
    $("button", f).dataset.label = "Sign in"; busy(f, true);
    try { await finishSignIn(await V.signIn(API_URL, username, password, { localDoc: S.doc, device: DEVICE })); }
    catch (err) {
      if (err instanceof V.NeedsOldPassword) return signInScreen({ locked: { username, password } });
      busy(f, false); $(".err", f).textContent = err.message || "Couldn't sign in";
    }
  });
  $("[data-old]")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    $("button", f).dataset.label = "Unlock"; busy(f, true);
    try { await finishSignIn(await V.signIn(API_URL, locked.username, locked.password, { oldPassword: f.old.value, localDoc: S.doc, device: DEVICE })); }
    catch (err) { busy(f, false); $(".err", f).textContent = err.message || "Couldn't unlock"; }
  });
  $("[data-fresh]")?.addEventListener("click", async () => {
    const ok = await choose("Start fresh?", "This replaces the synced copy with a new, empty one locked by your current password. Your phone keeps its own data and will upload it again after you sign in there. Anything that only existed in the old synced copy is lost.",
      [{ label: "Start fresh", value: true, kind: "danger" }]);
    if (!ok) return;
    try { await finishSignIn(await V.signIn(API_URL, locked.username, locked.password, { startFresh: true, localDoc: S.doc, device: DEVICE })); }
    catch (err) { toast(err.message); }
  });
  $("[data-back]")?.addEventListener("click", () => signInScreen());
  setTimeout(() => $("input:not([value]), input[value='']")?.focus(), 30);
}

async function finishSignIn(sess) {
  const prevUid = S.sess?.uid;
  if (prevUid && prevUid !== sess.uid) { S.doc = M.emptyDoc(); S.rev = 0; }
  if (sess.created) sess.syncedRev = S.rev;
  S.sess = sess; S.needsSignIn = false; S.error = null;
  await store.saveSession(sess);
  await persist();
  draw();
  try { await syncNow({ quiet: false }); } catch {}
  toast(`Signed in as @${sess.username}`);
}

async function signOut() {
  clearTimeout(syncTimer);
  if (S.sess) await V.logout(API_URL, S.sess);
  await store.wipe();
  Object.assign(S, { sess: null, doc: M.emptyDoc(), rev: 0, error: null, needsSignIn: false });
  signInScreen();
}

// ------------------------------------------------------------------ shell
const NAV = [["tasks", "Tasks", "tasks"], ["calendar", "Calendar", "calendar"], ["account", "Account", "account"]];

function draw() {
  if (!S.sess) return signInScreen();
  let shell = $(".shell", app);
  if (!shell) {
    app.innerHTML = symbols + `
      <div class="shell">
        <nav class="nav" aria-label="Main">
          <div class="brand">${MARK}<span>Cobalt</span></div>
          ${NAV.map(([r, l, i]) => `<a href="#/${r}" class="nav-item" data-route="${r}">${icon(i)}<span>${l}</span></a>`).join("")}
          <div class="nav-spacer"></div>
          <button class="sync-chip rail-only" data-sync title="Sync now">${icon("sync")}<span data-status></span></button>
        </nav>
        <main id="main-pane">
          <div class="topbar">
            <button class="sync-chip" data-sync title="Sync now">${icon("sync")}<span data-status></span></button>
            <button class="icon-btn" data-theme-btn aria-label="Change theme"></button>
          </div>
          <div id="view"></div>
          <p class="enc-note">Your data is encrypted on this device before it's uploaded. The server can't read it.</p>
        </main>
      </div>`;
    shell = $(".shell", app);
    $$("[data-sync]", shell).forEach((b) => b.addEventListener("click", () => {
      if (S.needsSignIn) return signInScreen({ msg: "Your session ended. Sign in again to keep syncing." });
      syncNow({ quiet: false }).catch(() => {});
    }));
    $("[data-theme-btn]", shell).addEventListener("click", cycleTheme);
  }
  const themeNow = store.pref.get("theme", "system");
  const tb = $("[data-theme-btn]", shell);
  tb.innerHTML = icon(themeNow === "light" ? "sun" : themeNow === "dark" ? "moon" : "auto");
  tb.title = `Theme: ${themeNow}`;
  $$("[data-route]", shell).forEach((a) => a.setAttribute("aria-current", a.dataset.route === S.route ? "page" : "false"));
  const view = $("#view");
  const scroll = view.scrollTop;
  view.dataset.route = S.route;
  if (S.route === "calendar") renderCalendar(view);
  else if (S.route === "account") renderAccount(view);
  else renderTasks(view);
  view.scrollTop = scroll;
  renderStatus();
}

function cycleTheme() {
  const order = ["system", "light", "dark"];
  const t = order[(order.indexOf(store.pref.get("theme", "system")) + 1) % 3];
  store.pref.set("theme", t); applyTheme(); draw();
  toast(`Theme: ${t === "system" ? "follow system" : t}`);
}

function renderAccount(root) {
  const s = S.sess;
  const nT = S.doc.tasks.filter((t) => !t.done).length, nE = S.doc.events.length;
  const counts = `${nT} open task${nT === 1 ? "" : "s"} · ${nE} event${nE === 1 ? "" : "s"}`;
  root.innerHTML = `
    <div class="page-head"><h1>Account</h1></div>
    <section class="card account-card">
      <div class="avatar" aria-hidden="true">${esc((s.name || s.username)[0]?.toUpperCase() ?? "?")}</div>
      <div><p class="title-m">${esc(s.name)}</p><p class="muted">@${esc(s.username)} · Ripple account</p></div>
    </section>
    <section class="card">
      <h2 class="sec">${icon("sync")} Sync</h2>
      <p><span data-status></span></p>
      <p class="muted small">${esc(counts)}${s.size ? ` · ${(s.size / 1024).toFixed(1)} KB encrypted on the server (limit 1 MB)` : ""}</p>
      ${S.needsSignIn ? `<button class="btn filled" data-resign>Sign in again</button>` : `<button class="btn tonal" data-sync-now>${icon("sync")} Sync now</button>`}
      <p class="hint">Changes sync a few seconds after you make them, when you come back to this tab, and every few minutes while it's open.</p>
    </section>
    <section class="card">
      <h2 class="sec">${icon("calendar")} Calendar</h2>
      <label class="field"><span>Week starts on</span>
        <select name="ws">${[[1, "Monday"], [7, "Sunday"], [6, "Saturday"]].map(([v, l]) => `<option value="${v}" ${S.weekStart === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </section>
    <section class="card">
      <h2 class="sec">${icon("lock")} Privacy</h2>
      <p class="muted small">Cobalt encrypts your tasks and calendar in this browser with a key made from your password (PBKDF2, 200 000 rounds, AES-256-GCM). The server only stores ciphertext. Your phone keeps the real copy of your data.</p>
      <div class="row gap wrap">
        <button class="btn tonal" data-signout>Sign out</button>
        <button class="btn danger-text" data-wipe>Delete synced copy…</button>
      </div>
    </section>
    <p class="muted small center">Cobalt web ${VERSION}${IS_LIVE ? "" : ` · ${esc(API_URL)}`}</p>`;
  $("[data-sync-now]", root)?.addEventListener("click", () => syncNow({ quiet: false }).then(() => toast("Synced")).catch(() => {}));
  $("[data-resign]", root)?.addEventListener("click", () => signInScreen({ msg: "Your session ended. Sign in again to keep syncing." }));
  $("select[name=ws]", root).addEventListener("change", (e) => { S.weekStart = Number(e.target.value); store.pref.set("weekStart", S.weekStart); toast("Saved"); });
  $("[data-signout]", root).addEventListener("click", async () => {
    const ok = await choose("Sign out?", "This browser forgets your data and key. Everything stays on your phone and in the encrypted synced copy.", [{ label: "Sign out", value: true }]);
    if (ok) signOut();
  });
  $("[data-wipe]", root).addEventListener("click", async () => {
    const ok = await choose("Delete the synced copy?", "Removes the encrypted copy from the server and signs you out here. Your phone keeps all its data; sign in there again to upload a new copy.",
      [{ label: "Delete synced copy", value: true, kind: "danger" }]);
    if (!ok) return;
    try { await V.deleteServerCopy(API_URL, S.sess); toast("Synced copy deleted"); signOut(); } catch (e) { toast(e.message); }
  });
}

// ------------------------------------------------------------------ routing + boot
function route() {
  const r = (location.hash.match(/^#\/(\w+)/) ?? [])[1];
  if (r && NAV.some((n) => n[0] === r)) { S.route = r; store.pref.set("route", r); }
  if (S.sess) draw();
}
addEventListener("hashchange", route);
document.addEventListener("keydown", (e) => {
  if (!S.sess || e.target.closest("input, textarea, select, dialog") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "n") $(".fab")?.click();
  else if (e.key === "t" && S.route === "calendar") $("[data-today]")?.click();
  else if (e.key === "1") location.hash = "#/tasks";
  else if (e.key === "2") location.hash = "#/calendar";
});

(async function boot() {
  if (reduceMotion()) document.documentElement.classList.add("reduce-motion");
  const sess = await store.loadSession();
  if (!sess) return signInScreen();
  S.sess = sess;
  const cached = await store.loadCache(sess.dek);
  if (cached) { S.doc = cached.doc; S.rev = cached.rev; } else S.sess.ver = 0;   // no local copy → download everything
  route();
  draw();
  scheduleSync(0);
})();

if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
