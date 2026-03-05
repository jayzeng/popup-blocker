import { MessageType, StorageKeys } from '../types';

type MessageRequest = { type: string; data?: unknown };
type MessageListener = (
  message: MessageRequest,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean;

type ChromeMockListeners = {
  onMessage: MessageListener[];
  onInstalled: Array<() => void>;
  onStartup: Array<() => void>;
  webNavigation: Array<(details: chrome.webNavigation.WebNavigationSourceCallbackDetails) => void>;
  windowsCreated: Array<(window: chrome.windows.Window) => void>;
  storageChanged: Array<(changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void>;
};

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function getListeners(): ChromeMockListeners {
  return (globalThis as unknown as { __chromeMockListeners: ChromeMockListeners }).__chromeMockListeners;
}

describe('background message handler', () => {
  let messageListener: MessageListener;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    const listeners = getListeners();
    listeners.onMessage.length = 0;
    listeners.onInstalled.length = 0;
    listeners.onStartup.length = 0;
    listeners.webNavigation.length = 0;
    listeners.windowsCreated.length = 0;
    listeners.storageChanged.length = 0;

    (chrome.storage.local.get as jest.Mock).mockImplementation(
      (_keys: unknown, callback: (result: Record<string, unknown>) => void) => callback({})
    );

    require('../background/index');
    messageListener = getListeners().onMessage[0];
  });

  async function send(message: MessageRequest, sender: chrome.runtime.MessageSender = {}): Promise<unknown> {
    return new Promise((resolve) => {
      messageListener(message, sender, resolve);
    });
  }

  function frameSender(tabUrl: string): chrome.runtime.MessageSender {
    return { frameId: 1, tab: { url: tabUrl } as chrome.tabs.Tab };
  }

  describe('TOGGLE_BLOCKING', () => {
    it('adds a new site when not previously blocked', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.TOGGLE_BLOCKING,
        data: { hostname: 'example.com', isIncognito: false },
      })) as { isBlocked: boolean; blockedCount: number; blockedSites: unknown[] };

      expect(response.isBlocked).toBe(true);
      expect(response.blockedCount).toBe(0);
      expect(response.blockedSites).toHaveLength(1);
    });

    it('toggles off an existing blocked site and removes it', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send({
        type: MessageType.TOGGLE_BLOCKING,
        data: { hostname: 'example.com', isIncognito: false },
      })) as { isBlocked: boolean; blockedSites: unknown[] };

      expect(response.isBlocked).toBe(false);
      expect(response.blockedSites).toHaveLength(0);
    });

    it('sets isMasked when isIncognito is true', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.TOGGLE_BLOCKING,
        data: { hostname: 'private.com', isIncognito: true },
      })) as { blockedSites: Array<{ hostname: string; isMasked: boolean }> };

      expect(response.blockedSites[0].hostname).toBe('private.com');
      expect(response.blockedSites[0].isMasked).toBe(true);
    });
  });

  describe('GET_BLOCKING_STATUS', () => {
    it('returns false for unknown host', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.GET_BLOCKING_STATUS,
        data: { hostname: 'unknown.com' },
      })) as { isBlocked: boolean; blockedCount: number };

      expect(response.isBlocked).toBe(false);
      expect(response.blockedCount).toBe(0);
    });

    it('returns true for known blocked host', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send({
        type: MessageType.GET_BLOCKING_STATUS,
        data: { hostname: 'example.com' },
      })) as { isBlocked: boolean };

      expect(response.isBlocked).toBe(true);
    });
  });

  describe('INCREMENT_BLOCKED_COUNT', () => {
    it('increments the count for a blocked site', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send({
        type: MessageType.INCREMENT_BLOCKED_COUNT,
        data: { hostname: 'example.com' },
      })) as { blockedCount: number };

      expect(response.blockedCount).toBe(1);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('returns blockedCount 0 for untracked host', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.INCREMENT_BLOCKED_COUNT,
        data: { hostname: 'nobody.com' },
      })) as { blockedCount: number };

      expect(response.blockedCount).toBe(0);
    });
  });

  describe('UNBLOCK_SITE', () => {
    it('removes a site from the list', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send({
        type: MessageType.UNBLOCK_SITE,
        data: { hostname: 'example.com' },
      })) as { success: boolean };

      expect(response.success).toBe(true);
    });

    it('returns success false for unknown site', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.UNBLOCK_SITE,
        data: { hostname: 'missing.com' },
      })) as { success: boolean };

      expect(response.success).toBe(false);
    });
  });

  describe('input validation', () => {
    it('rejects malformed payloads', async () => {
      await flushPromises();
      const response = (await send({
        type: MessageType.TOGGLE_BLOCKING,
        data: { hostname: 123 },
      })) as { success: boolean; error: string };

      expect(response.success).toBe(false);
      expect(response.error).toContain('Invalid message payload');
    });
  });

  describe('storage sync', () => {
    it('hydrates blocked sites from startup storage', async () => {
      jest.resetModules();
      getListeners().onMessage.length = 0;
      getListeners().storageChanged.length = 0;

      const stored = [{ hostname: 'stored.com', isBlocked: true, blockedCount: 5, isMasked: false }];
      (chrome.storage.local.get as jest.Mock).mockImplementationOnce(
        (_keys: unknown, callback: (result: Record<string, unknown>) => void) =>
          callback({ [StorageKeys.BLOCKED_SITES]: stored })
      );

      require('../background/index');
      const listener = getListeners().onMessage[0];
      await flushPromises();

      const response = await new Promise<unknown>((resolve) => {
        listener({ type: MessageType.GET_BLOCKING_STATUS, data: { hostname: 'stored.com' } }, {}, resolve);
      });

      expect((response as { isBlocked: boolean }).isBlocked).toBe(true);
    });

    it('updates in-memory cache on storage.onChanged', async () => {
      await flushPromises();

      const storageChanged = getListeners().storageChanged[0];
      storageChanged(
        {
          [StorageKeys.BLOCKED_SITES]: {
            oldValue: [],
            newValue: [{ hostname: 'updated.com', isBlocked: true, blockedCount: 2, isMasked: false }],
          },
        },
        'local'
      );

      const response = (await send({
        type: MessageType.GET_BLOCKING_STATUS,
        data: { hostname: 'updated.com' },
      })) as { isBlocked: boolean; blockedCount: number };

      expect(response.isBlocked).toBe(true);
      expect(response.blockedCount).toBe(2);
    });
  });

  describe('iframe hostname resolution', () => {
    it('uses top-level tab URL for subframe GET_BLOCKING_STATUS', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send(
        { type: MessageType.GET_BLOCKING_STATUS, data: { hostname: 'ads.doubleclick.net' } },
        frameSender('https://example.com/page')
      )) as { isBlocked: boolean };

      expect(response.isBlocked).toBe(true);
    });

    it('uses top-level tab URL for subframe INCREMENT_BLOCKED_COUNT', async () => {
      await flushPromises();
      await send({ type: MessageType.TOGGLE_BLOCKING, data: { hostname: 'example.com', isIncognito: false } });

      const response = (await send(
        { type: MessageType.INCREMENT_BLOCKED_COUNT, data: { hostname: 'ad.net' } },
        frameSender('https://example.com/page')
      )) as { blockedCount: number };

      expect(response.blockedCount).toBe(1);
    });
  });
});
