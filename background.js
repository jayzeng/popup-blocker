const STORAGE_KEY_BLOCKED_SITES = 'BLOCKED_SITES';
const STORAGE_KEY_GLOBAL_ENABLED = 'GLOBAL_ENABLED';

let blockedSites = [];
let globalBlockingEnabled = true;
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
      allowedUntil: typeof site.allowedUntil === 'number' ? site.allowedUntil : null,
    }))
    .filter((site) => site.hostname.length > 0);
}

function findBlockedSite(hostname) {
  const normalized = normalizeHostname(hostname);
  return blockedSites.find((site) => normalizeHostname(site.hostname) === normalized);
}

function shouldBlock(hostname) {
  const site = findBlockedSite(hostname);
  if (globalBlockingEnabled) {
    if (!site || site.isBlocked !== false) return true;
    // Temporary exception: check if it has expired
    if (site.allowedUntil !== null && Date.now() > site.allowedUntil) return true;
    return false;
  } else {
    if (!site || !site.isBlocked) return false;
    return true;
  }
}

function cleanExpiredExceptions() {
  const now = Date.now();
  const before = blockedSites.length;
  blockedSites = blockedSites.filter(
    (site) => !(site.isBlocked === false && site.allowedUntil !== null && now > site.allowedUntil)
  );
  if (blockedSites.length !== before) saveBlockedSites();
}

function saveBlockedSites() {
  chrome.storage.local.set({ [STORAGE_KEY_BLOCKED_SITES]: blockedSites });
}

function saveGlobalEnabled() {
  chrome.storage.local.set({ [STORAGE_KEY_GLOBAL_ENABLED]: globalBlockingEnabled });
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
  chrome.storage.local.get([STORAGE_KEY_BLOCKED_SITES, STORAGE_KEY_GLOBAL_ENABLED], (result) => {
    blockedSites = sanitizeBlockedSites(result[STORAGE_KEY_BLOCKED_SITES]);
    globalBlockingEnabled = result[STORAGE_KEY_GLOBAL_ENABLED] !== false;
    cleanExpiredExceptions();
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
    }, () => { chrome.runtime.lastError; });
  });
}

function notifyTabPopupBlocked(tabId, blockedCount) {
  if (tabId === undefined || tabId === null) return;
  chrome.tabs.sendMessage(tabId, {
    type: 'POPUP_BLOCKED',
    data: { blockedCount },
  }, () => { chrome.runtime.lastError; });
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
      return (
        data &&
        typeof data.hostname === 'string' &&
        typeof data.isIncognito === 'boolean' &&
        (data.allowedUntil === undefined || data.allowedUntil === null || typeof data.allowedUntil === 'number')
      );
    case 'GET_BLOCKING_STATUS':
      return data && typeof data.hostname === 'string';
    case 'INCREMENT_BLOCKED_COUNT':
      return data && typeof data.hostname === 'string';
    case 'UNBLOCK_SITE':
      return data && typeof data.hostname === 'string';
    case 'GET_BLOCKED_SITES':
      return true;
    case 'SET_GLOBAL_BLOCKING':
      return data && typeof data.enabled === 'boolean';
    default:
      return false;
  }
}

function ensureSiteEntry(hostname, isMasked) {
  let site = findBlockedSite(hostname);
  if (!site) {
    site = { hostname, isBlocked: true, blockedCount: 0, isMasked: !!isMasked, allowedUntil: null };
    blockedSites.push(site);
  }
  return site;
}

initializeState();

// Clean expired exceptions once per minute while the worker is alive
setInterval(cleanExpiredExceptions, 60 * 1000);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get([STORAGE_KEY_GLOBAL_ENABLED], (result) => {
      if (result[STORAGE_KEY_GLOBAL_ENABLED] === undefined) {
        chrome.storage.local.set({ [STORAGE_KEY_GLOBAL_ENABLED]: true });
      }
    });
  }
  initializeState();
});

