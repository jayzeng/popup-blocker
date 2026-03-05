type MessageListener = (...args: unknown[]) => void;

type ChromeMockListeners = {
  onMessage: MessageListener[];
  onInstalled: Array<() => void>;
  onStartup: Array<() => void>;
  webNavigation: Array<(details: chrome.webNavigation.WebNavigationSourceCallbackDetails) => void>;
  windowsCreated: Array<(window: chrome.windows.Window) => void>;
  storageChanged: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
};

const listeners: ChromeMockListeners = {
  onMessage: [],
  onInstalled: [],
  onStartup: [],
  webNavigation: [],
  windowsCreated: [],
  storageChanged: [],
};

const chromeMock = {
  runtime: {
    onMessage: {
      addListener: jest.fn((fn: MessageListener) => listeners.onMessage.push(fn)),
    },
    onInstalled: {
      addListener: jest.fn((fn: () => void) => listeners.onInstalled.push(fn)),
    },
    onStartup: {
      addListener: jest.fn((fn: () => void) => listeners.onStartup.push(fn)),
    },
    sendMessage: jest.fn(),
    getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
    lastError: undefined as { message?: string } | undefined,
  },
  storage: {
    local: {
      get: jest.fn((_keys: unknown, callback: (result: Record<string, unknown>) => void) => callback({})),
      set: jest.fn(),
    },
    onChanged: {
      addListener: jest.fn(
        (fn: (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void) =>
          listeners.storageChanged.push(fn)
      ),
    },
  },
  tabs: {
    query: jest.fn((_query: unknown, callback: (tabs: chrome.tabs.Tab[]) => void) => callback([])),
    sendMessage: jest.fn(),
    get: jest.fn((_id: number, callback: (tab: unknown) => void) => callback({ url: 'https://example.com' })),
    remove: jest.fn(),
  },
  windows: {
    onCreated: {
      addListener: jest.fn((fn: (window: chrome.windows.Window) => void) => listeners.windowsCreated.push(fn)),
    },
    remove: jest.fn(),
    getCurrent: jest.fn((callback: (window: unknown) => void) => callback({ incognito: false })),
    get: jest.fn((_id: number, callback: (window: unknown) => void) => callback({ incognito: false })),
  },
  webNavigation: {
    onCreatedNavigationTarget: {
      addListener: jest.fn((fn: (details: chrome.webNavigation.WebNavigationSourceCallbackDetails) => void) => {
        listeners.webNavigation.push(fn);
      }),
    },
  },
};

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
(globalThis as unknown as { __chromeMockListeners: ChromeMockListeners }).__chromeMockListeners = listeners;
