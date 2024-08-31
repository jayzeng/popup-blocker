import { MessageType, MessagePayload, BlockedSite } from '../types';

const blockedSites: BlockedSite[] = [];
const coveredSites: string[] = []; // Add this line to store covered sites

chrome.runtime.onInstalled.addListener(() => {
  console.log('Popup blocker extension installed');
  // Replace this with your actual list of covered sites
  updateCoveredSites(['example.com', 'google.com', 'github.com']);
});

chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
  if (message.type === MessageType.TOGGLE_BLOCKING) {
    const { hostname } = message.data as { hostname: string };
    let site = blockedSites.find(site => site.hostname === hostname);
    
    if (!site) {
      site = { hostname, isBlocked: true, blockedCount: 0 };
      blockedSites.push(site);
    } else {
      site.isBlocked = !site.isBlocked;
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
    
    sendResponse({ isBlocked: site.isBlocked, blockedCount: site.blockedCount });
  } else if (message.type === MessageType.GET_BLOCKING_STATUS) {
    const { hostname } = message.data as { hostname: string };
    const site = blockedSites.find(site => site.hostname === hostname);
    const isCovered = coveredSites.includes(hostname);
    sendResponse({ 
      isBlocked: site?.isBlocked || false, 
      blockedCount: site?.blockedCount || 0,
      isCovered // Add this line
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
  } else if (message.type === MessageType.CHECK_COVERAGE) { // Add this block
    const { hostname } = message.data as { hostname: string };
    const isCovered = coveredSites.includes(hostname);
    sendResponse({ isCovered });
  }
  return true; // Indicates that the response is sent asynchronously
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

// Add this function to update covered sites (you'll need to call this periodically or when your coverage list changes)
function updateCoveredSites(sites: string[]) {
  coveredSites.length = 0; // Clear the array
  coveredSites.push(...sites);
}
