const STORAGE_KEY_BLOCKED_SITES = 'BLOCKED_SITES';

let blockedSites = [];
let storageReady = false;
const storageReadyQueue = [];

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

function sanitizeBlockedSites(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((site) => site && typeof site.hostname === 'string')
    .map((site) => ({
      hostname: normalizeHostname(site.hostname),
      isBlocked: site.isBlocked !== false,
      blockedCount:
        typeof site.blockedCount === 'number' && Number.isFinite(site.blockedCount) && site.blockedCount >= 0
          ? Math.floor(site.blockedCount)
          : 0,
      isMasked: site.isMasked === true,
    }))
    .filter((site) => site.hostname.length > 0);
}

function findBlockedSite(hostname) {
  const normalized = normalizeHostname(hostname);
  return blockedSites.find((site) => normalizeHostname(site.hostname) === normalized);
}

function saveBlockedSites() {
  chrome.storage.local.set({ [STORAGE_KEY_BLOCKED_SITES]: blockedSites });
}

function runWhenStorageReady(fn) {
  if (storageReady) {
    fn();
    return;
  }
  storageReadyQueue.push(fn);
}

function markStorageReady() {
  storageReady = true;
  while (storageReadyQueue.length) {
    const fn = storageReadyQueue.shift();
    if (typeof fn === 'function') fn();
  }
}

function initializeState() {
  chrome.storage.local.get([STORAGE_KEY_BLOCKED_SITES], (result) => {
    blockedSites = sanitizeBlockedSites(result[STORAGE_KEY_BLOCKED_SITES]);
    markStorageReady();
  });
}

function sendActiveTabStatusUpdate(payload) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTabId = tabs[0] && tabs[0].id;
    if (activeTabId === undefined) return;
    chrome.tabs.sendMessage(activeTabId, {
      type: 'UPDATE_BLOCKING_STATUS',
      data: payload,
    });
  });
}

function resolveHostname(hostname, sender) {
  if (sender && sender.frameId > 0 && sender.tab && sender.tab.url) {
    try {
      return normalizeHostname(new URL(sender.tab.url).hostname);
    } catch (_) {
      return normalizeHostname(hostname);
    }
  }
  return normalizeHostname(hostname);
}

function isValidMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') return false;

  const data = message.data;
  switch (message.type) {
    case 'TOGGLE_BLOCKING':
      return data && typeof data.hostname === 'string' && typeof data.isIncognito === 'boolean';
    case 'GET_BLOCKING_STATUS':
      return data && typeof data.hostname === 'string';
    case 'INCREMENT_BLOCKED_COUNT':
      return data && typeof data.hostname === 'string';
    case 'UNBLOCK_SITE':
      return data && typeof data.hostname === 'string';
    case 'GET_BLOCKED_SITES':
      return true;
    default:
      return false;
  }
}

initializeState();
chrome.runtime.onInstalled.addListener(initializeState);
chrome.runtime.onStartup.addListener(initializeState);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY_BLOCKED_SITES]) return;
  blockedSites = sanitizeBlockedSites(changes[STORAGE_KEY_BLOCKED_SITES].newValue);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runWhenStorageReady(() => {
    if (!isValidMessage(message)) {
      sendResponse({ success: false, error: 'Invalid message payload' });
      return;
    }

    if (message.type === 'TOGGLE_BLOCKING') {
      const hostname = normalizeHostname(message.data.hostname);
      const existing = findBlockedSite(hostname);

      if (!existing) {
        const site = {
          hostname,
          isBlocked: true,
          blockedCount: 0,
          isMasked: message.data.isIncognito,
        };
        blockedSites.push(site);
        saveBlockedSites();
        sendActiveTabStatusUpdate({ isBlocked: true, blockedCount: 0 });
        sendResponse({ isBlocked: true, blockedCount: 0, blockedSites });
        return;
      }

      blockedSites = blockedSites.filter((site) => normalizeHostname(site.hostname) !== hostname);
      saveBlockedSites();
      sendActiveTabStatusUpdate({ isBlocked: false, blockedCount: existing.blockedCount });
      sendResponse({ isBlocked: false, blockedCount: existing.blockedCount, blockedSites });
      return;
    }

    if (message.type === 'GET_BLOCKING_STATUS') {
      const hostname = resolveHostname(message.data.hostname, sender);
      const site = findBlockedSite(hostname);
      sendResponse({
        isBlocked: site ? site.isBlocked : false,
        blockedCount: site ? site.blockedCount : 0,
      });
      return;
    }

    if (message.type === 'INCREMENT_BLOCKED_COUNT') {
      const hostname = resolveHostname(message.data.hostname, sender);
      const site = findBlockedSite(hostname);
      if (!site) {
        sendResponse({ blockedCount: 0 });
        return;
      }

      site.blockedCount += 1;
      saveBlockedSites();
      chrome.runtime.sendMessage({
        type: 'UPDATE_BLOCKING_STATUS',
        data: { isBlocked: true, blockedCount: site.blockedCount },
      });
      sendResponse({ blockedCount: site.blockedCount });
      return;
    }

    if (message.type === 'GET_BLOCKED_SITES') {
      sendResponse(blockedSites);
      return;
    }

    if (message.type === 'UNBLOCK_SITE') {
      const hostname = normalizeHostname(message.data.hostname);
      const existing = findBlockedSite(hostname);
      if (!existing) {
        sendResponse({ success: false });
        return;
      }

      blockedSites = blockedSites.filter((site) => normalizeHostname(site.hostname) !== hostname);
      saveBlockedSites();
      sendResponse({ success: true });
    }
  });

  return true;
});

chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  chrome.tabs.get(details.sourceTabId, (sourceTab) => {
    if (!sourceTab || !sourceTab.url) return;

    try {
      const sourceHostname = normalizeHostname(new URL(sourceTab.url).hostname);
      const site = findBlockedSite(sourceHostname);
      if (!site || !site.isBlocked) return;

      chrome.tabs.remove(details.tabId);
      site.blockedCount += 1;
      saveBlockedSites();
      chrome.runtime.sendMessage({
        type: 'UPDATE_BLOCKING_STATUS',
        data: { isBlocked: true, blockedCount: site.blockedCount },
      });
    } catch (_) {
      // Ignore invalid URLs (chrome:// etc.)
    }
  });
});

chrome.windows.onCreated.addListener((win) => {
  if (!win || win.type !== 'popup' || !win.id) return;

  chrome.tabs.query({ windowId: win.id }, (tabs) => {
    const popupTab = tabs && tabs[0];
    if (!popupTab || !popupTab.openerTabId) return;

    chrome.tabs.get(popupTab.openerTabId, (openerTab) => {
      if (chrome.runtime.lastError || !openerTab || !openerTab.url) return;

      try {
        const sourceHostname = normalizeHostname(new URL(openerTab.url).hostname);
        const site = findBlockedSite(sourceHostname);
        if (!site || !site.isBlocked) return;

        chrome.windows.remove(win.id);
        site.blockedCount += 1;
        saveBlockedSites();
        chrome.runtime.sendMessage({
          type: 'UPDATE_BLOCKING_STATUS',
          data: { isBlocked: true, blockedCount: site.blockedCount },
        });
      } catch (_) {
        // Ignore invalid URLs.
      }
    });
  });
});
