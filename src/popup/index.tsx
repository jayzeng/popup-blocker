import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageType, MessagePayload, BlockedSite } from '../types';
import './styles.css';

const Popup: React.FC = () => {
  const [hostname, setHostname] = useState<string>('');
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [blockedSites, setBlockedSites] = useState<BlockedSite[]>([]);
  const [isIncognito, setIsIncognito] = useState<boolean>(false);
  const [unmaskedSites, setUnmaskedSites] = useState<Set<string>>(new Set());

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        const url = new URL(tabs[0].url);
        setHostname(url.hostname);

        // Check if the current window is incognito
        chrome.windows.get(tabs[0].windowId, (window) => {
          setIsIncognito(window.incognito);
        });

        chrome.runtime.sendMessage(
          { type: MessageType.GET_BLOCKING_STATUS, data: { hostname: url.hostname } } as MessagePayload,
          (response) => {
            setIsBlocked(response.isBlocked);
            setBlockedCount(response.blockedCount);
          }
        );

        // Fetch blocked sites
        chrome.runtime.sendMessage({ type: MessageType.GET_BLOCKED_SITES }, (response: BlockedSite[]) => {
          setBlockedSites(response);
        });
      }
    });
  }, []);

  const handleToggleBlocking = () => {
    chrome.runtime.sendMessage(
      { 
        type: MessageType.TOGGLE_BLOCKING, 
        data: { hostname, isIncognito } 
      } as MessagePayload,
      (response) => {
        setIsBlocked(response.isBlocked);
        setBlockedCount(response.blockedCount);

        // Update the blockedSites list
        if (response.isBlocked) {
          // Add the site to the list if it's not already there
          setBlockedSites(prevSites => {
            if (!prevSites.some(site => site.hostname === hostname)) {
              return [...prevSites, { 
                hostname, 
                isBlocked: true, 
                blockedCount: response.blockedCount,
                isMasked: isIncognito // Set isMasked based on isIncognito
              }];
            }
            return prevSites;
          });
        } else {
          // Remove the site from the list if it's unblocked
          setBlockedSites(prevSites => prevSites.filter(site => site.hostname !== hostname));
        }
      }
    );
  };

  const handleUnblockSite = (hostname: string) => {
    chrome.runtime.sendMessage(
      { type: MessageType.UNBLOCK_SITE, data: { hostname } } as MessagePayload,
      (response) => {
        if (response.success) {
          setBlockedSites(prevSites => prevSites.filter(site => site.hostname !== hostname));
        }
      }
    );
  };

  // Function to mask the hostname
  const maskHostname = (hostname: string) => {
    return hostname.replace(/[^.]/g, '*');
  };

  // Function to toggle unmasking for a specific site
  const toggleUnmask = (hostname: string) => {
    setUnmaskedSites(prevUnmasked => {
      const newUnmasked = new Set(prevUnmasked);
      if (newUnmasked.has(hostname)) {
        newUnmasked.delete(hostname);
      } else {
        newUnmasked.add(hostname);
      }
      return newUnmasked;
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
      <button
        className={`toggle-button ${isBlocked ? 'blocked' : 'allowed'}`}
        onClick={handleToggleBlocking}
      >
        {isBlocked ? 'Disable Blocking' : 'Enable Blocking'}
      </button>
      <div className="blocked-sites-list">
        <h2>Blocked Sites</h2>
        {blockedSites.length === 0 ? (
          <p>No sites are currently blocked.</p>
        ) : (
          <ul>
            {blockedSites.map(site => (
              <li key={site.hostname}>
                {site.isMasked && !unmaskedSites.has(site.hostname) 
                  ? maskHostname(site.hostname) 
                  : site.hostname}
                {site.isMasked && (
                  <button 
                    onClick={() => toggleUnmask(site.hostname)}
                    className="unmask-button"
                  >
                    {unmaskedSites.has(site.hostname) ? 'Mask' : 'Unmask'}
                  </button>
                )}
                <button onClick={() => handleUnblockSite(site.hostname)}>Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
