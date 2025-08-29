import React, { useState } from 'react';
import axios from 'axios';
export default function Login({ onLogin }){
  const [user,setUser]=useState('');
  const [pass,setPass]=useState('');
  async function submit(){
    try{
      await axios.post('/api/login',{ username: user, password: pass });
      onLogin();
    }catch(e){ alert('login failed'); }
  }
  return (
    <div className="login">
      <h2>JS Panel</h2>
      <input placeholder="username" value={user} onChange={e=>setUser(e.target.value)} />
      <input placeholder="password" type="password" value={pass} onChange={e=>setPass(e.target.value)} />
      <button onClick={submit}>Login</button>
    </div>
  );
}
