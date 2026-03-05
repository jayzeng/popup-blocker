# Yet Another Popup Blocker

Chrome extension that blocks popup windows and `_blank`-based popups on a per-site basis.

## Features

- Per-site toggle for popup blocking
- Counter for blocked popup attempts per site
- Incognito masking support for blocked hostnames
- Runtime-safe background state hydration from `chrome.storage.local`
- Type-safe message contracts between background/content/popup

## Architecture

- `background`: source of truth for blocked sites and counters; handles runtime messages and popup window interception.
- `content`: intercepts popup attempts in page context and reports counts.
- `popup`: React UI for toggling current site and managing blocked list.
- Shared contracts/utilities:
  - `src/types.ts` for message/state interfaces
  - `src/shared/message-validation.ts` for runtime message guards
  - `src/shared/site-utils.ts` for hostname normalization/masking/state sanitization

## Development

### Prerequisites

- Node.js 18+
- npm
- Google Chrome

### Install and build

```bash
npm ci
npm run build
```

### Run tests and lint

```bash
npm run lint
npm test
```

### Watch mode

```bash
npm run dev
```

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` directory

## CI and releases

- `CI` workflow runs `lint`, `test`, and `build` on pushes to `main` and pull requests.
- `Release` workflow (manual) bumps `package.json` and `public/manifest.json`, tags `vX.Y.Z`, builds, zips `dist`, and publishes a GitHub release artifact.
