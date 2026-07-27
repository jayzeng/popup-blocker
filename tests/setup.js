const listeners = {
  onMessage: [],
  onInstalled: [],
  onStartup: [],
  webNavigation: [],
  windowsCreated: [],
  storageChanged: [],
};

globalThis.chrome = {
  extension: {
    inIncognitoContext: false,
  },
  runtime: {
    onMessage: {
      addListener: jest.fn((fn) => listeners.onMessage.push(fn)),
    },
    onInstalled: {
      addListener: jest.fn((fn) => listeners.onInstalled.push(fn)),
    },
    onStartup: {
      addListener: jest.fn((fn) => listeners.onStartup.push(fn)),
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    lastError: undefined,
  },
  storage: {
    local: {
      get: jest.fn((_keys, callback) => callback({})),
      set: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn((fn) => listeners.storageChanged.push(fn)),
    },
  },
  tabs: {
    query: jest.fn((_query, callback) => callback([])),
    sendMessage: jest.fn(),
    get: jest.fn((_id, callback) => callback({ url: 'https://example.com' })),
    remove: jest.fn(),
  },
  windows: {
    onCreated: {
      addListener: jest.fn((fn) => listeners.windowsCreated.push(fn)),
    },
    remove: jest.fn(),
    getCurrent: jest.fn((callback) => callback({ incognito: false })),
    get: jest.fn((_id, callback) => callback({ incognito: false })),
  },
  webNavigation: {
    onCreatedNavigationTarget: {
      addListener: jest.fn((fn) => listeners.webNavigation.push(fn)),
    },
  },
};

globalThis.__chromeMockListeners = listeners;
