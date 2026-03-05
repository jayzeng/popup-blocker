# Repository Guidelines

## Project Structure & Module Organization
This is a Manifest V3 Chrome extension with no build step.
- Root scripts: `background.js` (service worker), `content.js` (content script), `block_popups.js` / `unblock_popups.js` (page-context overrides)
- UI: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`
- Extension metadata/assets: `manifest.json`, `icons/`
- Tests: `tests/*.test.js` with shared setup in `tests/setup.js`
- Docs/changelog: `README.md`, `CHANGELOG.md`
- CI/release automation: `.github/workflows/`

## Build, Test, and Development Commands
- `npm ci`: install pinned dev dependencies
- `npm run lint`: run ESLint across all `.js` files
- `npm test`: run Jest test suite (`jsdom` env)
- `npm test -- --runInBand`: run tests serially (matches CI)

Local extension run:
1. Open `chrome://extensions`
2. Enable Developer Mode
3. Load unpacked extension from repository root
4. Reload extension after code changes

## Coding Style & Naming Conventions
- JavaScript style is enforced by ESLint (`eslint:recommended`) and Prettier.
- Prettier defaults: 2-space indentation, semicolons, single quotes, trailing commas, max width 100.
- Keep filenames descriptive and aligned with behavior (`block_popups.js`, `background.js`).
- Use `camelCase` for variables/functions and `UPPER_SNAKE_CASE` for shared constants/message types.

## Testing Guidelines
- Framework: Jest with `jest-environment-jsdom`.
- Test files should be named `*.test.js` under `tests/`.
- Add/adjust tests for any behavioral change in message flow, popup interception, or UI state updates.
- Run `npm run lint && npm test` before opening a PR.

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages (e.g., `Refine GitHub Actions workflow`, `Remove webpack`).
- Prefer one logical change per commit; avoid mixing refactors and behavior changes.
- PRs should include:
  - clear summary of user-visible/technical changes
  - linked issue (if applicable)
  - test notes (commands run, results)
  - screenshots/GIFs for popup UI changes
- Ensure CI (`Lint`, `Test`) passes before requesting review.

## Security & Configuration Tips
- Do not commit secrets or API keys; this extension currently needs none.
- Keep `manifest.json` permissions minimal and justify any new permission in the PR.
- For incognito-related changes, verify split-mode behavior and masked host handling.
