(function() {
  // Store originals so unblock_popups.js can restore them
  window.__popupBlockerOriginals = {
    open: window.open,
    showModalDialog: window.showModalDialog || null,
    locationAssign: window.location.assign.bind(window.location),
    locationReplace: window.location.replace.bind(window.location),
    locationReload: window.location.reload.bind(window.location),
    anchorClick: HTMLAnchorElement.prototype.click,
  };

  // Use Object.defineProperty with writable:false so page code can't bypass via assignment.
  // configurable:true lets unblock_popups.js restore it via Object.defineProperty.
  function blockWindowMethod(methodName) {
    var blocker = function() {
      var args = Array.from(arguments);
      console.log('Blocked ' + methodName + ':', args);
      window.postMessage({ type: 'BLOCKED_POPUP', method: methodName, args: args }, '*');
      return null;
    };
    try {
      Object.defineProperty(window, methodName, {
        configurable: true,
        enumerable: true,
        writable: false,
        value: blocker,
      });
    } catch (e) {
      // Fallback: simple assignment if defineProperty fails (e.g. already non-configurable)
      try { window[methodName] = blocker; } catch (e2) {}
    }
  }

  blockWindowMethod('open');
  if (window.showModalDialog) blockWindowMethod('showModalDialog');

  // Block location methods (simple assignment; less commonly bypassed)
  ['assign', 'replace', 'reload'].forEach(function(method) {
    window.location[method] = function() {
      var args = Array.from(arguments);
      console.log('Blocked ' + method + ' redirection:', args);
      window.postMessage({ type: 'BLOCKED_REDIRECT', method: method, args: args }, '*');
    };
  });

  // Block programmatic anchor.click() calls — ad scripts often create a
  // <a target="_blank"> element and call .click() to bypass content script listeners.
  HTMLAnchorElement.prototype.click = function() {
    if (this.target === '_blank') {
      console.log('Blocked programmatic anchor click:', this.href);
      window.postMessage({ type: 'BLOCKED_POPUP', method: 'anchor.click', args: [this.href] }, '*');
      return;
    }
    return window.__popupBlockerOriginals.anchorClick.call(this);
  };

  // Re-apply window method protections every 500ms to counter any page-level restores
  window.__popupBlockerIntervalId = setInterval(function() {
    blockWindowMethod('open');
    if (window.showModalDialog) blockWindowMethod('showModalDialog');
  }, 500);

  console.log('Popup blocking protections applied');
})();
