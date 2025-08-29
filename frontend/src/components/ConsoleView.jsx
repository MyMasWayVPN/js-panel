import React, { useEffect, useRef, useState } from 'react';

export default function ConsoleView({ id }){
  const [logs, setLogs] = useState('');
  const wsRef = useRef(null);
  useEffect(()=>{
    setLogs('');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(proto+'://'+location.host+'/ws/logs?id='+id);
    ws.onmessage = e => setLogs(s=> s + e.data);
    wsRef.current = ws;
    return ()=> ws.close();
  },[id]);
  return (
    <div>
      <h3>Console</h3>
      <pre className="console">{logs}</pre>
    </div>
  );
}
