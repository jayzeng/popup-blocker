import { MessageType, MessagePayload } from '../types';

console.log('Content script loaded');

let isBlocked = false;

function injectScript(file: string) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.onload = function() {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error injecting script:', error.message);
    } else {
      console.error('Unknown error injecting script');
    }
  }
}

function blockPopups() {
  injectScript('block_popups.js');

  document.addEventListener('click', handleClick, true);
  document.addEventListener('submit', handleSubmit, true);
}

function unblockPopups() {
  injectScript('unblock_popups.js'); // Create this file to restore window.open

  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('submit', handleSubmit, true);
}

function handleClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === 'A' && (
    target.getAttribute('target') === '_blank' || 
    target.getAttribute('href')?.startsWith('http://') ||
    target.getAttribute('href')?.startsWith('https://')
  )) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Blocked click:', target);
    incrementBlockedCount();
  }
}

function handleSubmit(e: SubmitEvent) {
  const form = e.target as HTMLFormElement;
  if (form.getAttribute('target') === '_blank') {
    e.preventDefault();
    e.stopPropagation();
    incrementBlockedCount();
  }
}

function incrementBlockedCount() {
  chrome.runtime.sendMessage({
    type: MessageType.INCREMENT_BLOCKED_COUNT,
    data: { hostname: window.location.hostname }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error sending INCREMENT_BLOCKED_COUNT message:', chrome.runtime.lastError);
    }
  });
}

window.addEventListener('message', (event) => {
  if (event.source === window && event.data && event.data.type === 'BLOCKED_POPUP') {
    console.log('Received blocked popup message:', event.data);
    incrementBlockedCount();
  }
});

chrome.runtime.onMessage.addListener((message: MessagePayload, sender, sendResponse) => {
  console.log('Message received in content script:', message);
  try {
    if (message.type === MessageType.UPDATE_BLOCKING_STATUS) {
      isBlocked = (message.data as { isBlocked: boolean }).isBlocked;
      if (isBlocked) {
        blockPopups();
      } else {
        unblockPopups();
      }
    }
    sendResponse({ success: true });
  } catch (error: unknown) {
    console.error('Error handling message:', error instanceof Error ? error.message : 'Unknown error');
    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

function checkInitialBlockingStatus() {
  chrome.runtime.sendMessage<MessagePayload>({
    type: MessageType.GET_BLOCKING_STATUS,
    data: { hostname: window.location.hostname }
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting initial blocking status:', chrome.runtime.lastError);
      return;
    }
    if (response && typeof response.isBlocked === 'boolean') {
      isBlocked = response.isBlocked;
      if (isBlocked) {
        blockPopups();
      }
    } else {
      console.error('Invalid response for initial blocking status:', response);
    }
  });
}

// Run the initial check
checkInitialBlockingStatus();
