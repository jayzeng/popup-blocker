import { MessageType, MessagePayload } from '../types';

console.log('Content script loaded');

let isBlocked = false;
let originalWindowOpen: typeof window.open | null = null;

const blockPopups = () => {
  // Store the original window.open function
  originalWindowOpen = window.open;

  // Override window.open
  window.open = function(...args) {
    console.log('Blocked window.open:', args);
    chrome.runtime.sendMessage({
      type: MessageType.INCREMENT_BLOCKED_COUNT,
      data: { hostname: window.location.hostname }
    });
    return null;
  };

  // Block clicks that might open new windows
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && (
      target.getAttribute('target') === '_blank' || 
      target.getAttribute('href')?.startsWith('http://') ||
      target.getAttribute('href')?.startsWith('https://')
    )) {
      e.preventDefault();
      e.stopPropagation();
      console.log('Blocked click:', target);
      chrome.runtime.sendMessage({
        type: MessageType.INCREMENT_BLOCKED_COUNT,
        data: { hostname: window.location.hostname }
      });
    }
  }, true);

  // Block form submissions that might open new windows
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (form.getAttribute('target') === '_blank') {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({
        type: MessageType.INCREMENT_BLOCKED_COUNT,
        data: { hostname: window.location.hostname }
      });
    }
  }, true);
};

// Add this new function to inject a script into the page
function injectScript(func: () => void) {
  const script = document.createElement('script');
  script.textContent = `(${func.toString()})();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

// Inject a script to override window.open in the page context
injectScript(() => {
  const originalWindowOpen = window.open;
  window.open = function(...args) {
    console.log('Intercepted window.open:', args);
    window.postMessage({ type: 'BLOCKED_POPUP', args }, '*');
    return null;
  };
});

// Listen for blocked popup messages from the injected script
window.addEventListener('message', (event) => {
  if (event.source === window && event.data && event.data.type === 'BLOCKED_POPUP') {
    console.log('Received blocked popup message:', event.data);
    chrome.runtime.sendMessage({
      type: MessageType.INCREMENT_BLOCKED_COUNT,
      data: { hostname: window.location.hostname }
    });
  }
});

chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
  console.log('Message received in content script:', message);
  if (message.type === MessageType.UPDATE_BLOCKING_STATUS) {
    isBlocked = (message.data as { isBlocked: boolean }).isBlocked;
    if (isBlocked) {
      blockPopups();
    } else if (originalWindowOpen) {
      // Restore original window.open function
      window.open = originalWindowOpen;
      // Reload the page to remove event listeners
      window.location.reload();
    }
  }
});

// Check initial blocking status
chrome.runtime.sendMessage<MessagePayload>({
  type: MessageType.GET_BLOCKING_STATUS,
  data: { hostname: window.location.hostname }
}, (response) => {
  isBlocked = response.isBlocked;
  if (isBlocked) {
    blockPopups();
  }
});
