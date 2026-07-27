const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function getListeners() {
  return globalThis.__chromeMockListeners;
}

describe('background.js', () => {
  let onMessage;
  let onNavigationTarget;

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
    onNavigationTarget = listeners.webNavigation[0];
  });

  function send(message, sender = {}) {
    return new Promise((resolve) => onMessage(message, sender, resolve));
  }

  it('toggles site exception mode when global blocking is enabled', async () => {
    await flushPromises();

    const allow = await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: false },
    });
    expect(allow.isBlocked).toBe(false);

    const statusAfterAllow = await send({
      type: 'GET_BLOCKING_STATUS',
      data: { hostname: 'example.com' },
    });
    expect(statusAfterAllow.isBlocked).toBe(false);

    const removeException = await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: false },
    });
    expect(removeException.isBlocked).toBe(true);
  });

  it('supports opt-in site blocking when global blocking is disabled', async () => {
    await flushPromises();

    const globalOff = await send({
      type: 'SET_GLOBAL_BLOCKING',
      data: { enabled: false },
    });
    expect(globalOff.globalBlockingEnabled).toBe(false);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ GLOBAL_ENABLED: false });

    const block = await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: true },
    });
    expect(block.isBlocked).toBe(true);

    const status = await send({
      type: 'GET_BLOCKING_STATUS',
      data: { hostname: 'example.com' },
    });
    expect(status.isBlocked).toBe(true);

    const unblock = await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: true },
    });
    expect(unblock.isBlocked).toBe(false);
  });

  it('resolves subframe requests to the top-level tab hostname', async () => {
    await flushPromises();

    await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: false },
    });

    const status = await send(
      { type: 'GET_BLOCKING_STATUS', data: { hostname: 'ads.cdn.com' } },
      { frameId: 2, tab: { url: 'https://example.com/page' } }
    );

    expect(status.isBlocked).toBe(false);
  });

  it('increments blocked count only for existing tracked sites and notifies source tab', async () => {
    await flushPromises();

    await send({ type: 'SET_GLOBAL_BLOCKING', data: { enabled: false } });
    await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: false },
    });

    const increment = await send(
      { type: 'INCREMENT_BLOCKED_COUNT', data: { hostname: 'example.com' } },
      { tab: { id: 22 } }
    );
    expect(increment.blockedCount).toBe(1);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UPDATE_BLOCKING_STATUS' }),
      expect.any(Function)
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ type: 'POPUP_BLOCKED', data: { blockedCount: 1 } }),
      expect.any(Function)
    );

    const missing = await send({ type: 'INCREMENT_BLOCKED_COUNT', data: { hostname: 'missing.com' } });
    expect(missing.blockedCount).toBe(0);
  });

  it('handles explicit unblock and invalid payloads', async () => {
    await flushPromises();

    await send({ type: 'SET_GLOBAL_BLOCKING', data: { enabled: false } });
    await send({
      type: 'TOGGLE_BLOCKING',
      data: { hostname: 'example.com', isIncognito: false },
    });

    const success = await send({ type: 'UNBLOCK_SITE', data: { hostname: 'example.com' } });
    expect(success).toEqual({ success: true });

    const fail = await send({ type: 'UNBLOCK_SITE', data: { hostname: 'missing.com' } });
    expect(fail).toEqual({ success: false });

    const invalid = await send({ type: 'TOGGLE_BLOCKING', data: { hostname: 123 } });
    expect(invalid.success).toBe(false);
  });

  it('syncs storage cache and blocks nav-target tabs for blocked sites', async () => {
    await flushPromises();

    const onStorageChanged = getListeners().storageChanged[0];
    onStorageChanged(
      {
        BLOCKED_SITES: {
          oldValue: [],
          newValue: [{ hostname: 'synced.com', isBlocked: true, blockedCount: 2, isMasked: false }],
        },
        GLOBAL_ENABLED: { oldValue: true, newValue: false },
      },
      'local'
    );

    let status = await send({ type: 'GET_BLOCKING_STATUS', data: { hostname: 'synced.com' } });
    expect(status.isBlocked).toBe(true);
    expect(status.blockedCount).toBe(2);

    onStorageChanged({ GLOBAL_ENABLED: { oldValue: false, newValue: true } }, 'local');
    status = await send({ type: 'GET_BLOCKING_STATUS', data: { hostname: 'synced.com' } });
    expect(status.isBlocked).toBe(true);

    chrome.tabs.get.mockImplementation((tabId, callback) => {
      if (tabId === 11) callback({ url: 'https://synced.com/article', incognito: false });
    });

    onNavigationTarget({ sourceTabId: 11, tabId: 99 });

    expect(chrome.tabs.remove).toHaveBeenCalledWith(99);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ type: 'POPUP_BLOCKED' }),
      expect.any(Function)
    );
  });
});
