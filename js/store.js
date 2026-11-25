// Browser storage for the signed-in session. The data key is a NON-extractable CryptoKey in IndexedDB; the cached
// data set is kept encrypted with it, so nothing readable sits on disk. Sign-out wipes everything.
import * as C from "./crypto.js";
import { normDoc } from "./model.js";

const DB = "cobalt-web", STORE = "kv";
const LS_SESSION = "cobalt_session", LS_TOKEN = "cobalt_token";

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(out?.result); };
    t.onerror = () => { db.close(); rej(t.error); };
  });
}
const put = (k, v) => tx("readwrite", (s) => s.put(v, k));
const get = (k) => tx("readonly", (s) => s.get(k));

/** Session fields that aren't secret (token goes to its own key, the data key to IndexedDB). */
const PUBLIC = ["uid", "username", "name", "kid", "ver", "syncedRev", "lastSync", "lastDevice", "size"];

export async function saveSession(sess) {
  const pub = {}; for (const k of PUBLIC) pub[k] = sess[k];
  localStorage.setItem(LS_SESSION, JSON.stringify(pub));
  localStorage.setItem(LS_TOKEN, sess.token);
  if (sess.dek) await put("dek", sess.dek);
}
export function saveSyncInfo(sess) {
  try { const pub = JSON.parse(localStorage.getItem(LS_SESSION) || "{}"); for (const k of PUBLIC) pub[k] = sess[k]; localStorage.setItem(LS_SESSION, JSON.stringify(pub)); } catch {}
}
export async function loadSession() {
  try {
    const pub = JSON.parse(localStorage.getItem(LS_SESSION) || "null");
    const token = localStorage.getItem(LS_TOKEN);
    if (!pub || !token) return null;
    const dek = await get("dek");
    if (!dek) return null;
    return { ...pub, token, dek };
  } catch { return null; }
}

/** Encrypted local copy: {blob, rev}. */
export async function saveCache(dek, doc, rev) { await put("cache", { blob: await C.sealDoc(dek, doc), rev }); }
export async function loadCache(dek) {
  try {
    const c = await get("cache");
    if (!c) return null;
    return { doc: normDoc(await C.openDoc(dek, c.blob)), rev: c.rev ?? 0 };
  } catch { return null; }
}

export async function wipe() {
  localStorage.removeItem(LS_SESSION); localStorage.removeItem(LS_TOKEN);
  try { await tx("readwrite", (s) => s.clear()); } catch {}
}

export const pref = {
  get: (k, d) => { try { const v = localStorage.getItem("cobalt_pref_" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem("cobalt_pref_" + k, JSON.stringify(v)); } catch {} },
};
