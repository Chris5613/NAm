# Extension Patch — v1.0.0 → v1.1.0

This folder contains the **3 files you need to update in `Chris5613/Extention`** to switch from "POST to a backend URL" to "push directly to the page via `window.postMessage`" (no server hop).

## Net Worth tracker URL targeted

`https://nam-qyn8.onrender.com/*`

If your deployed URL ever changes, edit the same three places in `manifest.json`.

## Files to replace / add

| Action | Path in extension repo | Source in this patch |
|---|---|---|
| **Replace** | `extension/manifest.json` | `manifest.json` |
| **Replace** | `extension/background.js` | `background.js` |
| **Add new** | `extension/content-app.js` | `content-app.js` |

That's it. No changes to `popup.*`, `options.*`, `content.js`, or `icons/`.

## What changed

### `manifest.json`
- Bumped version to `1.1.0`
- Added `https://nam-qyn8.onrender.com/*` to `host_permissions`
- Added a second entry to `content_scripts` that loads `content-app.js` on the tracker's URL

### `background.js`
- Added `lastFullPayload: payload` to the success-path `setSettings({...})` call (search for "Full payload — content-app.js"). This is the only change.
- Existing behavior (Destination URL POST, alarm-based auto-sync, popup status updates) is untouched. If `Destination URL` is empty in Settings, the extension simply skips the HTTP POST and relies entirely on the `postMessage` bridge.

### `content-app.js` (new)
- Runs on the Net Worth tracker page only.
- On load, posts `{ source: "unity-nodes-tracker-ext", type: "READY" }` so the React app knows the extension is installed.
- Reads `lastFullPayload` from `chrome.storage.local` and forwards via `window.postMessage` (covers the case where the page loaded *after* the most recent sync).
- Subscribes to `chrome.storage.onChanged` so any future sync from the background worker is pushed to the page in real time.
- Listens for `{ source: "unity-nodes-tracker-app", type: "REQUEST_LATEST" }` from the page so the "Sync from extension" button can pull on demand.

## How to install on your end

1. Clone (or pull) `Chris5613/Extention` locally.
2. Copy the three files from this folder into `extension/` (overwriting `manifest.json` and `background.js`, adding `content-app.js`).
3. Commit + push to `main`.
4. Re-load the extension in Chrome:
   - `chrome://extensions/` → Find **Unity Nodes Earnings Tracker** → click the reload icon.
5. Open Settings (Options) and **clear the Destination URL** (or leave it — both work). The bridge fires regardless.
6. Open `https://nam-qyn8.onrender.com/integrations`. Within ~1 s the React card should flip the "extension" badge on (a violet plug icon next to the green "auto-sync" pill).
7. Click **Sync from extension** on the card → toast confirms the apply.

## Verifying the bridge is live (DevTools)

Open DevTools on `https://nam-qyn8.onrender.com/integrations`, run in the Console:

```js
window.addEventListener('message', e => {
  if (e.origin === window.location.origin && e.data?.source === 'unity-nodes-tracker-ext') {
    console.log('[Unity ext]', e.data.type, e.data.payload || '');
  }
});
```

Then reload the page — you should see `[Unity ext] READY` and then `[Unity ext] EARNINGS_PUSH {...}` if a sync has been cached.
