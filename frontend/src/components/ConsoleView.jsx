import React, { useState, useEffect, useRef } from 'react';

export default function ConsoleView({ containerId, containerStatus }) {
  const [logs, setLogs] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const consoleRef = useRef(null);

  useEffect(() => {
    if (!containerId || containerStatus !== 'running') {
      setLogs('[INFO] Container must be running to view logs\n');
      setConnected(false);
      return;
    }

    // Connect to WebSocket for this specific container
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/logs?id=${containerId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setLogs('[INFO] Connected to container logs\n');
    };

    ws.onmessage = (event) => {
      setLogs(prev => prev + event.data);
      // Auto-scroll to bottom
      setTimeout(() => {
        if (consoleRef.current) {
          consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
      }, 10);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setLogs(prev => prev + '\n[ERROR] Connection to container logs failed\n');
      setConnected(false);
    };

    ws.onclose = () => {
      setLogs(prev => prev + '\n[INFO] Connection closed\n');
      setConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [containerId, containerStatus]);

  const clearLogs = () => {
    setLogs(connected ? '[INFO] Connected to container logs\n' : '[INFO] Container must be running to view logs\n');
  };

  return (
    <div className="console-view">
      <div className="console-header">
        <div className="console-title">
          <h3>Console Output</h3>
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="console-actions">
          <button onClick={clearLogs} className="clear-btn">
            🗑 Clear
          </button>
        </div>
      </div>
      
      <div 
        ref={consoleRef}
        className="console-output"
      >
        <pre>{logs}</pre>
      </div>
      
      {containerStatus !== 'running' && (
        <div className="console-notice">
          <p>⚠️ Container is not running. Start the container to view live logs.</p>
        </div>
      )}
    </div>
  );
}
