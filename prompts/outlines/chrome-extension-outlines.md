# Adblocker Chrome Extension Development Outline (TypeScript)

## 1. Initial Setup
- [ ] **Project Initialization**
  - [ ] Initialize the project using `npm init -y` or `yarn init -y`
  - [ ] Install TypeScript: `npm install typescript --save-dev`
  - [ ] Create `tsconfig.json` using `npx tsc --init` with settings for Chrome extensions
  - [ ] Set up a module bundler (e.g., Webpack, Vite) with TypeScript support
  - [ ] Install essential development dependencies:
    ```
    npm install --save-dev eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin jest ts-jest @types/chrome
    ```
  - [ ] Set up `.eslintrc.js` and `.prettierrc` for consistent code style
  - [ ] Create a `.gitignore` file to exclude `node_modules`, `dist`, and other build artifacts

## 2. Directory Structure Setup
- [ ] **Establish Project Directory Structure**
  - [ ] Set up the directory structure as follows:
    ```
    my-extension/
    ├── src/
    │   ├── background/
    │   │   └── index.ts
    │   ├── content/
    │   │   └── index.ts
    │   ├── popup/
    │   │   ├── index.html
    │   │   ├── index.tsx
    │   │   └── styles.css
    │   └── types/
    │       └── index.ts
    ├── public/
    │   ���── manifest.json
    │   └── images/
    │       ├── icon-16.png
    │       ├── icon-32.png
    │       ├── icon-48.png
    │       └── icon-128.png
    ├── tests/
    ├── webpack.config.js
    ├── package.json
    └── tsconfig.json
    ```

## 3. Architecture and Design
- [ ] **Define TypeScript Interfaces and Types**
  - [ ] Create TypeScript interfaces and types for core data models in `src/types/index.ts`
  - [ ] Define enums for any fixed values (e.g., message types, storage keys)
  - [ ] Example:
    ```typescript
    // src/types/index.ts
    export interface BlockedSite {
      hostname: string;
      isBlocked: boolean;
    }

    export enum MessageType {
      TOGGLE_BLOCKING = 'TOGGLE_BLOCKING',
      GET_BLOCKING_STATUS = 'GET_BLOCKING_STATUS',
      UPDATE_BLOCKING_STATUS = 'UPDATE_BLOCKING_STATUS',
    }

    export interface MessagePayload {
      type: MessageType;
      data?: unknown;
    }
    ```

## 4. Core Development
- [ ] **Background Script Development**
  - [ ] Implement the background script to manage blocking state
  - [ ] Example:
    ```typescript
    // src/background/index.ts
    import { MessageType, MessagePayload, BlockedSite } from '../types';

    const blockedSites: BlockedSite[] = [];

    chrome.runtime.onInstalled.addListener(() => {
      console.log('Adblocker extension installed');
    });

    chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
      if (message.type === MessageType.TOGGLE_BLOCKING) {
        const { hostname } = message.data as { hostname: string };
        const siteIndex = blockedSites.findIndex(site => site.hostname === hostname);
        
        if (siteIndex === -1) {
          blockedSites.push({ hostname, isBlocked: true });
        } else {
          blockedSites[siteIndex].isBlocked = !blockedSites[siteIndex].isBlocked;
        }
        
        sendResponse({ isBlocked: blockedSites[siteIndex]?.isBlocked || false });
      } else if (message.type === MessageType.GET_BLOCKING_STATUS) {
        const { hostname } = message.data as { hostname: string };
        const site = blockedSites.find(site => site.hostname === hostname);
        sendResponse({ isBlocked: site?.isBlocked || false });
      }
    });

    chrome.webRequest.onBeforeRequest.addListener(
      (details) => {
        const url = new URL(details.url);
        const site = blockedSites.find(site => site.hostname === url.hostname);
        return { cancel: site?.isBlocked || false };
      },
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
    ```

- [ ] **Content Script Development**
  - [ ] Implement content script to inject CSS for hiding ads
  - [ ] Example:
    ```typescript
    // src/content/index.ts
    import { MessageType, MessagePayload } from '../types';

    const hideAds = () => {
      const style = document.createElement('style');
      style.textContent = `
        .ad, .advertisement, [class*="ad-"], [id*="ad-"] {
          display: none !important;
        }
      `;
      document.head.appendChild(style);
    };

    chrome.runtime.sendMessage<MessagePayload>({
      type: MessageType.GET_BLOCKING_STATUS,
      data: { hostname: window.location.hostname }
    }, (response) => {
      if (response.isBlocked) {
        hideAds();
      }
    });

    chrome.runtime.onMessage.addListener((message: MessagePayload) => {
      if (message.type === MessageType.UPDATE_BLOCKING_STATUS && message.data) {
        if (message.data.isBlocked) {
          hideAds();
        } else {
          window.location.reload();
        }
      }
    });
    ```

