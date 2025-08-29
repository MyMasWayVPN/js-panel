import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function SettingsView({ id }){
  const [env, setEnv] = useState({});
  const [form, setForm] = useState({STARTUP_CMD:'node run.js', CF_TUNNEL_ENABLE:'0', CF_TOKEN:''});
  useEffect(()=>{ fetchEnv(); },[id]);
  async function fetchEnv(){ const res = await axios.get('/api/containers/'+id+'/env'); setEnv(res.data); setForm({ STARTUP_CMD: res.data.STARTUP_CMD || 'node run.js', CF_TUNNEL_ENABLE: res.data.CF_TUNNEL_ENABLE || '0', CF_TOKEN: '' }); }
  async function save(){ await axios.post('/api/containers/'+id+'/settings', { STARTUP_CMD: form.STARTUP_CMD, CF_TUNNEL_ENABLE: form.CF_TUNNEL_ENABLE, CF_TOKEN: form.CF_TOKEN }); alert('saved'); }
  return (
    <div>
      <h3>Settings</h3>
      <label>Startup Command</label>
      <input value={form.STARTUP_CMD} onChange={e=>setForm({...form, STARTUP_CMD:e.target.value})} />
      <label>Enable Cloudflare Tunnel</label>
      <select value={form.CF_TUNNEL_ENABLE} onChange={e=>setForm({...form, CF_TUNNEL_ENABLE:e.target.value})}>
        <option value="0">Off</option><option value="1">On</option>
      </select>
      <label>CF Token</label>
      <input value={form.CF_TOKEN} onChange={e=>setForm({...form, CF_TOKEN:e.target.value})} />
      <button onClick={save}>Save</button>
    </div>
  );
}
