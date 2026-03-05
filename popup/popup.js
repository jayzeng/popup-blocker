(function () {
  let hostname = '';
  let isBlocked = false;
  let blockedCount = 0;
  let blockedSites = [];
  let isIncognito = false;
  let globalBlockingEnabled = true;
  const unmaskedSites = new Set();

  const coverageStatus = document.getElementById('coverageStatus');
  const currentSite = document.getElementById('currentSite');
  const blockedCountEl = document.getElementById('blockedCount');
  const toggleBlockingBtn = document.getElementById('toggleBlocking');
  const toggleGlobalBtn = document.getElementById('toggleGlobal');
  const blockedSitesList = document.getElementById('blockedSitesList');
  const sitesListTitle = document.getElementById('sitesListTitle');
  const emptyState = document.getElementById('emptyState');

  function maskHostname(host) {
    return host.replace(/[^.]/g, '*');
  }

  function formatAllowedUntil(allowedUntil) {
    if (!allowedUntil) return null;
    const remaining = allowedUntil - Date.now();
    if (remaining <= 0) return 'Expired';
    const mins = Math.ceil(remaining / 60000);
    if (mins < 60) return `${mins}m left`;
    return `${Math.ceil(mins / 60)}h left`;
  }

  function render() {
    currentSite.textContent = hostname || '-';
    blockedCountEl.textContent = String(blockedCount);

    // Global toggle button
    toggleGlobalBtn.className = 'toggle-global-btn ' + (globalBlockingEnabled ? 'global-on' : 'global-off');
    toggleGlobalBtn.textContent = globalBlockingEnabled ? 'ON' : 'OFF';

    // Per-site coverage status and toggle button
    coverageStatus.className = 'coverage-status ' + (isBlocked ? 'covered' : 'not-covered');

    if (globalBlockingEnabled) {
      if (isBlocked) {
        coverageStatus.textContent = 'This site is covered by the extension';
        toggleBlockingBtn.className = 'toggle-button blocked';
        toggleBlockingBtn.textContent = 'Allow this site';
      } else {
        coverageStatus.textContent = 'This site is allowed (exception)';
        toggleBlockingBtn.className = 'toggle-button allowed';
        toggleBlockingBtn.textContent = 'Block this site';
      }
      sitesListTitle.textContent = 'Allowed Exceptions';
      emptyState.textContent = 'No exceptions — all sites are blocked.';
    } else {
      if (isBlocked) {
        coverageStatus.textContent = 'This site is covered by the extension';
        toggleBlockingBtn.className = 'toggle-button blocked';
        toggleBlockingBtn.textContent = 'Disable Blocking';
      } else {
        coverageStatus.textContent = 'This site is not covered by the extension';
        toggleBlockingBtn.className = 'toggle-button allowed';
        toggleBlockingBtn.textContent = 'Enable Blocking';
      }
      sitesListTitle.textContent = 'Blocked Sites';
      emptyState.textContent = 'No sites are currently blocked.';
    }

    blockedSitesList.innerHTML = '';
    // When global ON, show exceptions (isBlocked: false); when global OFF, show blocked sites
    const displaySites = globalBlockingEnabled
      ? blockedSites.filter((s) => !s.isBlocked)
      : blockedSites.filter((s) => s.isBlocked);
    emptyState.style.display = displaySites.length === 0 ? '' : 'none';

    displaySites.forEach((site) => {
      const li = document.createElement('li');

      const siteName = document.createElement('span');
      siteName.className = 'site-name';
      const displayName = site.isMasked && !unmaskedSites.has(site.hostname) ? maskHostname(site.hostname) : site.hostname;
      const durationLabel = globalBlockingEnabled ? formatAllowedUntil(site.allowedUntil) : null;
      siteName.textContent = durationLabel ? `${displayName} (${durationLabel})` : displayName;

      li.appendChild(siteName);

      if (site.isMasked) {
        const maskBtn = document.createElement('button');
        maskBtn.className = 'btn-small';
        maskBtn.textContent = unmaskedSites.has(site.hostname) ? 'Mask' : 'Unmask';
        maskBtn.addEventListener('click', () => {
          if (unmaskedSites.has(site.hostname)) unmaskedSites.delete(site.hostname);
          else unmaskedSites.add(site.hostname);
          render();
        });
        li.appendChild(maskBtn);
      }

      const actionBtn = document.createElement('button');
      actionBtn.className = 'btn-small';
      actionBtn.textContent = globalBlockingEnabled ? 'Remove exception' : 'Unblock';
      actionBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'UNBLOCK_SITE', data: { hostname: site.hostname } }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) return;
          blockedSites = blockedSites.filter((item) => item.hostname !== site.hostname);
          if (site.hostname === hostname) {
            // Removing an exception when global is on means this site is now blocked again
            isBlocked = globalBlockingEnabled ? true : false;
          }
          render();
        });
      });
      li.appendChild(actionBtn);

      blockedSitesList.appendChild(li);
    });
  }

  function toggleBlocking() {
    if (!hostname) return;

    chrome.runtime.sendMessage(
      { type: 'TOGGLE_BLOCKING', data: { hostname, isIncognito } },
      (response) => {
        if (chrome.runtime.lastError || !response) return;
        isBlocked = response.isBlocked;
        blockedCount = response.blockedCount;
        blockedSites = Array.isArray(response.blockedSites) ? response.blockedSites : blockedSites;
        if (typeof response.globalBlockingEnabled === 'boolean') {
          globalBlockingEnabled = response.globalBlockingEnabled;
        }
        render();
      }
    );
  }

  function toggleGlobal() {
    const newValue = !globalBlockingEnabled;
    chrome.runtime.sendMessage(
      { type: 'SET_GLOBAL_BLOCKING', data: { enabled: newValue } },
      (response) => {
        if (chrome.runtime.lastError || !response) return;
        globalBlockingEnabled = response.globalBlockingEnabled;
        // Re-fetch blocking status for current site since global changed
        if (hostname) {
          chrome.runtime.sendMessage({ type: 'GET_BLOCKING_STATUS', data: { hostname } }, (statusResponse) => {
            if (!chrome.runtime.lastError && statusResponse) {
              isBlocked = !!statusResponse.isBlocked;
              blockedCount = Number(statusResponse.blockedCount || 0);
            }
            render();
          });
        } else {
          render();
        }
      }
    );
  }

  function loadState() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url) {
        render();
        return;
      }

      try {
        hostname = new URL(activeTab.url).hostname;
      } catch (_) {
        hostname = '';
      }

      chrome.windows.get(activeTab.windowId, (currentWindow) => {
        if (!chrome.runtime.lastError && currentWindow) {
          isIncognito = !!currentWindow.incognito;
        }
      });

      chrome.runtime.sendMessage({ type: 'GET_BLOCKING_STATUS', data: { hostname } }, (statusResponse) => {
        if (!chrome.runtime.lastError && statusResponse) {
          isBlocked = !!statusResponse.isBlocked;
          blockedCount = Number(statusResponse.blockedCount || 0);
          if (typeof statusResponse.globalBlockingEnabled === 'boolean') {
            globalBlockingEnabled = statusResponse.globalBlockingEnabled;
          }
          render();
        }
      });

      chrome.runtime.sendMessage({ type: 'GET_BLOCKED_SITES' }, (sitesResponse) => {
        if (!chrome.runtime.lastError && Array.isArray(sitesResponse)) {
          blockedSites = sitesResponse;
          render();
        }
      });
    });
  }

  toggleBlockingBtn.addEventListener('click', toggleBlocking);
  toggleGlobalBtn.addEventListener('click', toggleGlobal);

  // Listen for count updates pushed from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'UPDATE_BLOCKING_STATUS' && message.data) {
      if (typeof message.data.isBlocked === 'boolean') isBlocked = message.data.isBlocked;
      if (typeof message.data.blockedCount === 'number') blockedCount = message.data.blockedCount;
      if (typeof message.data.globalBlockingEnabled === 'boolean') globalBlockingEnabled = message.data.globalBlockingEnabled;
      render();
    }
  });

  loadState();
})();