- [ ] **Popup Development**
  - [ ] Implement UI components for the popup with an activation button
  - [ ] Example:
    ```typescript
    // src/popup/index.tsx
    import React, { useState, useEffect } from 'react';
    import ReactDOM from 'react-dom';
    import { MessageType, MessagePayload } from '../types';

    const Popup: React.FC = () => {
      const [isBlocked, setIsBlocked] = useState<boolean>(false);
      const [hostname, setHostname] = useState<string>('');

      useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const url = new URL(tabs[0].url || '');
          setHostname(url.hostname);

          chrome.runtime.sendMessage<MessagePayload>({
            type: MessageType.GET_BLOCKING_STATUS,
            data: { hostname: url.hostname }
          }, (response) => {
            setIsBlocked(response.isBlocked);
          });
        });
      }, []);

      const toggleBlocking = () => {
        chrome.runtime.sendMessage<MessagePayload>({
          type: MessageType.TOGGLE_BLOCKING,
          data: { hostname }
        }, (response) => {
          setIsBlocked(response.isBlocked);
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            chrome.tabs.sendMessage(tabs[0].id!, {
              type: MessageType.UPDATE_BLOCKING_STATUS,
              data: { isBlocked: response.isBlocked }
            });
          });
        });
      };

      return (
        <div>
          <h1>Adblocker</h1>
          <p>Current site: {hostname}</p>
          <button onClick={toggleBlocking}>
            {isBlocked ? 'Deactivate' : 'Activate'} Adblocker
          </button>
        </div>
      );
    };

    ReactDOM.render(<Popup />, document.getElementById('root'));
    ```

## 5. UI/UX Implementation
- [ ] **Styling and Responsiveness**
  - [ ] Use CSS modules or styled-components for scoped styling
  - [ ] Implement responsive design using CSS Grid or Flexbox
  - [ ] Example:
    ```typescript
    // src/popup/styles.module.css
    .container {
      display: flex;
      flex-direction: column;
      padding: 16px;
    }

    // src/popup/index.tsx
    import styles from './styles.module.css';

    const Popup: React.FC = () => {
      return <div className={styles.container}>...</div>;
    };
    ```

## 6. Testing
- [ ] **Unit Testing**
  - [ ] Write unit tests for TypeScript code using Jest and `ts-jest`
  - [ ] Example:
    ```typescript
    // tests/utils.test.ts
    import { add } from '../src/utils';

    describe('Utils', () => {
      it('adds two numbers correctly', () => {
        expect(add(1, 2)).toBe(3);
      });
    });
    ```

- [ ] **Integration Testing**
  - [ ] Use `sinon-chrome` to mock Chrome API for integration tests
  - [ ] Example:
    ```typescript
    // tests/background.test.ts
    import * as sinon from 'sinon';
    import * as sinonChrome from 'sinon-chrome';
    import '../src/background';

    describe('Background Script', () => {
      beforeEach(() => {
        global.chrome = sinonChrome as any;
      });

      it('listens for installation', () => {
        expect(chrome.runtime.onInstalled.addListener.calledOnce).toBe(true);
      });
    });
    ```

## 7. Optimization and Refactoring
- [ ] **Code Profiling and Optimization**
  - [ ] Use Chrome DevTools Performance tab to profile the extension
  - [ ] Implement lazy loading for heavy components
  - [ ] Example:
    ```typescript
    // src/popup/index.tsx
    const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

    const Popup: React.FC = () => {
      return (
        <React.Suspense fallback={<div>Loading...</div>}>
          <HeavyComponent />
        </React.Suspense>
      );
    };
    ```

## 8. Documentation
- [ ] **Code Documentation**
  - [ ] Use TSDoc comments for TypeScript documentation
  - [ ] Generate API documentation using TypeDoc
  - [ ] Example:
    ```typescript
    /**
     * Adds two numbers.
     * @param a - The first number.
     * @param b - The second number.
     * @returns The sum of a and b.
     */
    export const add = (a: number, b: number): number => a + b;
    ```

## 9. Deployment and Maintenance
- [ ] **Production Build**
  - [ ] Configure Webpack for production builds
  - [ ] Implement environment-specific configurations
  - [ ] Example `webpack.config.js`:
    ```javascript
    const path = require('path');
    const CopyPlugin = require('copy-webpack-plugin');

    module.exports = {
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      entry: {
        background: './src/background/index.ts',
        content: './src/content/index.ts',
        popup: './src/popup/index.tsx',
      },
      output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
      },
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
        ],
      },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
      },
      plugins: [
        new CopyPlugin({
          patterns: [{ from: 'public', to: '.' }],
        }),
      ],
    };
    ```

- [ ] **Continuous Integration and Deployment**
  - [ ] Set up GitHub Actions for CI/CD
  - [ ] Example `.github/workflows/ci.yml`:
    ```yaml
    name: CI
    on: [push]
    jobs:
      build:
        runs-on: ubuntu-latest
        steps:
        - uses: actions/checkout@v2
        - name: Use Node.js
          uses: actions/setup-node@v2
          with:
            node-version: '14'
        - run: npm ci
        - run: npm run build
        - run: npm test
    ```

## Notes
- Leverage TypeScript's type system to catch errors early in development
- Use advanced TypeScript features like conditional types and mapped types where appropriate
- Implement proper error handling and logging throughout the extension
- Regularly update dependencies and address security vulnerabilities
- Consider implementing feature flags for gradual rollout of new features
- Ensure the extension respects user privacy and only blocks ads on activated sites
- Regularly update the ad-blocking rules to stay effective against new ad formats
- Consider adding options for users to customize blocking rules or whitelist certain elements
- Implement proper error handling for cases where the current tab cannot be determined