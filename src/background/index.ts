import {
  BackgroundRequest,
  BlockedSite,
  DEFAULT_EXTENSION_STATE,
  ErrorResponse,
  ExtensionState,
  GetBlockingStatusResponse,
  IncrementBlockedCountResponse,
  MessageType,
  StorageKeys,
  ToggleBlockingResponse,
  UnblockSiteResponse,
  UpdateBlockingStatusMessage,
} from '../types';
import { isBackgroundRequest } from '../shared/message-validation';
import { findBlockedSite, normalizeHostname, sanitizeBlockedSites } from '../shared/site-utils';

let state: ExtensionState = { ...DEFAULT_EXTENSION_STATE, blockedSites: [] };

let resolveStorageReady: (() => void) | undefined;
const storageReady = new Promise<void>((resolve) => {
  resolveStorageReady = resolve;
});

function saveBlockedSites(): void {
  chrome.storage.local.set({ [StorageKeys.BLOCKED_SITES]: state.blockedSites });
}

function sendActiveTabStatusUpdate(update: UpdateBlockingStatusMessage): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTabId = tabs[0]?.id;
    if (activeTabId === undefined) {
      return;
    }
    chrome.tabs.sendMessage(activeTabId, update);
  });
}

function hydrateStateFromStorage(result: Record<string, unknown>): void {
  state = {
    blockedSites: sanitizeBlockedSites(result[StorageKeys.BLOCKED_SITES]),
  };
}

function resolveHostname(hostname: string, sender: chrome.runtime.MessageSender): string {
  if (sender.frameId !== undefined && sender.frameId > 0 && sender.tab?.url) {
    try {
      return normalizeHostname(new URL(sender.tab.url).hostname);
    } catch {
      return normalizeHostname(hostname);
    }
  }

  return normalizeHostname(hostname);
}

function getBlockingStatus(hostname: string): GetBlockingStatusResponse {
  const site = findBlockedSite(state.blockedSites, hostname);
  return {
    isBlocked: site?.isBlocked ?? false,
    blockedCount: site?.blockedCount ?? 0,
  };
}

function handleToggleBlocking(hostname: string, isIncognito: boolean): ToggleBlockingResponse {
  const normalizedHostname = normalizeHostname(hostname);
  const existing = findBlockedSite(state.blockedSites, normalizedHostname);

  if (!existing) {
    const site: BlockedSite = {
      hostname: normalizedHostname,
      isBlocked: true,
      blockedCount: 0,
      isMasked: isIncognito,
    };
    state.blockedSites.push(site);
    saveBlockedSites();
    sendActiveTabStatusUpdate({
      type: MessageType.UPDATE_BLOCKING_STATUS,
      data: { isBlocked: true, blockedCount: site.blockedCount },
    });
    return {
      isBlocked: true,
      blockedCount: 0,
      blockedSites: state.blockedSites,
    };
  }

  state.blockedSites = state.blockedSites.filter((site) => normalizeHostname(site.hostname) !== normalizedHostname);
  saveBlockedSites();
  sendActiveTabStatusUpdate({
    type: MessageType.UPDATE_BLOCKING_STATUS,
    data: { isBlocked: false, blockedCount: existing.blockedCount },
  });

  return {
    isBlocked: false,
    blockedCount: existing.blockedCount,
    blockedSites: state.blockedSites,
  };
}

function handleIncrementBlockedCount(hostname: string): IncrementBlockedCountResponse {
  const site = findBlockedSite(state.blockedSites, hostname);

  if (!site) {
    return { blockedCount: 0 };
  }

  site.blockedCount += 1;
  saveBlockedSites();
  chrome.runtime.sendMessage({
    type: MessageType.UPDATE_BLOCKING_STATUS,
    data: { isBlocked: true, blockedCount: site.blockedCount },
  } as UpdateBlockingStatusMessage);

  return { blockedCount: site.blockedCount };
}

function handleUnblockSite(hostname: string): UnblockSiteResponse {
  const normalizedHostname = normalizeHostname(hostname);
  const hasSite = state.blockedSites.some((site) => normalizeHostname(site.hostname) === normalizedHostname);

  if (!hasSite) {
    return { success: false };
  }

  state.blockedSites = state.blockedSites.filter((site) => normalizeHostname(site.hostname) !== normalizedHostname);
  saveBlockedSites();

  return { success: true };
}

