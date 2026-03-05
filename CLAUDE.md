# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run build     # Build extension to dist/ (production uses NODE_ENV=production)
npm run dev       # Watch mode for development (webpack watch)
npm run lint      # ESLint on .ts/.tsx files
npm test          # Run Jest tests
```

After building, load the `dist/` folder as an unpacked extension in Chrome via `chrome://extensions` (Developer mode enabled).

## Architecture

This is a **Manifest V3 Chrome extension** with three compiled entry points (via Webpack) plus a plain JS file injected into page context:

### Entry Points (`src/`)
- **`background/index.ts`** — Service worker. Owns all state: `blockedSites[]` array is the in-memory store, synced to `chrome.storage.local`. Handles all message routing and intercepts navigation events (`webNavigation.onCreatedNavigationTarget`, `windows.onCreated`) to close popup tabs/windows for blocked sites.
- **`content/index.ts`** — Content script (runs at `document_start` on all URLs). Checks initial blocking status on load, listens for `UPDATE_BLOCKING_STATUS` messages, and when blocking is active: injects `block_popups.js` into page context and intercepts click/submit events on `_blank` targets.
- **`popup/index.tsx`** — React UI rendered in the browser action popup. Communicates with background via `chrome.runtime.sendMessage`.

### Page-Context Script (`public/`)
- **`block_popups.js`** — Plain JS injected directly into page context (not extension context) via a `<script>` tag. Overrides `window.open`, `showModalDialog`, and `location.assign/replace/reload`. Uses `window.postMessage` to notify the content script of blocked actions. Copied to `dist/` by CopyPlugin; listed as `web_accessible_resources` in manifest.

### Types (`src/types/index.ts`)
Shared `MessageType` enum and `BlockedSite`/`MessagePayload` interfaces used across all three entry points. Note: `src/types.ts` also exists at root of src — prefer `src/types/index.ts`.

### Message Flow
```
popup → background: TOGGLE_BLOCKING, GET_BLOCKING_STATUS, GET_BLOCKED_SITES, UNBLOCK_SITE
content → background: GET_BLOCKING_STATUS (on load), INCREMENT_BLOCKED_COUNT
background → content: UPDATE_BLOCKING_STATUS
page → content: postMessage (BLOCKED_POPUP, BLOCKED_REDIRECT) → content → background: INCREMENT_BLOCKED_COUNT
background → popup: UPDATE_BLOCKING_STATUS (count updates)
```

### Key Behaviors
- Blocked sites are stored in `chrome.storage.local` and loaded into the in-memory `blockedSites[]` array on startup.
- Incognito support uses `"incognito": "split"` in manifest; sites blocked in incognito have `isMasked: true`.
- CI (`build.yml`) builds on push to `main` and creates a timestamped git tag.

## Changelog

**Every user-visible change MUST be recorded in `CHANGELOG.md` before merging.**

- Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format with an `[Unreleased]` section at the top.
- Categorize entries under `Added`, `Changed`, `Fixed`, `Removed`, or `Security`.
- The release workflow bumps the version and promotes `[Unreleased]` to a dated `[X.Y.Z]` section — do not manually version the changelog.
- `CHANGELOG.md` is included in the release zip so users installing from a GitHub Release can read the history.
