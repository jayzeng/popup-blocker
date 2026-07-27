function getListeners() {
  return globalThis.__chromeMockListeners;
}

describe('content.js', () => {
  let onMessage;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.body.innerHTML = '';

    getListeners().onMessage.length = 0;
    getListeners().storageChanged.length = 0;
    chrome.extension.inIncognitoContext = false;
    chrome.storage.local.get.mockImplementation((_keys, callback) => callback({}));
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_BLOCKING_STATUS') {
        callback?.({ isBlocked: false, blockedCount: 0 });
        return;
      }
      callback?.({ success: true });
    });

    require('../content.js');
    onMessage = getListeners().onMessage[0];
  });

  function enableBlocking() {
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: true } }, {}, jest.fn());
  }

  function disableBlocking() {
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: false } }, {}, jest.fn());
  }

  it('injects block/unblock scripts on blocking state changes', () => {
    enableBlocking();
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('block_popups.js');

    chrome.runtime.getURL.mockClear();
    disableBlocking();
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('unblock_popups.js');
  });

  it('blocks _blank click, middle-click, and form submits', () => {
    enableBlocking();
    chrome.runtime.sendMessage.mockClear();

    const link = document.createElement('a');
    link.href = 'https://ad.example.com';
    link.target = '_blank';
    const child = document.createElement('span');
    link.appendChild(child);
    document.body.appendChild(link);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    child.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);

    const auxEvent = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    child.dispatchEvent(auxEvent);
    expect(auxEvent.defaultPrevented).toBe(true);

    const form = document.createElement('form');
    form.setAttribute('target', '_blank');
    document.body.appendChild(form);
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    expect(submitEvent.defaultPrevented).toBe(true);

    const incrementCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([msg]) => msg && msg.type === 'INCREMENT_BLOCKED_COUNT'
    );
    expect(incrementCalls.length).toBe(3);

    disableBlocking();
  });

  it('hides block notifications by default and shows them only when enabled', () => {
    enableBlocking();

    const link = document.createElement('a');
    link.href = 'https://ad.example.com';
    link.target = '_blank';
    document.body.appendChild(link);

    link.click();
    expect([...document.body.children].some((element) => element.shadowRoot)).toBe(false);

    const onStorageChanged = getListeners().storageChanged[0];
    onStorageChanged(
      { SHOW_BLOCKED_TOAST: { oldValue: undefined, newValue: true } },
      'local'
    );
    link.click();

    const toastHost = [...document.body.children].find((element) => element.shadowRoot);
    const toast = toastHost.shadowRoot.querySelector('.toast');
    expect(toast.textContent).toContain('2 popups blocked');
    expect(toast.classList.contains('visible')).toBe(true);

    onStorageChanged(
      { SHOW_BLOCKED_TOAST: { oldValue: true, newValue: false } },
      'local'
    );
    expect(toast.classList.contains('visible')).toBe(false);
  });

  it('handles popup-blocked signals and malformed update payloads', () => {
    enableBlocking();
    chrome.runtime.sendMessage.mockClear();

    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        data: { type: 'BLOCKED_POPUP', method: 'open', args: [] },
      })
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'INCREMENT_BLOCKED_COUNT' }),
      expect.any(Function)
    );

    const popupBlockedResponse = jest.fn();
    onMessage(
      { type: 'POPUP_BLOCKED', data: { blockedCount: 9 } },
      {},
      popupBlockedResponse
    );
    expect(popupBlockedResponse).toHaveBeenCalledWith({ success: true });

    const invalidResponse = jest.fn();
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: 'yes' } }, {}, invalidResponse);
    expect(invalidResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
