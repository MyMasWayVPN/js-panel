import React, { useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import Login from './components/Login.jsx';

export default function App(){
  const [authed, setAuthed] = useState(false);
  return authed ? <Dashboard onLogout={()=>setAuthed(false)} /> : <Login onLogin={()=>setAuthed(true)} />;
}
