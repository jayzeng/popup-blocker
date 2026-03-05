let interceptionEnabled = false;

function isValidUpdateMessage(message) {
  return (
    message &&
    message.type === 'UPDATE_BLOCKING_STATUS' &&
    message.data &&
    typeof message.data.isBlocked === 'boolean'
  );
}

function injectScript(file) {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(file);
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error('Error injecting script:', error);
  }
}

function findBlankAnchor(target) {
  if (!(target instanceof Element)) return null;
  return target.closest('a[target="_blank"]');
}

function incrementBlockedCount() {
  chrome.runtime.sendMessage(
    {
      type: 'INCREMENT_BLOCKED_COUNT',
      data: { hostname: window.location.hostname },
    },
    () => {
      if (chrome.runtime.lastError) {
        console.error('Error sending INCREMENT_BLOCKED_COUNT:', chrome.runtime.lastError.message);
      }
    }
  );
}

function handleMouseDown(event) {
  if (findBlankAnchor(event.target)) {
    event.stopPropagation();
  }
}

function handleClick(event) {
  if (findBlankAnchor(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function handleAuxClick(event) {
  if (event.button !== 1) return;
  if (findBlankAnchor(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (form && form.getAttribute && form.getAttribute('target') === '_blank') {
    event.preventDefault();
    event.stopPropagation();
    incrementBlockedCount();
  }
}

function blockPopups() {
  if (interceptionEnabled) return;
  injectScript('block_popups.js');
  document.addEventListener('mousedown', handleMouseDown, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('auxclick', handleAuxClick, true);
  document.addEventListener('submit', handleSubmit, true);
  interceptionEnabled = true;
}

function unblockPopups() {
  if (!interceptionEnabled) return;
  injectScript('unblock_popups.js');
  document.removeEventListener('mousedown', handleMouseDown, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('auxclick', handleAuxClick, true);
  document.removeEventListener('submit', handleSubmit, true);
  interceptionEnabled = false;
}

window.addEventListener('message', (event) => {
  if (event.source !== window || !event.data) return;
  if (event.data.type === 'BLOCKED_POPUP' || event.data.type === 'BLOCKED_REDIRECT') {
    incrementBlockedCount();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isValidUpdateMessage(message)) {
    sendResponse({ success: false, error: 'Invalid message payload' });
    return;
  }

  if (message.data.isBlocked) {
    blockPopups();
  } else {
    unblockPopups();
  }

  sendResponse({ success: true });
});

chrome.runtime.sendMessage(
  { type: 'GET_BLOCKING_STATUS', data: { hostname: window.location.hostname } },
  (response) => {
    if (chrome.runtime.lastError) return;
    if (!response || typeof response.isBlocked !== 'boolean' || !response.isBlocked) return;

    if (window === window.top) {
      chrome.windows.getCurrent((currentWindow) => {
        if (currentWindow && currentWindow.incognito) {
          chrome.runtime.sendMessage({
            type: 'TOGGLE_BLOCKING',
            data: { hostname: window.location.hostname, isIncognito: true },
          });
        }
      });
    }

    blockPopups();
  }
);
