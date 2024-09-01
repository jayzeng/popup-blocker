import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MessageType, MessagePayload } from '../types';
import './styles.css';

const Popup: React.FC = () => {
  const [hostname, setHostname] = useState<string>('');
  const [isBlocked, setIsBlocked] = useState<boolean>(false);
  const [blockedCount, setBlockedCount] = useState<number>(0);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) {
        const url = new URL(tabs[0].url);
        setHostname(url.hostname);

        chrome.runtime.sendMessage(
          { type: MessageType.GET_BLOCKING_STATUS, data: { hostname: url.hostname } } as MessagePayload,
          (response) => {
            setIsBlocked(response.isBlocked);
            setBlockedCount(response.blockedCount);
          }
        );
      }
    });
  }, []);

  const handleToggleBlocking = () => {
    chrome.runtime.sendMessage(
      { type: MessageType.TOGGLE_BLOCKING, data: { hostname } } as MessagePayload,
      (response) => {
        setIsBlocked(response.isBlocked);
        setBlockedCount(response.blockedCount);
      }
    );
  };

  return (
    <div className="popup-container">
      <h1 className="title">Popup Blocker</h1>
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
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<Popup />);
