import { GetBlockingStatusResponse, MessageType } from '../types';
import { isUpdateBlockingStatusMessage } from '../shared/message-validation';

let isBlocked = false;
let interceptionEnabled = false;

function injectScript(file: string): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.onload = function onLoad() {
      script.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('Error injecting script:', error.message);
    }
  }
}

function blockPopups(): void {
  if (interceptionEnabled) {
    return;
  }

  injectScript('block_popups.js');
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('auxclick', handleAuxClick, true);
  document.addEventListener('submit', handleSubmit, true);
  interceptionEnabled = true;
}

function unblockPopups(): void {
  if (!interceptionEnabled) {
    return;
  }

  injectScript('unblock_popups.js');
  document.removeEventListener('mousedown', handleMouseDown, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('auxclick', handleAuxClick, true);
  document.removeEventListener('submit', handleSubmit, true);
  interceptionEnabled = false;
}

function findBlankAnchor(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest('a[target="_blank"]');
}

function handleMouseDown(event: MouseEvent): void {
  if (findBlankAnchor(event.target)) {
    event.stopPropagation();
  }
}

function handleClick(event: MouseEvent): void {
  const anchor = findBlankAnchor(event.target);
  if (anchor) {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function handleAuxClick(event: MouseEvent): void {
  if (event.button !== 1) {
    return;
  }

  const anchor = findBlankAnchor(event.target);
  if (anchor) {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function handleSubmit(event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;
  if (form.getAttribute('target') === '_blank') {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function incrementBlockedCount(): void {
  chrome.runtime.sendMessage(
    {
      type: MessageType.INCREMENT_BLOCKED_COUNT,
      data: { hostname: window.location.hostname },
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error('Error sending INCREMENT_BLOCKED_COUNT message:', chrome.runtime.lastError.message);
      }
    }
  );
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) {
    return;
  }

  if (event.data.type === 'BLOCKED_POPUP' || event.data.type === 'BLOCKED_REDIRECT') {
    incrementBlockedCount();
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  try {
    if (!isUpdateBlockingStatusMessage(message)) {
      sendResponse({ success: false, error: 'Invalid message payload' });
      return;
    }

    isBlocked = message.data.isBlocked;
    if (isBlocked) {
      blockPopups();
    } else {
      unblockPopups();
    }

    sendResponse({ success: true });
  } catch (error: unknown) {
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

function checkInitialBlockingStatus(): void {
  chrome.runtime.sendMessage(
    {
      type: MessageType.GET_BLOCKING_STATUS,
      data: { hostname: globalThis.location.hostname },
    },
    (response: GetBlockingStatusResponse | undefined) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting initial blocking status:', chrome.runtime.lastError.message);
        return;
      }

      if (!response || typeof response.isBlocked !== 'boolean') {
        return;
      }

      isBlocked = response.isBlocked;
      if (!isBlocked) {
        return;
      }

      if (window === window.top) {
        chrome.windows.getCurrent((currentWindow) => {
          if (currentWindow.incognito) {
            chrome.runtime.sendMessage({
              type: MessageType.TOGGLE_BLOCKING,
              data: { hostname: globalThis.location.hostname, isIncognito: true },
            });
          }
        });
      }

      blockPopups();
    }
  );
}

checkInitialBlockingStatus();

export const __testing = {
  findBlankAnchor,
};
