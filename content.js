let interceptionEnabled = false;
const isIncognito = !!chrome.extension.inIncognitoContext;

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
    localCount += 1;
    showToast(localCount);
    incrementBlockedCount();
  }
}

function handleAuxClick(event) {
  if (event.button !== 1) return;
  if (findBlankAnchor(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    localCount += 1;
    showToast(localCount);
    incrementBlockedCount();
  }
}

function handleSubmit(event) {
  const form = event.target;
  if (form && form.getAttribute && form.getAttribute('target') === '_blank') {
    event.preventDefault();
    event.stopPropagation();
    localCount += 1;
    showToast(localCount);
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
    localCount += 1;
    showToast(localCount);
    incrementBlockedCount();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'POPUP_BLOCKED' && message.data) {
    // Confirmed count from background (nav-intercepted popups or confirmed count)
    localCount = message.data.blockedCount;
    showToast(localCount);
    sendResponse({ success: true });
    return;
  }

  if (!isValidUpdateMessage(message)) {
    sendResponse({ success: false, error: 'Invalid message payload' });
    return;
  }

  if (message.data.isBlocked) {
    blockPopups();
  } else {
    unblockPopups();
    hideToast();
  }

  sendResponse({ success: true });
});

chrome.runtime.sendMessage(
  { type: 'GET_BLOCKING_STATUS', data: { hostname: window.location.hostname } },
  (response) => {
    if (chrome.runtime.lastError) return;
    if (!response || typeof response.isBlocked !== 'boolean' || !response.isBlocked) return;

    blockPopups();
  }
);

// ---- Blocked popup indicator ----
const STORAGE_KEY_SHOW_BLOCKED_TOAST = 'SHOW_BLOCKED_TOAST';
let localCount = 0;
let showBlockedToast = false;
let toastHost = null;
let toastRefs = null;
let autoHideTimer = null;

chrome.storage.local.get([STORAGE_KEY_SHOW_BLOCKED_TOAST], (result) => {
  showBlockedToast = result[STORAGE_KEY_SHOW_BLOCKED_TOAST] === true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY_SHOW_BLOCKED_TOAST]) return;

  showBlockedToast = changes[STORAGE_KEY_SHOW_BLOCKED_TOAST].newValue === true;
  if (!showBlockedToast) hideToast();
});

const DURATIONS = [
  { label: '5 min', ms: 5 * 60 * 1000 },
  { label: '1 hr',  ms: 60 * 60 * 1000 },
  { label: 'Forever', ms: null },
];

const TOAST_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :host {
    all: initial;
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 2147483647;
    pointer-events: none;
    display: block;
  }

  .toast {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.4;
    background: #18181b;
    color: #fafafa;
    border-radius: 12px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: all;
    transform: translateY(80px);
    opacity: 0;
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease;
    min-width: 220px;
    max-width: 340px;
    user-select: none;
  }

  .toast.visible {
    transform: translateY(0);
    opacity: 1;
  }

  .icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  .label {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 4px;
    flex-wrap: wrap;
  }

  .count {
    font-weight: 700;
    color: #f87171;
    font-size: 15px;
    display: inline-block;
  }

  @keyframes bump {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.65); }
    100% { transform: scale(1); }
  }

  .count.bump {
    animation: bump 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  .label-text {
    color: rgba(255,255,255,0.75);
    font-size: 12px;
  }

  .allow-btn {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.2);
    color: #fafafa;
    border-radius: 7px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: inherit;
    transition: background 0.15s;
  }
  .allow-btn:hover { background: rgba(255,255,255,0.22); }

  .duration-row {
    display: none;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .duration-row.visible { display: flex; }

  .dur-label {
    font-size: 11px;
    color: rgba(255,255,255,0.5);
    white-space: nowrap;
  }

  .dur-btn {
    background: rgba(255,255,255,0.1);
    border: 1px solid rgba(255,255,255,0.25);
    color: #fafafa;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    transition: background 0.15s, border-color 0.15s;
  }
  .dur-btn:hover {
    background: rgba(255,255,255,0.25);
    border-color: rgba(255,255,255,0.45);
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: rgba(255,255,255,0.4);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
    font-family: inherit;
    transition: color 0.15s;
  }
  .dismiss-btn:hover { color: #fafafa; }
`;

function buildToast() {
  const host = document.createElement('div');

  const shadow = host.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = TOAST_CSS;

  const toast = document.createElement('div');
  toast.className = 'toast';

  // Icon
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = '\uD83D\uDEAB'; // 🚫

  // Label area
  const label = document.createElement('span');
  label.className = 'label';

  const countEl = document.createElement('span');
  countEl.className = 'count';
  countEl.textContent = '0';

  const labelText = document.createElement('span');
  labelText.className = 'label-text';
  labelText.textContent = 'popup blocked';

  label.appendChild(countEl);
  label.appendChild(labelText);

  // Allow button
  const allowBtn = document.createElement('button');
  allowBtn.className = 'allow-btn';
  allowBtn.textContent = 'Allow site';
  allowBtn.addEventListener('click', () => {
    allowBtn.style.display = 'none';
    durationRow.classList.add('visible');
    clearTimeout(autoHideTimer); // Don't auto-hide while user is choosing
  });

  // Duration picker row
  const durationRow = document.createElement('div');
  durationRow.className = 'duration-row';

  const durLabel = document.createElement('span');
  durLabel.className = 'dur-label';
  durLabel.textContent = 'Allow for:';
  durationRow.appendChild(durLabel);

  DURATIONS.forEach(({ label: durText, ms }) => {
    const btn = document.createElement('button');
    btn.className = 'dur-btn';
    btn.textContent = durText;
    btn.addEventListener('click', () => allowSite(ms));
    durationRow.appendChild(btn);
  });

  // Dismiss button
  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'dismiss-btn';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.textContent = '\u00D7'; // ×
  dismissBtn.addEventListener('click', hideToast);

  toast.appendChild(icon);
  toast.appendChild(label);
  toast.appendChild(allowBtn);
  toast.appendChild(durationRow);
  toast.appendChild(dismissBtn);

  shadow.appendChild(styleEl);
  shadow.appendChild(toast);

  (document.body || document.documentElement).appendChild(host);

  toastHost = host;
  toastRefs = { toast, countEl, labelText, allowBtn, durationRow };
}

function showToast(count) {
  if (!showBlockedToast) return;
  if (!toastHost) buildToast();
  if (!toastRefs) return;

  const { toast, countEl, labelText, allowBtn, durationRow } = toastRefs;

  // Reset to initial action state
  allowBtn.style.display = '';
  durationRow.classList.remove('visible');

  // Update text
  countEl.textContent = String(count);
  labelText.textContent = count === 1 ? ' popup blocked' : ' popups blocked';

  // Trigger bump animation
  countEl.classList.remove('bump');
  void countEl.offsetWidth; // force reflow so animation re-triggers
  countEl.classList.add('bump');

  // Show
  toast.classList.add('visible');

  // Auto-hide after 5 s of inactivity
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  if (!toastRefs) return;
  clearTimeout(autoHideTimer);
  toastRefs.toast.classList.remove('visible');
}

function allowSite(ms) {
  const allowedUntil = ms !== null ? Date.now() + ms : null;
  chrome.runtime.sendMessage(
    {
      type: 'TOGGLE_BLOCKING',
      data: { hostname: window.location.hostname, isIncognito, allowedUntil },
    },
    (response) => {
      if (chrome.runtime.lastError || !response) return;
      hideToast();
      unblockPopups();
      localCount = 0;
    }
  );
}
