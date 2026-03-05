(function() {
  // Clear the re-application interval first so it can't re-block after we restore
  if (window.__popupBlockerIntervalId) {
    clearInterval(window.__popupBlockerIntervalId);
    window.__popupBlockerIntervalId = null;
  }

  var originals = window.__popupBlockerOriginals;
  if (originals) {
    // Restore window.open via Object.defineProperty to match how block_popups.js set it
    try {
      Object.defineProperty(window, 'open', {
        configurable: true,
        enumerable: true,
        writable: true,
        value: originals.open,
      });
    } catch (e) {
      try { window.open = originals.open; } catch (e2) { void e2; }
    }

    if (originals.showModalDialog) {
      try {
        Object.defineProperty(window, 'showModalDialog', {
          configurable: true,
          enumerable: true,
          writable: true,
          value: originals.showModalDialog,
        });
      } catch (e) {
        try { window.showModalDialog = originals.showModalDialog; } catch (e2) { void e2; }
      }
    }

    // Restore HTMLAnchorElement.prototype.click
    if (originals.anchorClick) {
      HTMLAnchorElement.prototype.click = originals.anchorClick;
    }

    // Restore location methods
    try {
      if (originals.locationAssign) window.location.assign = originals.locationAssign;
      if (originals.locationReplace) window.location.replace = originals.locationReplace;
      if (originals.locationReload) window.location.reload = originals.locationReload;
    } catch (e) {
      // location methods may not be writable in all page contexts
    }

    window.__popupBlockerOriginals = null;
  }

  console.log('Popup blocking protections removed');
})();
