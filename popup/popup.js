(function () {
  const STORAGE_KEY_SHOW_BLOCKED_TOAST = 'SHOW_BLOCKED_TOAST';
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
  const showBlockedToastCheckbox = document.getElementById('showBlockedToast');
  const blockedSitesList = document.getElementById('blockedSitesList');
  const sitesListTitle = document.getElementById('sitesListTitle');
  const emptyState = document.getElementById('emptyState');
  const whitelistSitesList = document.getElementById('whitelistSitesList');
  const whitelistEmpty = document.getElementById('whitelistEmpty');
  const whitelistInput = document.getElementById('whitelistInput');
  const addWhitelistBtn = document.getElementById('addWhitelistBtn');
  const blacklistSitesList = document.getElementById('blacklistSitesList');
  const blacklistEmpty = document.getElementById('blacklistEmpty');
  const blacklistInput = document.getElementById('blacklistInput');
  const addBlacklistBtn = document.getElementById('addBlacklistBtn');

  function normalizeHostname(h) {
    return String(h || '').trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
  }

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

    // Determine current site's list type
    const currentSiteEntry = hostname
      ? blockedSites.find((s) => normalizeHostname(s.hostname) === normalizeHostname(hostname))
      : null;
    const currentListType = currentSiteEntry ? currentSiteEntry.listType : null;

    // Per-site coverage status and toggle button
    if (currentListType === 'whitelist') {
      coverageStatus.className = 'coverage-status whitelisted';
      coverageStatus.textContent = 'This site is always allowed (whitelist)';
      toggleBlockingBtn.className = 'toggle-button allowed';
      toggleBlockingBtn.textContent = 'Always Allowed';
      toggleBlockingBtn.disabled = true;
    } else if (currentListType === 'blacklist') {
      coverageStatus.className = 'coverage-status blacklisted';
      coverageStatus.textContent = 'This site is always blocked (blacklist)';
      toggleBlockingBtn.className = 'toggle-button blocked';
      toggleBlockingBtn.textContent = 'Always Blocked';
      toggleBlockingBtn.disabled = true;
    } else {
      toggleBlockingBtn.disabled = false;
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
      }
    }

    if (globalBlockingEnabled) {
      sitesListTitle.textContent = 'Allowed Exceptions';
      emptyState.textContent = 'No exceptions — all sites are blocked.';
    } else {
      sitesListTitle.textContent = 'Blocked Sites';
      emptyState.textContent = 'No sites are currently blocked.';
    }

    // Custom exceptions list (listType === null only)
    blockedSitesList.innerHTML = '';
    const displaySites = globalBlockingEnabled
      ? blockedSites.filter((s) => !s.isBlocked && s.listType === null)
      : blockedSites.filter((s) => s.isBlocked && s.listType === null);
    emptyState.style.display = displaySites.length === 0 ? '' : 'none';

    displaySites.forEach((site) => {
      const li = document.createElement('li');

      const siteName = document.createElement('span');
      siteName.className = 'site-name editable-hostname';
      const displayName = site.isMasked && !unmaskedSites.has(site.hostname) ? maskHostname(site.hostname) : site.hostname;
      const durationLabel = globalBlockingEnabled ? formatAllowedUntil(site.allowedUntil) : null;
      siteName.textContent = durationLabel ? `${displayName} (${durationLabel})` : displayName;
      siteName.title = 'Click to edit';
      if (!site.isMasked || unmaskedSites.has(site.hostname)) {
        siteName.addEventListener('click', () => {
          startInlineEdit(siteName, site.hostname, (newHostname) => {
            chrome.runtime.sendMessage({ type: 'RENAME_SITE', data: { oldHostname: site.hostname, newHostname } }, (response) => {
              if (chrome.runtime.lastError || !response || !response.success) { render(); return; }
              const entry = blockedSites.find((s) => s.hostname === site.hostname);
              if (entry) entry.hostname = newHostname;
              if (site.hostname === hostname) hostname = newHostname;
              render();
            });
          });
        });
      }

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
            isBlocked = globalBlockingEnabled ? true : false;
          }
          render();
        });
      });
      li.appendChild(actionBtn);

      blockedSitesList.appendChild(li);
    });

    // Whitelist section
    renderListSection(
      blockedSites.filter((s) => s.listType === 'whitelist'),
      whitelistSitesList,
      whitelistEmpty
    );

    // Blacklist section
    renderListSection(
      blockedSites.filter((s) => s.listType === 'blacklist'),
      blacklistSitesList,
      blacklistEmpty
    );
  }

  function renderListSection(sites, listEl, emptyEl) {
    listEl.innerHTML = '';
    emptyEl.style.display = sites.length === 0 ? '' : 'none';

    sites.forEach((site) => {
      const li = document.createElement('li');

      const siteName = document.createElement('span');
      siteName.className = 'site-name editable-hostname';
      siteName.textContent = site.hostname;
      siteName.title = 'Click to edit';
      siteName.addEventListener('click', () => {
        startInlineEdit(siteName, site.hostname, (newHostname) => {
          chrome.runtime.sendMessage({ type: 'RENAME_SITE', data: { oldHostname: site.hostname, newHostname } }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) { render(); return; }
            const entry = blockedSites.find((s) => s.hostname === site.hostname);
            if (entry) entry.hostname = newHostname;
            render();
          });
        });
      });
      li.appendChild(siteName);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-small';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'UNBLOCK_SITE', data: { hostname: site.hostname } }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) return;
          blockedSites = blockedSites.filter((item) => item.hostname !== site.hostname);
          if (site.hostname === hostname) {
            isBlocked = shouldBlockLocally();
          }
          render();
        });
      });
      li.appendChild(removeBtn);

      listEl.appendChild(li);
    });
  }

  function shouldBlockLocally() {
    // Simplified fallback after removing a whitelist/blacklist entry
    return globalBlockingEnabled;
  }

  function startInlineEdit(span, oldHostname, onSave) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldHostname;
    input.className = 'inline-edit-input';
    span.replaceWith(input);
    input.focus();
    input.select();

    let committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      let raw = input.value.trim().replace(/^https?:\/\//, '').split('/')[0];
      const newHostname = normalizeHostname(raw);
      if (newHostname && newHostname !== oldHostname) {
        onSave(newHostname);
      } else {
        render();
      }
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { committed = true; render(); }
    });
  }

  function addToList(listType) {
    const input = listType === 'whitelist' ? whitelistInput : blacklistInput;
    let raw = input.value.trim();
    if (!raw) return;
    // Strip protocol if user included it
    raw = raw.replace(/^https?:\/\//, '').split('/')[0];
    const h = normalizeHostname(raw);
    if (!h) return;

    chrome.runtime.sendMessage({ type: 'ADD_TO_LIST', data: { hostname: h, listType } }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) return;
      const existing = blockedSites.find((s) => normalizeHostname(s.hostname) === h);
      if (existing) {
        existing.listType = listType;
        existing.isBlocked = listType === 'blacklist';
        existing.allowedUntil = null;
      } else {
        blockedSites.push({ hostname: h, isBlocked: listType === 'blacklist', blockedCount: 0, isMasked: false, allowedUntil: null, listType });
      }
      input.value = '';
      // Update isBlocked for current site if affected
      if (h === normalizeHostname(hostname)) {
        isBlocked = listType === 'blacklist';
      }
      render();
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

  function loadDisplaySettings() {
    chrome.storage.local.get([STORAGE_KEY_SHOW_BLOCKED_TOAST], (result) => {
      showBlockedToastCheckbox.checked = result[STORAGE_KEY_SHOW_BLOCKED_TOAST] === true;
    });
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
  showBlockedToastCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({
      [STORAGE_KEY_SHOW_BLOCKED_TOAST]: showBlockedToastCheckbox.checked,
    });
  });
  addWhitelistBtn.addEventListener('click', () => addToList('whitelist'));
  addBlacklistBtn.addEventListener('click', () => addToList('blacklist'));
  whitelistInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addToList('whitelist'); });
  blacklistInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addToList('blacklist'); });

  // Listen for count updates pushed from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'UPDATE_BLOCKING_STATUS' && message.data) {
      if (typeof message.data.isBlocked === 'boolean') isBlocked = message.data.isBlocked;
      if (typeof message.data.blockedCount === 'number') blockedCount = message.data.blockedCount;
      if (typeof message.data.globalBlockingEnabled === 'boolean') globalBlockingEnabled = message.data.globalBlockingEnabled;
      render();
    }
  });

  loadDisplaySettings();
  loadState();
})();