chrome.runtime.onStartup.addListener(initializeState);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEY_BLOCKED_SITES]) {
    blockedSites = sanitizeBlockedSites(changes[STORAGE_KEY_BLOCKED_SITES].newValue);
  }
  if (changes[STORAGE_KEY_GLOBAL_ENABLED]) {
    globalBlockingEnabled = changes[STORAGE_KEY_GLOBAL_ENABLED].newValue !== false;
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runWhenStorageReady(() => {
    if (!isValidMessage(message)) {
      sendResponse({ success: false, error: 'Invalid message payload' });
      return;
    }

    if (message.type === 'SET_GLOBAL_BLOCKING') {
      globalBlockingEnabled = message.data.enabled;
      saveGlobalEnabled();
      sendActiveTabStatusUpdate({ isBlocked: shouldBlock(''), globalBlockingEnabled });
      sendResponse({ globalBlockingEnabled });
      return;
    }

    if (message.type === 'TOGGLE_BLOCKING') {
      const hostname = normalizeHostname(message.data.hostname);
      const allowedUntil = message.data.allowedUntil !== undefined ? message.data.allowedUntil : null;
      const existing = findBlockedSite(hostname);

      if (globalBlockingEnabled) {
        if (!existing || existing.isBlocked !== false || (existing.allowedUntil !== null && Date.now() > existing.allowedUntil)) {
          // Add/update exception: allow this site
          if (!existing) {
            blockedSites.push({ hostname, isBlocked: false, blockedCount: 0, isMasked: message.data.isIncognito, allowedUntil });
          } else {
            existing.isBlocked = false;
            existing.allowedUntil = allowedUntil;
          }
          saveBlockedSites();
          const count = existing ? existing.blockedCount : 0;
          sendActiveTabStatusUpdate({ isBlocked: false, blockedCount: count, globalBlockingEnabled });
          sendResponse({ isBlocked: false, blockedCount: count, blockedSites, globalBlockingEnabled });
        } else {
          // Remove exception: revert to global default (blocked)
          blockedSites = blockedSites.filter((site) => normalizeHostname(site.hostname) !== hostname);
          saveBlockedSites();
          sendActiveTabStatusUpdate({ isBlocked: true, blockedCount: 0, globalBlockingEnabled });
          sendResponse({ isBlocked: true, blockedCount: 0, blockedSites, globalBlockingEnabled });
        }
        return;
      }

      // Global OFF: original opt-in per-site behavior
      if (!existing) {
        blockedSites.push({ hostname, isBlocked: true, blockedCount: 0, isMasked: message.data.isIncognito, allowedUntil: null });
        saveBlockedSites();
        sendActiveTabStatusUpdate({ isBlocked: true, blockedCount: 0, globalBlockingEnabled });
        sendResponse({ isBlocked: true, blockedCount: 0, blockedSites, globalBlockingEnabled });
        return;
      }

      blockedSites = blockedSites.filter((site) => normalizeHostname(site.hostname) !== hostname);
      saveBlockedSites();
      sendActiveTabStatusUpdate({ isBlocked: false, blockedCount: existing.blockedCount, globalBlockingEnabled });
      sendResponse({ isBlocked: false, blockedCount: existing.blockedCount, blockedSites, globalBlockingEnabled });
      return;
    }

    if (message.type === 'GET_BLOCKING_STATUS') {
      const hostname = resolveHostname(message.data.hostname, sender);
      const site = findBlockedSite(hostname);
      const isBlocked = hostname ? shouldBlock(hostname) : globalBlockingEnabled;
      sendResponse({
        isBlocked,
        blockedCount: site ? site.blockedCount : 0,
        globalBlockingEnabled,
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
        data: { isBlocked: true, blockedCount: site.blockedCount, globalBlockingEnabled },
      }, () => { chrome.runtime.lastError; });
      // Send confirmed count back to the source tab
      if (sender.tab && sender.tab.id !== undefined) {
        notifyTabPopupBlocked(sender.tab.id, site.blockedCount);
      }
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
      if (!shouldBlock(sourceHostname)) return;

      chrome.tabs.remove(details.tabId);

      const site = ensureSiteEntry(sourceHostname, sourceTab.incognito);
      site.blockedCount += 1;
      saveBlockedSites();
      chrome.runtime.sendMessage({
        type: 'UPDATE_BLOCKING_STATUS',
        data: { isBlocked: true, blockedCount: site.blockedCount, globalBlockingEnabled },
      }, () => { chrome.runtime.lastError; });
      notifyTabPopupBlocked(details.sourceTabId, site.blockedCount);
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
        if (!shouldBlock(sourceHostname)) return;

        chrome.windows.remove(win.id);

        const site = ensureSiteEntry(sourceHostname, openerTab.incognito);
        site.blockedCount += 1;
        saveBlockedSites();
        chrome.runtime.sendMessage({
          type: 'UPDATE_BLOCKING_STATUS',
          data: { isBlocked: true, blockedCount: site.blockedCount, globalBlockingEnabled },
        }, () => { chrome.runtime.lastError; });
        notifyTabPopupBlocked(popupTab.openerTabId, site.blockedCount);
      } catch (_) {
        // Ignore invalid URLs.
      }
    });
  });
});
