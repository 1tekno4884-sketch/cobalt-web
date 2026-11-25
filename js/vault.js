// Sign-in + end-to-end encrypted sync engine (same algorithm as the Android app's Sync.kt, docs/SYNC.md).
// No DOM and no storage here: the caller passes a session object and gets results back, so Node can test it.
import * as C from "./crypto.js";
import { merge, normDoc } from "./model.js";

export class ApiError extends Error {
  constructor(status, message, body) { super(message); this.status = status; this.body = body; }
}
/** The sync copy is locked with an older Ripple password and this browser doesn't hold the key. */
export class NeedsOldPassword extends Error {
  constructor() { super("Your synced data is locked with your previous Ripple password."); this.name = "NeedsOldPassword"; }
}

export async function call(base, method, path, body, token) {
  let r;
  try {
    r = await fetch(base + path, {
      method,
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, j?.error || `Server error (${r.status})`, j);
  return j ?? {};
}

/**
 * Signs in and unlocks (or creates) the vault. Returns a session:
 * {token, uid, username, name, dek (non-extractable CryptoKey), kid, ver, syncedRev, lastSync, lastDevice, size}.
 * `opts.oldPassword` re-locks a copy made before a password change; `opts.startFresh` replaces it with `localDoc`.
 */
export async function signIn(base, username, password, { oldPassword = null, startFresh = false, localDoc, device = "Web" } = {}) {
  const user = String(username).trim().toLowerCase().replace(/^@/, "");
  if (!user || !password) throw new Error("Enter your username and password");
  const login = await call(base, "POST", "/v1/auth/login", { username: user, passwordHash: await C.rippleHash(user, password) });
  const token = login.token;
  const sess = { token, uid: login.user.id, username: user, name: login.user.displayName || user, ver: 0, syncedRev: -1, lastSync: 0, lastDevice: "", size: 0 };
  try {
    const v = await call(base, "GET", "/v1/cobalt/vault", undefined, token);
    if (!v.exists || startFresh) {
      const raw = C.random(32);
      const key = await C.wrap(raw, password);
      const r = await call(base, "PUT", "/v1/cobalt/vault", {
        baseVer: v.ver ?? 0, blob: await C.sealDoc(await C.importDek(raw), localDoc), device, ...key, ...(v.exists ? { reset: true } : {}),
      }, token);
      return { ...sess, dek: await C.importDek(raw), kid: key.kid, ver: r.ver, size: r.size, lastSync: Date.now(), lastDevice: device, created: true };
    }
    let raw = await C.unwrap(v, password);
    const opened = !!raw;
    if (!raw) {
      if (oldPassword == null) throw new NeedsOldPassword();
      raw = await C.unwrap(v, oldPassword);
      if (!raw) throw new Error("That previous password doesn't unlock it either");
    }
    if ((await C.kid(raw)) !== v.kid) throw new Error("The sync key doesn't match");
    if (!opened) { // re-lock with the current password so every device can sign in with it
      const key = await C.wrap(raw, password);
      await call(base, "PUT", "/v1/cobalt/key", key, token);
    }
    return { ...sess, dek: await C.importDek(raw), kid: v.kid };
  } catch (e) {
    call(base, "POST", "/v1/auth/logout", {}, token).catch(() => {});
    throw e;
  }
}

/**
 * Pull → merge → push, retrying when another device wins the race.
 * io = { getLocal(): {doc, rev}, apply(doc) → bool (false = edited meanwhile, go again), device }.
 * Mutates and returns `sess` (ver, syncedRev, lastSync, lastDevice, size). Throws ApiError; `e.needsSignIn` is set
 * when the session or key is no longer valid.
 */
export async function sync(base, sess, io) {
  try {
    for (let i = 0; i < 5; i++) {
      const { doc: local, rev } = io.getLocal();
      const dirty = rev !== sess.syncedRev;
      const v = await call(base, "GET", "/v1/cobalt/vault" + (sess.ver > 0 ? `?since=${sess.ver}` : ""), undefined, sess.token);
      if (!v.exists) throw Object.assign(new ApiError(410, "The synced copy was deleted on another device. Sign in again to start syncing."), { needsSignIn: true });
      if (v.kid !== sess.kid) throw Object.assign(new ApiError(409, "Sync was reset on another device. Sign in again."), { needsSignIn: true });
      const done = (ver, device, size) => Object.assign(sess, { ver, syncedRev: rev, lastSync: Date.now(), lastDevice: device ?? "", size: size ?? 0 });
      if (v.unchanged && !dirty) return done(v.ver, v.device, v.size);
      const remote = v.unchanged ? null : normDoc(await C.openDoc(sess.dek, v.blob));
      const m = remote ? merge(local, remote) : { doc: local, changedLocal: false, needPush: true };
      if (m.changedLocal && !io.apply(m.doc, rev)) continue;
      if (!m.needPush) return done(v.ver, v.device, v.size);
      try {
        const r = await call(base, "PUT", "/v1/cobalt/vault", { baseVer: v.ver, blob: await C.sealDoc(sess.dek, m.doc), device: io.device }, sess.token);
        return done(r.ver, io.device, r.size);
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409 || e.body?.ver == null) throw e;
        sess.ver = 0; // someone else synced first: fetch everything and merge again
      }
    }
    throw new ApiError(0, "Sync kept colliding with another device — try again in a moment");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) e.needsSignIn = true;
    throw e;
  }
}

/** Deletes the server copy (every device keeps its own data). */
export const deleteServerCopy = (base, sess) => call(base, "DELETE", "/v1/cobalt/vault", undefined, sess.token);
export const logout = (base, sess) => call(base, "POST", "/v1/auth/logout", {}, sess.token).catch(() => {});
