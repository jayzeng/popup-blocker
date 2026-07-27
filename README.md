# Yet Another Popup Blocker

Chrome extension (Manifest V3) that blocks popup windows and `_blank`-based popups on a per-site basis.

No build step — plain JS files loaded directly as an unpacked extension.

---

## Demo

Live demo and documentation site:

- https://jayzeng.github.io/popup-blocker/

The demo explains how popup interception works across service worker, content script, and page context, and includes usage/setup notes for running the extension locally.

---

## Features

- Enable/disable blocking per site with one click
- Tracks a count of blocked popups per site
- Optional in-page blocked-count notifications (off by default)
- Incognito mode support (masked hostnames in the UI)
- Blocks multiple popup vectors: `window.open`, `showModalDialog`, `location.assign/replace/reload`, `<a target="_blank">` clicks, and form submissions targeting `_blank`
- Re-applies blocking every 500 ms to defeat scripts that restore `window.open` after page load

---

## File Structure

```
manifest.json          # Extension manifest (MV3)
background.js          # Service worker — state, message routing, tab/window interception
content.js             # Content script — DOM event interception, script injection
block_popups.js        # Injected into page context — overrides window.open etc.
unblock_popups.js      # Injected into page context — restores original methods
popup/
  popup.html           # Browser action popup markup
  popup.css            # Popup styles
  popup.js             # Popup UI logic
icons/                 # Extension icons (16, 48, 128 px)
tests/                 # Jest test files
```

---

## How It Works

Blocking is layered across three contexts: the **service worker**, the **content script**, and the **page context**.

### 1. Service Worker (`background.js`)

The background script is the source of truth for all state.

**Storage:** Blocked sites are persisted in `chrome.storage.local` under the key `BLOCKED_SITES` as an array of objects:

```js
{ hostname, isBlocked, blockedCount, isMasked }
```

On startup (`onInstalled`, `onStartup`, and immediately on load), the script reads storage into an in-memory `blockedSites[]` array. A `storageReady` queue gates all message handling until storage is loaded, preventing race conditions on first install.

**Navigation interception:** The background script hooks into two Chrome APIs to close popups before they render:

- `chrome.webNavigation.onCreatedNavigationTarget` — fires when a page opens a new tab. If the source tab's hostname is in `blockedSites`, the new tab is immediately closed with `chrome.tabs.remove`.
- `chrome.windows.onCreated` — fires when a new popup window is created. If the opener tab's hostname is blocked, the window is closed with `chrome.windows.remove`.

Both paths increment the blocked count and broadcast an `UPDATE_BLOCKING_STATUS` message.

**Message handling:** The background handles these messages from the popup and content scripts:

| Message | Sender | Effect |
|---|---|---|
| `TOGGLE_BLOCKING` | popup | Add or remove site from `blockedSites`, persist, notify content |
| `GET_BLOCKING_STATUS` | popup, content | Return `{ isBlocked, blockedCount }` for a hostname |
| `GET_BLOCKED_SITES` | popup | Return full `blockedSites[]` array |
| `UNBLOCK_SITE` | popup | Remove a site from `blockedSites`, persist |
| `INCREMENT_BLOCKED_COUNT` | content | Increment count for a site, persist, broadcast to popup |

### 2. Content Script (`content.js`)

The content script runs at `document_start` on every page (including iframes).

**On load:** It sends `GET_BLOCKING_STATUS` to the background. If the site is blocked, it calls `blockPopups()`.

**`blockPopups()`:**
1. Injects `block_popups.js` into the page's own JavaScript context via a `<script>` tag (necessary because content scripts can't override `window.open` in the page's scope).
2. Attaches four capturing DOM event listeners:
   - `mousedown` — stops propagation on clicks targeting `<a target="_blank">` (prevents the page from seeing the mousedown and opening a popup before the click fires)
   - `click` — prevents default and stops propagation on `<a target="_blank">` clicks
   - `auxclick` — same for middle-click (button 1)
   - `submit` — prevents default on forms with `target="_blank"`

**`unblockPopups()`:** Injects `unblock_popups.js` and removes all DOM listeners.

