function setupPopupDom() {
  document.body.innerHTML = `
    <div id="coverageStatus"></div>
    <span id="currentSite"></span>
    <span id="blockedCount"></span>
    <button id="toggleBlocking"></button>
    <button id="toggleGlobal"></button>
    <input id="showBlockedToast" type="checkbox" />
    <ul id="blockedSitesList"></ul>
    <h2 id="sitesListTitle"></h2>
    <p id="emptyState"></p>
    <ul id="whitelistSitesList"></ul>
    <p id="whitelistEmpty"></p>
    <input id="whitelistInput" />
    <button id="addWhitelistBtn"></button>
    <ul id="blacklistSitesList"></ul>
    <p id="blacklistEmpty"></p>
    <input id="blacklistInput" />
    <button id="addBlacklistBtn"></button>
  `;
}

describe('popup/popup.js', () => {
  const state = {
    status: { isBlocked: false, blockedCount: 0, globalBlockingEnabled: true },
    sites: [],
    showBlockedToast: false,
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    setupPopupDom();
    state.showBlockedToast = false;

    chrome.storage.local.get.mockImplementation((_keys, callback) => {
      callback({ SHOW_BLOCKED_TOAST: state.showBlockedToast });
    });
    chrome.storage.local.set.mockImplementation((updates) => {
      if (typeof updates.SHOW_BLOCKED_TOAST === 'boolean') {
        state.showBlockedToast = updates.SHOW_BLOCKED_TOAST;
      }
    });

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 10, url: 'https://example.com/path', windowId: 77 }]);
    });

    chrome.windows.get.mockImplementation((_id, callback) => callback({ incognito: false }));

    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_BLOCKING_STATUS') {
        callback?.({ ...state.status });
        return;
      }
      if (message.type === 'GET_BLOCKED_SITES') {
        callback?.([...state.sites]);
        return;
      }
      if (message.type === 'TOGGLE_BLOCKING') {
        state.status.isBlocked = !state.status.isBlocked;
        callback?.({
          isBlocked: state.status.isBlocked,
          blockedCount: state.status.blockedCount,
          blockedSites: [...state.sites],
          globalBlockingEnabled: state.status.globalBlockingEnabled,
        });
        return;
      }
      if (message.type === 'SET_GLOBAL_BLOCKING') {
        state.status.globalBlockingEnabled = message.data.enabled;
        callback?.({ globalBlockingEnabled: state.status.globalBlockingEnabled });
        return;
      }
      if (message.type === 'UNBLOCK_SITE') {
        state.sites = state.sites.filter((site) => site.hostname !== message.data.hostname);
        callback?.({ success: true });
        return;
      }
      if (message.type === 'ADD_TO_LIST') {
        const existing = state.sites.find((s) => s.hostname === message.data.hostname);
        if (existing) {
          existing.listType = message.data.listType;
          existing.isBlocked = message.data.listType === 'blacklist';
        } else {
          state.sites.push({ hostname: message.data.hostname, isBlocked: message.data.listType === 'blacklist', blockedCount: 0, isMasked: false, allowedUntil: null, listType: message.data.listType });
        }
        callback?.({ success: true });
      }
    });
  });

  it('defaults in-page block notifications to off and persists opt-in', () => {
    require('../popup/popup.js');

    const checkbox = document.getElementById('showBlockedToast');
    expect(checkbox.checked).toBe(false);

    checkbox.click();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ SHOW_BLOCKED_TOAST: true });
    expect(checkbox.checked).toBe(true);
  });

  it('renders current site and allowed exceptions when global blocking is enabled', () => {
    state.status = { isBlocked: false, blockedCount: 3, globalBlockingEnabled: true };
    state.sites = [
      { hostname: 'allowed.com', isBlocked: false, isMasked: false, allowedUntil: null, listType: null },
      { hostname: 'blocked.com', isBlocked: true, isMasked: false, allowedUntil: null, listType: null },
    ];

    require('../popup/popup.js');

    expect(document.getElementById('currentSite').textContent).toBe('example.com');
    expect(document.getElementById('blockedCount').textContent).toBe('3');
    expect(document.getElementById('sitesListTitle').textContent).toBe('Allowed Exceptions');
    expect(document.getElementById('blockedSitesList').children).toHaveLength(1);
  });

  it('toggles blocking state via the per-site button', () => {
    state.status = { isBlocked: true, blockedCount: 2, globalBlockingEnabled: true };
    state.sites = [];

    require('../popup/popup.js');

    document.getElementById('toggleBlocking').click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TOGGLE_BLOCKING',
        data: expect.objectContaining({ hostname: 'example.com', isIncognito: false }),
      }),
      expect.any(Function)
    );
    expect(document.getElementById('coverageStatus').textContent).toContain('allowed');
  });

  it('switches to blocked-sites view when global mode is toggled off', () => {
    state.status = { isBlocked: false, blockedCount: 0, globalBlockingEnabled: true };
    state.sites = [{ hostname: 'onlyblocked.com', isBlocked: true, isMasked: false, allowedUntil: null, listType: null }];

    require('../popup/popup.js');

    state.status.isBlocked = true;
    document.getElementById('toggleGlobal').click();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_GLOBAL_BLOCKING', data: { enabled: false } }),
      expect.any(Function)
    );
    expect(document.getElementById('sitesListTitle').textContent).toBe('Blocked Sites');
    expect(document.getElementById('blockedSitesList').children).toHaveLength(1);
  });

  it('supports unmasking and removing masked exceptions', () => {
    state.status = { isBlocked: false, blockedCount: 0, globalBlockingEnabled: true };
    state.sites = [{ hostname: 'secret.com', isBlocked: false, isMasked: true, allowedUntil: null, listType: null }];

    require('../popup/popup.js');

    const list = document.getElementById('blockedSitesList');
    expect(list.children).toHaveLength(1);
    expect(list.textContent).toContain('******.***');

    const buttons = list.querySelectorAll('button');
    buttons[0].click();
    expect(list.textContent).toContain('secret.com');

    buttons[1].click();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'UNBLOCK_SITE', data: { hostname: 'secret.com' } }),
      expect.any(Function)
    );
    expect(list.children).toHaveLength(0);
  });
});
