import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ConsoleView from './ConsoleView.jsx';
import FileManager from './FileManager.jsx';
import SettingsView from './SettingsView.jsx';

export default function Dashboard({ onLogout }){
  const [containers,setContainers]=useState([]);
  const [selected,setSelected]=useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    startupCmd: 'node run.js',
    cfEnable: false,
    cfToken: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('');

  async function load(){
    try {
      const res = await axios.get('/api/containers'); 
      setContainers(res.data);
      setError('');
    } catch (err) {
      setError('Failed to load containers: ' + (err.response?.data?.error || err.message));
    }
  }

  async function handleMigrate(containerId, e) {
    e.stopPropagation();
    if (!confirm('Migrate this container to the new system? This will recreate the container with persistent data directories.')) {
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`/api/containers/${containerId}/migrate`);
      if (response.data.message) {
        setError(`✅ ${response.data.message}`);
        setTimeout(() => setError(''), 3000);
      }
      await load();
    } catch (err) {
      setError('Failed to migrate container: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  }

  function needsMigration(container) {
    return !container.Labels?.['panel.data-dir'];
  }

  async function createContainer() {
    if (!createForm.name.trim()) {
      setError('Container name is required');
      return;
    }
    
    setLoading(true);
    setError('');
    setLoadingMessage('Creating container...');
    
    try {
      // Show different loading messages
      setTimeout(() => setLoadingMessage('Pulling Docker image...'), 1000);
      setTimeout(() => setLoadingMessage('Setting up container...'), 3000);
      
      await axios.post('/api/containers', createForm);
      setLoadingMessage('Container created successfully!');
      
      setTimeout(() => {
        setShowCreateForm(false);
        setCreateForm({ name: '', startupCmd: 'node run.js', cfEnable: false, cfToken: '' });
        setLoadingMessage('');
      }, 1000);
      
      await load();
    } catch (err) {
      setError('Failed to create container: ' + (err.response?.data?.error || err.message));
      setLoadingMessage('');
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{ load(); },[]);

  return (
    <div className="page">
      <header className="topbar">
        <h1>JS Panel</h1>
        <div>
          <button onClick={async()=>{ await axios.post('/api/logout'); onLogout(); }}>Logout</button>
        </div>
      </header>
      <main className="main-grid">
        <aside className="left">
          <h3>Containers</h3>
          
          {error && (
            <div className="error-message" style={{
              background: '#fee', 
              border: '1px solid #fcc', 
              padding: '8px', 
              borderRadius: '4px', 
              marginBottom: '10px',
              fontSize: '14px',
              color: '#c33'
            }}>
              {error}
            </div>
          )}
          
          {loadingMessage && (
            <div className="loading-message" style={{
              background: '#e3f2fd', 
              border: '1px solid #90caf9', 
              padding: '8px', 
              borderRadius: '4px', 
              marginBottom: '10px',
              fontSize: '14px',
              color: '#1565c0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <div style={{
                width: '16px',
                height: '16px',
                border: '2px solid #90caf9',
                borderTop: '2px solid #1565c0',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              {loadingMessage}
            </div>
          )}
          
          {!showCreateForm ? (
            <button onClick={() => setShowCreateForm(true)} disabled={loading}>
              {loading ? 'Creating...' : 'Create Container'}
            </button>
          ) : (
            <div className="create-form" style={{
              border: '1px solid #ddd',
              padding: '10px',
              borderRadius: '4px',
              marginBottom: '10px',
              background: '#f9f9f9'
            }}>
              <h4>Create New Container</h4>
              <div style={{ marginBottom: '8px' }}>
                <label>Name:</label>
                <input 
                  type="text" 
                  value={createForm.name}
                  onChange={(e) => setCreateForm({...createForm, name: e.target.value})}
                  placeholder="container-name"
                  style={{ width: '100%', padding: '4px', marginTop: '2px' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label>Startup Command:</label>
                <input 
                  type="text" 
                  value={createForm.startupCmd}
                  onChange={(e) => setCreateForm({...createForm, startupCmd: e.target.value})}
                  placeholder="node run.js"
                  style={{ width: '100%', padding: '4px', marginTop: '2px' }}
                />
              </div>
              <div style={{ marginBottom: '8px' }}>
                <label>
                  <input 
                    type="checkbox" 
                    checked={createForm.cfEnable}
                    onChange={(e) => setCreateForm({...createForm, cfEnable: e.target.checked})}
                  />
                  Enable Cloudflare Tunnel
                </label>
              </div>
              {createForm.cfEnable && (
                <div style={{ marginBottom: '8px' }}>
                  <label>CF Token:</label>
                  <input 
                    type="text" 
                    value={createForm.cfToken}
                    onChange={(e) => setCreateForm({...createForm, cfToken: e.target.value})}
                    placeholder="cloudflare-token"
                    style={{ width: '100%', padding: '4px', marginTop: '2px' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={createContainer} disabled={loading}>
                  {loading ? 'Creating...' : 'Create'}
                </button>
                <button onClick={() => {
                  setShowCreateForm(false);
                  setError('');
                }} disabled={loading}>
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="list">
            {containers.map(c=>(
              <div key={c.Id} className={'card'+(selected===c.Id?' selected':'')} onClick={()=>setSelected(c.Id)}>
                <div className="name">{(c.Names||[])[0]||c.Id}</div>
                <div className="status" style={{
                  color: c.State === 'running' ? '#28a745' : 
                        c.State === 'exited' ? '#dc3545' : 
                        c.State === 'created' ? '#ffc107' : '#6c757d'
                }}>
                  {c.State}
                </div>
                <div className="actions">
                  {needsMigration(c) && (
                    <button 
                      onClick={(e) => handleMigrate(c.Id, e)}
                      disabled={loading}
                      style={{ 
                        backgroundColor: '#ffc107', 
                        color: '#212529',
                        fontWeight: 'bold',
                        marginBottom: '4px'
                      }}
                      title="Migrate to new persistent data system"
                    >
                      Migrate
                    </button>
                  )}
                  <button 
                    onClick={async(e)=>{
                      e.stopPropagation(); 
                      try {
                        setError('');
                        await axios.post('/api/containers/'+c.Id+'/start'); 
                        await load();
                      } catch (err) {
                        setError('Failed to start container: ' + (err.response?.data?.error || err.message));
                      }
                    }}
                    disabled={loading || c.State === 'running'}
                  >
                    Start
                  </button>
                  <button 
                    onClick={async(e)=>{
                      e.stopPropagation(); 
                      try {
                        setError('');
                        await axios.post('/api/containers/'+c.Id+'/stop'); 
                        await load();
                      } catch (err) {
                        setError('Failed to stop container: ' + (err.response?.data?.error || err.message));
                      }
                    }}
                    disabled={loading || c.State !== 'running'}
                  >
                    Stop
                  </button>
                  <button 
                    onClick={async(e)=>{
                      e.stopPropagation(); 
                      try {
                        setError('');
                        await axios.post('/api/containers/'+c.Id+'/restart'); 
                        await load();
                      } catch (err) {
                        setError('Failed to restart container: ' + (err.response?.data?.error || err.message));
                      }
                    }}
                    disabled={loading}
                  >
                    Restart
                  </button>
                  <button 
                    onClick={async(e)=>{
                      e.stopPropagation(); 
                      if(confirm('Are you sure you want to delete this container? This action cannot be undone.')){ 
                        try {
                          setError('');
                          await axios.post('/api/containers/'+c.Id+'/delete'); 
                          await load(); 
                          setSelected(null);
                        } catch (err) {
                          setError('Failed to delete container: ' + (err.response?.data?.error || err.message));
                        }
                      }
                    }}
                    disabled={loading}
                    style={{ backgroundColor: '#dc3545', color: 'white' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
        <section className="center">
          {selected ? <ConsoleView id={selected} /> : <div>Select a container to view console</div>}
        </section>
        <aside className="right">
          {selected ? <FileManager id={selected} /> : <div>File Manager (select a container)</div>}
          {selected ? <SettingsView id={selected} /> : <div>Settings (select a container)</div>}
        </aside>
      </main>
    </div>
  );
}
