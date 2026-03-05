# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- In-page toast indicator with animated count badge — appears whenever a popup is blocked, showing total blocked count with a bump animation on each increment; auto-dismisses after 5 s
- "Allow site" button in the toast expands to a duration picker: **5 min**, **1 hr**, or **Forever** — each adds a timed or permanent exception without opening the popup
- Timed exceptions expire automatically; background cleans them on startup and every 60 s; `shouldBlock` checks expiry lazily
- Popup lists show remaining time for temporary exceptions (e.g. "42m left")
- Global blocking toggle (defaults to ON on install) — popups are blocked on all sites without any setup
- Popup UI shows global ON/OFF toggle and adapts per-site button text ("Allow this site" / "Block this site") based on global mode
- When global blocking is ON, per-site toggle adds/removes an exception (allowlist entry) instead of toggling a blocklist
- Popup count updates pushed from background are now reflected live in the popup via `onMessage` listener
- On fresh install, `GLOBAL_ENABLED = true` is explicitly persisted to `chrome.storage.local` so both regular and incognito contexts (split mode) start with blocking enabled by default

## [1.0.0] - 2026-03-04

### Added
- Per-site popup blocking toggle via browser action popup
- Blocks `window.open`, `showModalDialog`, `location.assign/replace/reload`, `<a target="_blank">` clicks, middle-clicks, and `<form target="_blank">` submissions
- Re-applies `window.open` override every 500 ms to defeat page-level restore attempts
- Blocked popup count tracked and displayed per site
- List of all blocked sites in the popup with per-site Unblock buttons
- Incognito mode support (`"incognito": "split"`); incognito site hostnames are masked by default with a reveal toggle
- Background service worker intercepts new tabs and popup windows via `webNavigation.onCreatedNavigationTarget` and `windows.onCreated`
- Persists blocked sites to `chrome.storage.local`
