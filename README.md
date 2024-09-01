# Yet Another Popup Blocker Chrome Extension

## About

This Chrome extension is yet another popup blocker with per-site activation. It allows users to block popups on specific websites and provides an easy-to-use interface for managing blocked sites. The extension also includes a feature to mask hostnames of sites blocked in incognito mode for enhanced privacy.

## Features

- Block popups on a per-site basis
- View and manage list of blocked sites
- Mask hostnames of sites blocked in incognito mode
- Count of blocked popups per site
- Easy-to-use popup interface

## Technologies Used

- TypeScript
- React
- Chrome Extension API
- Webpack

## Getting Started

### Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)
- Google Chrome browser

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/simple-popup-blocker.git
   cd simple-popup-blocker
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the extension:
   ```
   npm run build
   ```

### Loading the Extension in Chrome

1. Open Google Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked" and select the `dist` folder in your project directory

## Development

### Running in Development Mode

To run the extension in development mode with hot reloading:

```
npm run dev
```

This will start Webpack in watch mode, automatically rebuilding the extension when you make changes.

### Debugging

1. With the extension loaded in Chrome, right-click the extension icon and select "Inspect popup" to open the DevTools for the popup
2. To debug the background script, go to the extension management page (`chrome://extensions`), find your extension, and click on the "background page" link under "Inspect views"
3. To debug content scripts, open DevTools on any page where the extension is active, and look for your content script in the "Sources" tab

### Building