function initializeState(): void {
  chrome.storage.local.get([StorageKeys.BLOCKED_SITES], (result) => {
    hydrateStateFromStorage(result);
    resolveStorageReady?.();
  });
}

chrome.runtime.onInstalled.addListener(() => {
  initializeState();
});

chrome.runtime.onStartup.addListener(() => {
  initializeState();
});

initializeState();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  const blockedSitesChange = changes[StorageKeys.BLOCKED_SITES];
  if (!blockedSitesChange) {
    return;
  }

  state.blockedSites = sanitizeBlockedSites(blockedSitesChange.newValue);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  storageReady.then(() => {
    if (!isBackgroundRequest(message)) {
      const response: ErrorResponse = { success: false, error: 'Invalid message payload' };
      sendResponse(response);
      return;
    }

    switch (message.type) {
      case MessageType.TOGGLE_BLOCKING: {
        const response = handleToggleBlocking(message.data.hostname, message.data.isIncognito);
        sendResponse(response);
        return;
      }
      case MessageType.GET_BLOCKING_STATUS: {
        const effectiveHostname = resolveHostname(message.data.hostname, sender);
        const response = getBlockingStatus(effectiveHostname);
        sendResponse(response);
        return;
      }
      case MessageType.INCREMENT_BLOCKED_COUNT: {
        const effectiveHostname = resolveHostname(message.data.hostname, sender);
        const response = handleIncrementBlockedCount(effectiveHostname);
        sendResponse(response);
        return;
      }
      case MessageType.GET_BLOCKED_SITES:
        sendResponse(state.blockedSites);
        return;
      case MessageType.UNBLOCK_SITE: {
        const response = handleUnblockSite(message.data.hostname);
        sendResponse(response);
        return;
      }
      default: {
        const neverMessage: never = message;
        const response: ErrorResponse = {
          success: false,
          error: `Unhandled message type: ${(neverMessage as BackgroundRequest).type}`,
        };
        sendResponse(response);
      }
    }
  });

  return true;
});

chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  chrome.tabs.get(details.sourceTabId, (sourceTab) => {
    if (!sourceTab?.url) {
      return;
    }

    try {
      const sourceHostname = normalizeHostname(new URL(sourceTab.url).hostname);
      const site = findBlockedSite(state.blockedSites, sourceHostname);
      if (!site?.isBlocked) {
        return;
      }

      chrome.tabs.remove(details.tabId);
      site.blockedCount += 1;
      saveBlockedSites();
      chrome.runtime.sendMessage({
        type: MessageType.UPDATE_BLOCKING_STATUS,
        data: { isBlocked: true, blockedCount: site.blockedCount },
      } as UpdateBlockingStatusMessage);
    } catch {
      // Ignore invalid URLs like chrome://
    }
  });
});

chrome.windows.onCreated.addListener((win) => {
  if (win.type !== 'popup' || !win.id) {
    return;
  }

  chrome.tabs.query({ windowId: win.id }, (tabs) => {
    const popupTab = tabs[0];
    if (!popupTab?.openerTabId) {
      return;
    }

    chrome.tabs.get(popupTab.openerTabId, (openerTab) => {
      if (chrome.runtime.lastError || !openerTab?.url) {
        return;
      }

      try {
        const sourceHostname = normalizeHostname(new URL(openerTab.url).hostname);
        const site = findBlockedSite(state.blockedSites, sourceHostname);

        if (!site?.isBlocked || !win.id) {
          return;
        }

        chrome.windows.remove(win.id);
        site.blockedCount += 1;
        saveBlockedSites();
        chrome.runtime.sendMessage({
          type: MessageType.UPDATE_BLOCKING_STATUS,
          data: { isBlocked: true, blockedCount: site.blockedCount },
        } as UpdateBlockingStatusMessage);
      } catch {
        // Ignore invalid URLs like chrome://
      }
    });
  });
});

export const __testing = {
  hydrateStateFromStorage,
  getBlockingStatus,
};
