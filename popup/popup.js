(function () {
  let hostname = '';
  let isBlocked = false;
  let blockedCount = 0;
  let blockedSites = [];
  let isIncognito = false;
  const unmaskedSites = new Set();

  const coverageStatus = document.getElementById('coverageStatus');
  const currentSite = document.getElementById('currentSite');
  const blockedCountEl = document.getElementById('blockedCount');
  const toggleBlockingBtn = document.getElementById('toggleBlocking');
  const blockedSitesList = document.getElementById('blockedSitesList');
  const emptyState = document.getElementById('emptyState');

  function maskHostname(host) {
    return host.replace(/[^.]/g, '*');
  }

  function render() {
    currentSite.textContent = hostname || '-';
    blockedCountEl.textContent = String(blockedCount);

    coverageStatus.className = 'coverage-status ' + (isBlocked ? 'covered' : 'not-covered');
    coverageStatus.textContent = isBlocked
      ? 'This site is covered by the extension'
      : 'This site is not covered by the extension';

    toggleBlockingBtn.className = 'toggle-button ' + (isBlocked ? 'blocked' : 'allowed');
    toggleBlockingBtn.textContent = isBlocked ? 'Disable Blocking' : 'Enable Blocking';

    blockedSitesList.innerHTML = '';
    emptyState.style.display = blockedSites.length === 0 ? '' : 'none';

    blockedSites.forEach((site) => {
      const li = document.createElement('li');

      const siteName = document.createElement('span');
      siteName.className = 'site-name';
      siteName.textContent = site.isMasked && !unmaskedSites.has(site.hostname) ? maskHostname(site.hostname) : site.hostname;

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

      const unblockBtn = document.createElement('button');
      unblockBtn.className = 'btn-small';
      unblockBtn.textContent = 'Unblock';
      unblockBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'UNBLOCK_SITE', data: { hostname: site.hostname } }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) return;
          blockedSites = blockedSites.filter((item) => item.hostname !== site.hostname);
          if (site.hostname === hostname) isBlocked = false;
          render();
        });
      });
      li.appendChild(unblockBtn);

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
        render();
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
  loadState();
})();
