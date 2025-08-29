import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function ContainerGrid({ onSelectContainer, onLogout }) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    startupCmd: 'node run.js',
    cfEnable: false,
    cfToken: ''
  });
  const [loadingMessage, setLoadingMessage] = useState('');

  async function loadContainers() {
    try {
      setLoading(true);
      const res = await axios.get('/api/containers');
      setContainers(res.data);
    } catch (err) {
      setError('Failed to load containers: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContainers();
  }, []);

  async function createContainer() {
    if (!createForm.name.trim()) {
      setError('Container name is required');
      return;
    }
    
    setLoading(true);
    setError('');
    setLoadingMessage('Creating container...');
    
    try {
      setTimeout(() => setLoadingMessage('Pulling Docker image...'), 1000);
      setTimeout(() => setLoadingMessage('Setting up container...'), 3000);
      
      await axios.post('/api/containers', createForm);
      setLoadingMessage('Container created successfully!');
      
      setTimeout(() => {
        setShowCreateForm(false);
        setCreateForm({ name: '', startupCmd: 'node run.js', cfEnable: false, cfToken: '' });
        setLoadingMessage('');
      }, 1000);
      
      await loadContainers();
    } catch (err) {
      setError('Failed to create container: ' + (err.response?.data?.error || err.message));
      setLoadingMessage('');
    } finally {
      setLoading(false);
    }
  }

  async function deleteContainer(containerId, e) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this container? This action cannot be undone.')) {
      return;
    }
    
    try {
      setError('');
      await axios.post(`/api/containers/${containerId}/delete`);
      await loadContainers();
    } catch (err) {
      setError('Failed to delete container: ' + (err.response?.data?.error || err.message));
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <h1>JS Panel - Container Management</h1>
        <button onClick={onLogout}>Logout</button>
      </div>
      
      <div className="container-grid-page">
        <div className="container-grid-header">
          <h2>Select a Container</h2>
          <button 
            className="create-btn" 
            onClick={() => setShowCreateForm(true)}
            disabled={loading}
          >
            + Create New Container
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {loadingMessage && (
          <div className="loading-message">
            <div className="spinner"></div>
            {loadingMessage}
          </div>
        )}

        {showCreateForm && (
          <div className="create-form-modal">
            <div className="create-form">
              <h3>Create New Container</h3>
              
              <label>Container Name *</label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                placeholder="Enter container name"
                disabled={loading}
              />
              
              <label>Startup Command</label>
              <input
                type="text"
                value={createForm.startupCmd}
                onChange={(e) => setCreateForm({...createForm, startupCmd: e.target.value})}
                placeholder="node run.js"
                disabled={loading}
              />
              
              <label>
                <input
                  type="checkbox"
                  checked={createForm.cfEnable}
                  onChange={(e) => setCreateForm({...createForm, cfEnable: e.target.checked})}
                  disabled={loading}
                />
                Enable Cloudflare Tunnel
              </label>
              
              {createForm.cfEnable && (
                <>
                  <label>Cloudflare Token</label>
                  <input
                    type="text"
                    value={createForm.cfToken}
                    onChange={(e) => setCreateForm({...createForm, cfToken: e.target.value})}
                    placeholder="Enter Cloudflare token"
                    disabled={loading}
                  />
                </>
              )}
              
              <div className="form-actions">
                <button onClick={createContainer} disabled={loading}>
                  {loading ? 'Creating...' : 'Create Container'}
                </button>
                <button 
                  onClick={() => {
                    setShowCreateForm(false);
                    setError('');
                    setLoadingMessage('');
                  }} 
                  disabled={loading}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="containers-grid">
          {containers.length === 0 && !loading ? (
            <div className="empty-state">
              <h3>No containers found</h3>
              <p>Create your first container to get started</p>
            </div>
          ) : (
            containers.map(container => (
              <div 
                key={container.Id} 
                className="container-card"
                onClick={() => onSelectContainer(container)}
              >
                <div className="container-header">
                  <h3>{(container.Names || [])[0]?.replace('/', '') || container.Id.substring(0, 12)}</h3>
                  <button 
                    className="delete-btn"
                    onClick={(e) => deleteContainer(container.Id, e)}
                    title="Delete container"
                  >
                    ×
                  </button>
                </div>
                
                <div className="container-info">
                  <div className="status-badge" data-status={container.State}>
                    {container.State}
                  </div>
                  <div className="container-id">
                    ID: {container.Id.substring(0, 12)}
                  </div>
                </div>
                
                <div className="container-image">
                  Image: {container.Image || 'node:18-alpine'}
                </div>
                
                <div className="container-actions">
                  <span className="click-hint">Click to manage →</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
