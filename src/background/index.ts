import { MessageType, MessagePayload, BlockedSite } from '../types';
import { StorageKeys } from '../types';

const blockedSites: BlockedSite[] = [];

chrome.runtime.onInstalled.addListener(() => {
  console.log('Yet Another Popup Blocker extension installed');
});

chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
  if (message.type === MessageType.TOGGLE_BLOCKING) {
    const { hostname, isIncognito } = message.data as { hostname: string; isIncognito: boolean };
    let site = blockedSites.find(site => site.hostname === hostname);
    
    if (!site) {
      site = { 
        hostname, 
        isBlocked: true, 
        blockedCount: 0, 
        isMasked: isIncognito // Set isMasked based on isIncognito
      };
      blockedSites.push(site);
    } else {
      site.isBlocked = !site.isBlocked;
      if (!site.isBlocked) {
        // Remove the site from the list if it's unblocked
        const index = blockedSites.findIndex(s => s.hostname === hostname);
        if (index !== -1) {
          blockedSites.splice(index, 1);
        }
      }
    }
    
    // Send message to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: MessageType.UPDATE_BLOCKING_STATUS,
          data: { isBlocked: site!.isBlocked } // Add non-null assertion operator here
        });
      }
    });
    
    saveBlockedSites();
    sendResponse({ 
      isBlocked: site.isBlocked, 
      blockedCount: site.blockedCount,
      blockedSites: blockedSites // Send the updated list of blocked sites
    });
  } else if (message.type === MessageType.GET_BLOCKING_STATUS) {
    const { hostname } = message.data as { hostname: string };
    const site = blockedSites.find(site => site.hostname === hostname);
    sendResponse({ 
      isBlocked: site?.isBlocked || false, 
      blockedCount: site?.blockedCount || 0
    });
  } else if (message.type === MessageType.INCREMENT_BLOCKED_COUNT) {
    const { hostname } = message.data as { hostname: string };
    const site = blockedSites.find(site => site.hostname === hostname);
    if (site) {
      site.blockedCount++;
      // Notify the popup if it's open
      chrome.runtime.sendMessage({
        type: MessageType.UPDATE_BLOCKING_STATUS,
        data: { isBlocked: true, blockedCount: site.blockedCount }
      });
      sendResponse({ blockedCount: site.blockedCount });
    } else {
      sendResponse({ blockedCount: 0 });
    }
  } else if (message.type === MessageType.GET_BLOCKED_SITES) {
    sendResponse(blockedSites);
  } else if (message.type === MessageType.UNBLOCK_SITE) {
    const { hostname } = message.data as { hostname: string };
    const index = blockedSites.findIndex(site => site.hostname === hostname);
    if (index !== -1) {
      blockedSites.splice(index, 1);
      saveBlockedSites();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }
  return true; // Indicates that the response is sent asynchronously
});

// Function to save blocked sites to storage
const saveBlockedSites = () => {
  chrome.storage.local.set({ [StorageKeys.BLOCKED_SITES]: blockedSites });
};

// Load blocked sites from storage on startup
chrome.storage.local.get([StorageKeys.BLOCKED_SITES], (result) => {
  if (result[StorageKeys.BLOCKED_SITES]) {
    blockedSites.push(...result[StorageKeys.BLOCKED_SITES]);
  }
});

// Listen for new tab or window creation
chrome.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  chrome.tabs.get(details.sourceTabId, (sourceTab) => {
    if (sourceTab && sourceTab.url) {
      const sourceUrl = new URL(sourceTab.url);
      const site = blockedSites.find(site => site.hostname === sourceUrl.hostname);
      if (site?.isBlocked) {
        chrome.tabs.remove(details.tabId);
        site.blockedCount++;
        // Notify the popup if it's open
        chrome.runtime.sendMessage({
          type: MessageType.UPDATE_BLOCKING_STATUS,
          data: { isBlocked: true, blockedCount: site.blockedCount }
        });
      }
    }
  });
});

// Listen for window creation (for popup windows)
chrome.windows.onCreated.addListener((window) => {
  if (window.type === 'popup') {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url);
        const site = blockedSites.find(site => site.hostname === url.hostname);
        if (site?.isBlocked && window.id) {
          chrome.windows.remove(window.id);
          site.blockedCount++;
          // Notify the popup if it's open
          chrome.runtime.sendMessage({
            type: MessageType.UPDATE_BLOCKING_STATUS,
            data: { isBlocked: true, blockedCount: site.blockedCount }
          });
        }
      }
    });
  }
});
