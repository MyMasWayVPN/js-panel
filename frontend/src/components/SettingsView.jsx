import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SettingsView({ containerId, containerName }) {
  const [settings, setSettings] = useState({
    startupCmd: '',
    cfEnable: false,
    cfToken: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadSettings();
  }, [containerId]);

  async function loadSettings() {
    try {
      // Try to get current settings from container environment or use defaults
      setSettings({
        startupCmd: 'node run.js',
        cfEnable: false,
        cfToken: ''
      });
    } catch (err) {
      setError('Failed to load settings: ' + (err.response?.data?.error || err.message));
    }
  }

  async function saveSettings() {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await axios.post(`/api/containers/${containerId}/settings`, settings);
      setSuccess('Settings saved successfully! Container will be recreated with new settings.');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Failed to save settings: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h3>Container Settings</h3>
        <p className="settings-description">
          Modify container configuration. Changes will recreate the container.
        </p>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {success && (
        <div className="success-message">
          {success}
        </div>
      )}

      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="containerName">Container Name</label>
          <input
            id="containerName"
            type="text"
            value={containerName}
            disabled
            className="readonly-input"
          />
          <small>Container name cannot be changed</small>
        </div>

        <div className="form-group">
          <label htmlFor="startupCmd">Startup Command</label>
          <input
            id="startupCmd"
            type="text"
            value={settings.startupCmd}
            onChange={(e) => setSettings({...settings, startupCmd: e.target.value})}
            placeholder="node run.js"
            disabled={loading}
          />
          <small>Command to run when container starts</small>
        </div>

        <div className="form-group">
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.cfEnable}
                onChange={(e) => setSettings({...settings, cfEnable: e.target.checked})}
                disabled={loading}
              />
              <span className="checkbox-text">Enable Cloudflare Tunnel</span>
            </label>
          </div>
          <small>Enable Cloudflare Tunnel for external access</small>
        </div>

        {settings.cfEnable && (
          <div className="form-group">
            <label htmlFor="cfToken">Cloudflare Token</label>
            <input
              id="cfToken"
              type="password"
              value={settings.cfToken}
              onChange={(e) => setSettings({...settings, cfToken: e.target.value})}
              placeholder="Enter your Cloudflare tunnel token"
              disabled={loading}
            />
            <small>Your Cloudflare tunnel token for external access</small>
          </div>
        )}

        <div className="form-actions">
          <button 
            onClick={saveSettings} 
            disabled={loading}
            className="save-btn"
          >
            {loading ? 'Saving...' : 'Save Settings'}
          </button>
          <button 
            onClick={loadSettings} 
            disabled={loading}
            className="reset-btn"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="settings-info">
        <h4>Important Notes:</h4>
        <ul>
          <li>Changing settings will stop and recreate the container</li>
          <li>All running processes in the container will be terminated</li>
          <li>Container data in mounted volumes will be preserved</li>
          <li>The container will restart automatically after applying changes</li>
        </ul>
      </div>
    </div>
  );
}
