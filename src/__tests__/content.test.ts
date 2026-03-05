import { MessageType } from '../types';

type MessageListener = (
  message: { type: string; data?: unknown },
  sender: unknown,
  sendResponse: (response: unknown) => void
) => void;

type ChromeMockListeners = {
  onMessage: MessageListener[];
};

function getListeners(): ChromeMockListeners {
  return (globalThis as unknown as { __chromeMockListeners: ChromeMockListeners }).__chromeMockListeners;
}

describe('content script', () => {
  let onMessageListener: MessageListener;

  beforeAll(() => {
    jest.resetModules();
    jest.clearAllMocks();
    getListeners().onMessage.length = 0;

    (chrome.runtime.sendMessage as jest.Mock).mockImplementation(
      (_msg: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ isBlocked: false, blockedCount: 0 });
        }
      }
    );

    require('../content/index');
    onMessageListener = getListeners().onMessage[0];
  });

  function enableBlocking(): void {
    onMessageListener({ type: MessageType.UPDATE_BLOCKING_STATUS, data: { isBlocked: true } }, {}, jest.fn());
  }

  function disableBlocking(): void {
    onMessageListener({ type: MessageType.UPDATE_BLOCKING_STATUS, data: { isBlocked: false } }, {}, jest.fn());
  }

  describe('blocking state updates', () => {
    it('injects block script when enabled', () => {
      enableBlocking();
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('block_popups.js');
    });

    it('injects unblock script when disabled', () => {
      enableBlocking();
      (chrome.runtime.getURL as jest.Mock).mockClear();
      disableBlocking();
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('unblock_popups.js');
    });

    it('rejects malformed UPDATE_BLOCKING_STATUS payloads', () => {
      const sendResponse = jest.fn();
      onMessageListener({ type: MessageType.UPDATE_BLOCKING_STATUS, data: { isBlocked: 'yes' } }, {}, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });
  });

  describe('click interception', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      enableBlocking();
    });

    afterEach(() => {
      disableBlocking();
      document.body.innerHTML = '';
    });

    it('blocks direct _blank link clicks', () => {
      const link = document.createElement('a');
      link.href = 'https://example.com';
      link.target = '_blank';
      document.body.appendChild(link);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: MessageType.INCREMENT_BLOCKED_COUNT }),
        expect.any(Function)
      );
    });

    it('blocks nested _blank link clicks', () => {
      const link = document.createElement('a');
      link.href = 'https://ad.example.com';
      link.target = '_blank';
      const child = document.createElement('div');
      link.appendChild(child);
      document.body.appendChild(link);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      child.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('does not block regular links', () => {
      const link = document.createElement('a');
      link.href = 'https://example.com';
      document.body.appendChild(link);

      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe('auxclick and submit interception', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      enableBlocking();
    });

    afterEach(() => {
      disableBlocking();
      document.body.innerHTML = '';
    });

    it('blocks middle-click on _blank links', () => {
      const link = document.createElement('a');
      link.href = 'https://ad.example.com';
      link.target = '_blank';
      document.body.appendChild(link);

      const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
      link.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });

    it('blocks form submissions with target _blank', () => {
      const form = document.createElement('form');
      form.target = '_blank';
      document.body.appendChild(form);

      const event = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });
});
