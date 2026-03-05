function getListeners() {
  return globalThis.__chromeMockListeners;
}

describe('content.js', () => {
  let onMessage;

  beforeAll(() => {
    jest.resetModules();
    jest.clearAllMocks();
    getListeners().onMessage.length = 0;

    chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
      if (callback) callback({ isBlocked: false, blockedCount: 0 });
    });

    require('../content.js');
    onMessage = getListeners().onMessage[0];
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function enableBlocking() {
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: true } }, {}, jest.fn());
  }

  function disableBlocking() {
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: false } }, {}, jest.fn());
  }

  it('injects block/unblock scripts on state change', () => {
    enableBlocking();
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('block_popups.js');

    chrome.runtime.getURL.mockClear();
    disableBlocking();
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('unblock_popups.js');
  });

  it('blocks nested _blank link click', () => {
    enableBlocking();

    const link = document.createElement('a');
    link.href = 'https://ad.example.com';
    link.target = '_blank';
    const child = document.createElement('div');
    link.appendChild(child);
    document.body.appendChild(link);

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    child.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    disableBlocking();
    document.body.innerHTML = '';
  });

  it('rejects malformed update payload', () => {
    const sendResponse = jest.fn();
    onMessage({ type: 'UPDATE_BLOCKING_STATUS', data: { isBlocked: 'yes' } }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