**`window.postMessage` bridge:** `block_popups.js` can't call `chrome.runtime.sendMessage` directly (page context, not extension context). Instead it posts a `BLOCKED_POPUP` or `BLOCKED_REDIRECT` message to `window`. The content script listens for these and forwards them as `INCREMENT_BLOCKED_COUNT` to the background.

**Background messages:** The content script also listens for `UPDATE_BLOCKING_STATUS` from the background to enable or disable blocking dynamically (e.g. when the user toggles via the popup while the page is open).

**In-page notifications:** The blocked-count toast is disabled by default. The popup's "Show block notifications on pages" option persists `SHOW_BLOCKED_TOAST` in `chrome.storage.local`; content scripts listen for storage changes so the setting takes effect immediately.

### 3. Page Context Scripts (`block_popups.js` / `unblock_popups.js`)

These run inside the page's own JavaScript scope, so they can override browser APIs that are inaccessible from the content script context.

**`block_popups.js`:**

- Saves original methods to `window.__popupBlockerOriginals` for later restoration.
- Uses `Object.defineProperty` with `writable: false, configurable: true` to override `window.open` and `window.showModalDialog`. Setting `writable: false` prevents page scripts from bypassing the block with a simple reassignment; `configurable: true` allows `unblock_popups.js` to restore it.
- Overrides `location.assign`, `location.replace`, and `location.reload` to block redirects.
- Overrides `HTMLAnchorElement.prototype.click` to block programmatic anchor clicks (a common ad-script trick: create a `<a target="_blank">` and call `.click()`).
- Runs a `setInterval` every 500 ms to re-apply the `window.open` and `showModalDialog` overrides, defeating any page-level restore attempts.
- Posts `{ type: 'BLOCKED_POPUP' }` or `{ type: 'BLOCKED_REDIRECT' }` to `window` so the content script can count the block.

**`unblock_popups.js`:**

- Clears the 500 ms interval (`window.__popupBlockerIntervalId`).
- Restores all methods from `window.__popupBlockerOriginals` using `Object.defineProperty` (matching how they were set) and falls back to direct assignment.
- Nulls out `window.__popupBlockerOriginals`.

### 4. Popup UI (`popup/popup.js`)

The browser action popup shows:

- The current tab's hostname
- Whether the site is blocked (with a toggle button)
- Total blocked popup count for the site
- An option to show or hide in-page blocked-count notifications (hidden by default)
- A list of all blocked sites with per-site Unblock buttons

Incognito-mode sites have `isMasked: true`; their hostnames are displayed as `***.**` by default with a toggle button to temporarily reveal them.

The popup communicates with the background entirely via `chrome.runtime.sendMessage`.

---

## Message Flow

```
popup  ──TOGGLE_BLOCKING──────────────────► background
popup  ──GET_BLOCKING_STATUS─────────────► background
popup  ──GET_BLOCKED_SITES──────────────► background
popup  ──UNBLOCK_SITE───────────────────► background

content ──GET_BLOCKING_STATUS────────────► background
content ──INCREMENT_BLOCKED_COUNT────────► background

background ──UPDATE_BLOCKING_STATUS──────► content (active tab)
background ──UPDATE_BLOCKING_STATUS──────► popup (broadcast)

page (block_popups.js) ──postMessage──► content ──INCREMENT_BLOCKED_COUNT──► background
```

---

## Incognito Support

`manifest.json` sets `"incognito": "split"`, giving the extension a separate service worker instance in incognito windows. Sites blocked in incognito are stored with `isMasked: true` so their hostnames are hidden by default in the popup list.

---

## Local Development

1. Install dev dependencies:

```bash
npm ci
```

2. Run checks:

```bash
npm run lint
npm test
```

3. Load the extension in Chrome:

- Open `chrome://extensions`
- Enable **Developer mode**
- Click **Load unpacked**
- Select this repository root

After any code change, click **Reload** on the extension card in `chrome://extensions`.

---

## Release Flow

The `Release` GitHub Actions workflow:

1. Bumps the patch version in `package.json` and `manifest.json`
2. Runs lint and tests
3. Creates a `vX.Y.Z` git tag
4. Zips the extension source files
5. Attaches the zip to a GitHub Release
