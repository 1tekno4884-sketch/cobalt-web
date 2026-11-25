# Cobalt web

Cobalt's tasks and calendar in the browser. It's a static PWA: plain JavaScript modules, no build step, no
dependencies. Sign in with a Ripple account. Your data is decrypted in the browser. The server only ever sees
ciphertext (format and rules: `../docs/SYNC.md`).

## Run locally

```sh
cd web
python3 -m http.server 8919
# open http://127.0.0.1:8919/?api=http://127.0.0.1:8909
```

`?api=` points the app at a local Ripple Worker (`backend/dev.sh` in the Ripple repo, or `wrangler dev --port 8909`).
The choice is saved in localStorage. Open with `?api=default` to switch back to the live Worker.

Tests (Node 22+, crypto/merge/occurrence checks, plus end-to-end sync if the Worker is running):

```sh
node web/tests/sync.test.mjs http://127.0.0.1:8909
```

## Files

| File | What it does |
|---|---|
| `js/crypto.js` | PBKDF2 key derivation, AES-256-GCM, gzip, key wrap/unwrap (same bytes as Android `sync/Crypto.kt`) |
| `js/model.js` | Dates, tasks, events, repeat occurrences, last-writer-wins merge with tombstones |
| `js/vault.js` | Sign-in (incl. password-change recovery) and the pull → merge → push sync loop |
| `js/store.js` | Session in localStorage; non-extractable data key + encrypted local copy in IndexedDB |
| `js/app.js`, `tasks.js`, `calendar.js`, `editors.js` | UI: sign-in, tasks, month/week/agenda calendar, editors, account |
| `sw.js` | App-shell cache (network first), never caches API responses |

## Hosting

Live at https://1tekno4884-sketch.github.io/cobalt-web/ (public repo `cobalt-web`, GitHub Pages, served from `main`).
Redeploy = copy `web/` (without `tests/`) into a checkout of `cobalt-web`, bump the cache name in `sw.js`, push.
The Android app links to it from Settings → Account (`COBALT_WEB_URL` in `AccountScreen.kt`).
