import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ConsoleView from './ConsoleView.jsx';
import FileManager from './FileManager.jsx';
import SettingsView from './SettingsView.jsx';

export default function Dashboard({ onLogout }){
  const [containers,setContainers]=useState([]);
  const [selected,setSelected]=useState(null);

  async function load(){
    const res = await axios.get('/api/containers'); setContainers(res.data);
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
          <button onClick={async()=>{ const name = prompt('container name'); if(!name) return; await axios.post('/api/containers',{ name, startupCmd:'node run.js' }); load(); }}>Create</button>
          <div className="list">
            {containers.map(c=>(
              <div key={c.Id} className={'card'+(selected===c.Id?' selected':'')} onClick={()=>setSelected(c.Id)}>
                <div className="name">{(c.Names||[])[0]||c.Id}</div>
                <div className="status">{c.State}</div>
                <div className="actions">
                  <button onClick={async(e)=>{e.stopPropagation(); await axios.post('/api/containers/'+c.Id+'/start'); load();}}>Start</button>
                  <button onClick={async(e)=>{e.stopPropagation(); await axios.post('/api/containers/'+c.Id+'/stop'); load();}}>Stop</button>
                  <button onClick={async(e)=>{e.stopPropagation(); await axios.post('/api/containers/'+c.Id+'/restart'); load();}}>Restart</button>
                  <button onClick={async(e)=>{e.stopPropagation(); if(confirm('delete?')){ await axios.post('/api/containers/'+c.Id+'/delete'); load(); setSelected(null); }}}>Delete</button>
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
