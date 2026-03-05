const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function getListeners() {
  return globalThis.__chromeMockListeners;
}

describe('background.js', () => {
  let onMessage;

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

    chrome.storage.local.get.mockImplementation((_keys, callback) => callback({}));

    require('../background.js');
    onMessage = listeners.onMessage[0];
  });

  function send(message, sender = {}) {
    return new Promise((resolve) => onMessage(message, sender, resolve));
  }

  it('blocks and unblocks host', async () => {
    await flushPromises();

    const block = await send({ type: 'TOGGLE_BLOCKING', data: { hostname: 'example.com', isIncognito: false } });
    expect(block.isBlocked).toBe(true);

    const status = await send({ type: 'GET_BLOCKING_STATUS', data: { hostname: 'example.com' } });
    expect(status.isBlocked).toBe(true);

    const unblock = await send({ type: 'TOGGLE_BLOCKING', data: { hostname: 'example.com', isIncognito: false } });
    expect(unblock.isBlocked).toBe(false);
  });

  it('resolves subframe hostname to tab url hostname', async () => {
    await flushPromises();
    await send({ type: 'TOGGLE_BLOCKING', data: { hostname: 'example.com', isIncognito: false } });

    const status = await send(
      { type: 'GET_BLOCKING_STATUS', data: { hostname: 'ads.cdn.com' } },
      { frameId: 1, tab: { url: 'https://example.com/page' } }
    );

    expect(status.isBlocked).toBe(true);
  });

  it('rejects invalid payloads', async () => {
    await flushPromises();
    const response = await send({ type: 'TOGGLE_BLOCKING', data: { hostname: 123 } });
    expect(response.success).toBe(false);
  });

  it('syncs storage.onChanged cache', async () => {
    await flushPromises();
    const listener = getListeners().storageChanged[0];

    listener(
      {
        BLOCKED_SITES: {
          oldValue: [],
          newValue: [{ hostname: 'synced.com', isBlocked: true, blockedCount: 2, isMasked: false }],
        },
      },
      'local'
    );

    const status = await send({ type: 'GET_BLOCKING_STATUS', data: { hostname: 'synced.com' } });
    expect(status.isBlocked).toBe(true);
    expect(status.blockedCount).toBe(2);
  });
});
