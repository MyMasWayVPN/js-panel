import React, { useState, useEffect } from 'react';
import ConsoleView from './ConsoleView.jsx';
import FileManager from './FileManager.jsx';
import SettingsView from './SettingsView.jsx';
import axios from 'axios';

export default function ContainerDetail({ container, onBack }) {
  const [activeTab, setActiveTab] = useState('console');
  const [containerStatus, setContainerStatus] = useState(container.State);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const containerName = (container.Names || [])[0]?.replace('/', '') || container.Id.substring(0, 12);

  async function performAction(action) {
    setLoading(true);
    setError('');
    
    try {
      await axios.post(`/api/containers/${container.Id}/${action}`);
      
      // Update status based on action
      if (action === 'start') setContainerStatus('running');
      else if (action === 'stop') setContainerStatus('exited');
      
      // Refresh container info after a short delay
      setTimeout(async () => {
        try {
          const res = await axios.get('/api/containers');
          const updatedContainer = res.data.find(c => c.Id === container.Id);
          if (updatedContainer) {
            setContainerStatus(updatedContainer.State);
          }
        } catch (err) {
          console.error('Failed to refresh container status:', err);
        }
      }, 1000);
      
    } catch (err) {
      setError(`Failed to ${action} container: ` + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { id: 'console', label: 'Console', icon: '⚡' },
    { id: 'files', label: 'File Manager', icon: '📁' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ];

  return (
    <div className="page">
      <div className="topbar">
        <div className="topbar-left">
          <button className="back-btn" onClick={onBack}>
            ← Back to Containers
          </button>
          <h1>{containerName}</h1>
          <div className="status-badge" data-status={containerStatus}>
            {containerStatus}
          </div>
        </div>
        
        <div className="container-controls">
          <button 
            onClick={() => performAction('start')}
            disabled={loading || containerStatus === 'running'}
            className="action-btn start-btn"
          >
            ▶ Start
          </button>
          <button 
            onClick={() => performAction('stop')}
            disabled={loading || containerStatus !== 'running'}
            className="action-btn stop-btn"
          >
            ⏹ Stop
          </button>
          <button 
            onClick={() => performAction('restart')}
            disabled={loading}
            className="action-btn restart-btn"
          >
            🔄 Restart
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="container-detail">
        <div className="tab-navigation">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tab-content">
          {activeTab === 'console' && (
            <ConsoleView 
              containerId={container.Id} 
              containerStatus={containerStatus}
            />
          )}
          {activeTab === 'files' && (
            <FileManager 
              containerId={container.Id}
              containerStatus={containerStatus}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsView 
              containerId={container.Id}
              containerName={containerName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
