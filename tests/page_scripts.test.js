describe('page context popup scripts', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    window.__popupBlockerOriginals = null;
    window.__popupBlockerIntervalId = null;
  });

  it('blocks popup APIs and restores them on unblock', () => {
    const originalOpen = window.open;
    const postMessageSpy = jest.spyOn(window, 'postMessage');

    require('../block_popups.js');

    expect(window.__popupBlockerOriginals).toBeTruthy();
    expect(window.open).not.toBe(originalOpen);

    window.open('https://example.com');
    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BLOCKED_POPUP', method: 'open' }),
      '*'
    );

    const link = document.createElement('a');
    link.href = 'https://example.com';
    link.target = '_blank';
    link.click();

    expect(postMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'BLOCKED_POPUP', method: 'anchor.click' }),
      '*'
    );

    require('../unblock_popups.js');

    expect(window.open).toBe(originalOpen);
    expect(window.__popupBlockerOriginals).toBeNull();
    postMessageSpy.mockRestore();
  });
});
