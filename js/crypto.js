// End-to-end encryption for Cobalt sync (docs/SYNC.md). Byte-for-byte the same as the Android app's Crypto.kt.
// Works in browsers and in Node 22+ (globalThis.crypto, CompressionStream).
const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

export const KDF_ITER = 200000;
export const AAD_KEY = "cobalt-key-v1";
export const AAD_VAULT = "cobalt-vault-v1";

export function b64(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64(s) {
  const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
export const random = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function pbkdf2Bits(password, salt, iterations) {
  const base = await subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 256));
}

/** Ripple's login hash: base64url(PBKDF2-SHA256(password, "ripple:" + username.lower, 100 000)). */
export async function rippleHash(username, password) {
  return b64(await pbkdf2Bits(password, te.encode("ripple:" + username.trim().toLowerCase()), 100000));
}

/** Key-encryption key from the password (never sent anywhere). */
export async function kek(password, salt, iter = KDF_ITER) {
  const raw = await pbkdf2Bits(password, salt, iter);
  return subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Data key as a CryptoKey; non-extractable unless asked (only needed briefly to re-wrap). */
export const importDek = (raw, extractable = false) => subtle.importKey("raw", raw, "AES-GCM", extractable, ["encrypt", "decrypt"]);

export async function kid(rawDek) {
  const d = new Uint8Array(await subtle.digest("SHA-256", new Uint8Array([...te.encode("cobalt-kid:"), ...rawDek])));
  return b64(d).slice(0, 16);
}

/** iv(12) ‖ AES-256-GCM(key, plain, aad) */
export async function seal(key, plain, aad) {
  const iv = random(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(aad) }, key, plain));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return out;
}
/** Throws when the key is wrong or the data was changed. */
export async function open(key, sealed, aad) {
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: sealed.subarray(0, 12), additionalData: te.encode(aad) }, key, sealed.subarray(12)));
}

async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
export const gzip = (bytes) => pipe(bytes, new CompressionStream("gzip"));
export const gunzip = (bytes) => pipe(bytes, new DecompressionStream("gzip"));

/** New key wrapper for a raw data key: {kdf, wrapped, kid}. */
export async function wrap(rawDek, password) {
  const salt = random(16);
  const wrapped = await seal(await kek(password, salt), rawDek, AAD_KEY);
  return { kdf: { alg: "PBKDF2-SHA256", iter: KDF_ITER, salt: b64(salt) }, wrapped: b64(wrapped), kid: await kid(rawDek) };
}
/** Raw data key from a server wrapper, or null when this password doesn't open it. */
export async function unwrap(vault, password) {
  try {
    return await open(await kek(password, unb64(vault.kdf.salt), vault.kdf.iter), unb64(vault.wrapped), AAD_KEY);
  } catch { return null; }
}

export async function sealDoc(dek, doc) { return b64(await seal(dek, await gzip(te.encode(JSON.stringify(doc))), AAD_VAULT)); }
export async function openDoc(dek, blob) { return JSON.parse(td.decode(await gunzip(await open(dek, unb64(blob), AAD_VAULT)))); }
