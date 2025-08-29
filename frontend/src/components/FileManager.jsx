import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function FileManager({ id }){
  const [files, setFiles] = useState([]);
  useEffect(()=>{ load(); },[id]);
  async function load(){ const res = await axios.get('/api/containers/'+id+'/files'); setFiles(res.data); }
  async function upload(ev){ const f = ev.target.files[0]; if(!f) return; const fd = new FormData(); fd.append('file', f); fd.append('dest', f.name); await axios.post('/api/containers/'+id+'/files/upload', fd); load(); }
  return (
    <div>
      <h3>Files</h3>
      <input type="file" onChange={upload} />
      <ul>
        {files.map(f=> <li key={f.name}>{f.isDir?'DIR':'FILE'} - {f.name}</li>)}
      </ul>
    </div>
  );
}
