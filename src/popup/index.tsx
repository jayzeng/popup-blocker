import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BlockedSite,
  GetBlockedSitesRequest,
  GetBlockingStatusRequest,
  GetBlockingStatusResponse,
  MessageType,
  ToggleBlockingRequest,
  ToggleBlockingResponse,
  UnblockSiteRequest,
  UnblockSiteResponse,
} from '../types';
import { maskHostname } from '../shared/site-utils';
import './styles.css';

function sendMessage<Request, Response>(message: Request): Promise<Response> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: Response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

const Popup: React.FC = () => {
  const [hostname, setHostname] = useState<string>('');
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [blockedSites, setBlockedSites] = useState<BlockedSite[]>([]);
  const [isIncognito, setIsIncognito] = useState<boolean>(false);
  const [unmaskedSites, setUnmaskedSites] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadState(): Promise<void> {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs[0];
        if (!activeTab?.url) {
          return;
        }

        const url = new URL(activeTab.url);
        setHostname(url.hostname);

        const currentWindow = await chrome.windows.get(activeTab.windowId);
        setIsIncognito(currentWindow.incognito);

        const statusRequest: GetBlockingStatusRequest = {
          type: MessageType.GET_BLOCKING_STATUS,
          data: { hostname: url.hostname },
        };

        const status = await sendMessage<GetBlockingStatusRequest, GetBlockingStatusResponse>(statusRequest);
        setIsBlocked(status.isBlocked);
        setBlockedCount(status.blockedCount);

        const blockedSitesRequest: GetBlockedSitesRequest = { type: MessageType.GET_BLOCKED_SITES };
        const sites = await sendMessage<GetBlockedSitesRequest, BlockedSite[]>(blockedSitesRequest);
        setBlockedSites(sites);
      } catch {
        // Keep popup resilient when extension is reloading.
      }
    }

    loadState();
  }, []);

  const handleToggleBlocking = async (): Promise<void> => {
    if (!hostname) {
      return;
    }

    const request: ToggleBlockingRequest = {
      type: MessageType.TOGGLE_BLOCKING,
      data: { hostname, isIncognito },
    };

    try {
      const response = await sendMessage<ToggleBlockingRequest, ToggleBlockingResponse>(request);
      setIsBlocked(response.isBlocked);
      setBlockedCount(response.blockedCount);
      setBlockedSites(response.blockedSites);
    } catch {
      // Ignore runtime failures and keep current UI state.
    }
  };

  const handleUnblockSite = async (siteHostname: string): Promise<void> => {
    const request: UnblockSiteRequest = {
      type: MessageType.UNBLOCK_SITE,
      data: { hostname: siteHostname },
    };

    try {
      const response = await sendMessage<UnblockSiteRequest, UnblockSiteResponse>(request);
      if (response.success) {
        setBlockedSites((prevSites) => prevSites.filter((site) => site.hostname !== siteHostname));
      }
    } catch {
      // Ignore runtime failures and keep current UI state.
    }
  };

  const toggleUnmask = (siteHostname: string): void => {
    setUnmaskedSites((prevUnmasked) => {
      const next = new Set(prevUnmasked);
      if (next.has(siteHostname)) {
        next.delete(siteHostname);
      } else {
        next.add(siteHostname);
      }
      return next;
    });
  };

  return (
    <div className="popup-container">
      <h1 className="title">Yet Another Popup Blocker</h1>
      <div id="coverageStatus" className={`coverage-status ${isBlocked ? 'covered' : 'not-covered'}`}>
        {isBlocked ? 'This site is covered by the extension' : 'This site is not covered by the extension'}
      </div>
      <div className="info-container">
        <div className="info-item">
          <span className="info-label">Current site:</span>
          <span className="info-value">{hostname}</span>
        </div>
        <div className="info-item">
          <span className="info-label">Popups blocked:</span>
          <span className="info-value">{blockedCount}</span>
        </div>
      </div>
      <button className={`toggle-button ${isBlocked ? 'blocked' : 'allowed'}`} onClick={handleToggleBlocking}>
        {isBlocked ? 'Disable Blocking' : 'Enable Blocking'}
      </button>
      <div className="blocked-sites-list">
        <h2>Blocked Sites</h2>
        {blockedSites.length === 0 ? (
          <p>No sites are currently blocked.</p>
        ) : (
          <ul>
            {blockedSites.map((site) => (
              <li key={site.hostname}>
                {site.isMasked && !unmaskedSites.has(site.hostname) ? maskHostname(site.hostname) : site.hostname}
                {site.isMasked && (
                  <button onClick={() => toggleUnmask(site.hostname)} className="unmask-button">
                    {unmaskedSites.has(site.hostname) ? 'Mask' : 'Unmask'}
                  </button>
                )}
                <button onClick={() => void handleUnblockSite(site.hostname)}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<Popup />);
}
