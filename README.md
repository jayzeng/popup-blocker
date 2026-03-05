# Yet Another Popup Blocker

Chrome extension that blocks popup windows and `_blank`-based popups on a per-site basis.

## Layout (No Build)

This repository is unpacked-extension first, similar to `urlblocker`:

- `manifest.json`
- `background.js`
- `content.js`
- `block_popups.js` / `unblock_popups.js`
- `popup/popup.html`, `popup/popup.css`, `popup/popup.js`
- `icons/`

No webpack, no TypeScript compile step, no `dist` build output required.

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

3. Load extension in Chrome:

- Open `chrome://extensions`
- Enable Developer mode
- Click **Load unpacked**
- Select this repository root

After code changes, click Reload on the extension card.

## Release Flow

The `Release` GitHub workflow:

- bumps `package.json` + `manifest.json` patch version
- runs lint/tests
- tags `vX.Y.Z`
- zips extension source files
- attaches zip to GitHub Release
