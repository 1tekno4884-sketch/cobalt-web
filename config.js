// Cobalt web config. Public values only — no secrets. Sync goes through the Ripple Worker (/v1/cobalt/*, docs/SYNC.md).
//
// Local testing: open the app once with ?api=http://127.0.0.1:8909 — the choice is kept in localStorage
// (open with ?api=default to go back to the live Worker).
const LIVE_API = "https://ripple-api.undertowstudio.workers.dev";
const KEY = "cobalt_api_override";

function pickApi() {
  try {
    const q = new URLSearchParams(location.search).get("api");
    if (q === "default" || q === "") localStorage.removeItem(KEY);
    else if (q && /^https?:\/\/[A-Za-z0-9.:\-[\]]+\/?$/.test(q)) localStorage.setItem(KEY, q.replace(/\/$/, ""));
    return localStorage.getItem(KEY) || LIVE_API;
  } catch { return LIVE_API; }
}

export const API_URL = pickApi();
export const IS_LIVE = API_URL === LIVE_API;
export const VERSION = "1.2.0";
