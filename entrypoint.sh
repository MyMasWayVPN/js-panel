#!/usr/bin/env bash

# Container entrypoint - runs inside each Docker container
# Working directory should be /home/container (mounted from host)

echo "[ENTRYPOINT] Container startup initiated..."
echo "[ENTRYPOINT] Container ID: ${CONTAINER_ID:-unknown}"
echo "[ENTRYPOINT] Working directory: $(pwd)"
echo "[ENTRYPOINT] User: $(whoami)"
echo "[ENTRYPOINT] Startup CMD: ${STARTUP_CMD:-node run.js}"

# Ensure we're in the correct directory
if [ "$(pwd)" != "/home/container" ]; then
  echo "[ENTRYPOINT] Changing to /home/container..."
  cd /home/container || {
    echo "[ENTRYPOINT] ERROR: Cannot access /home/container directory!"
    echo "[ENTRYPOINT] Current directory contents:"
    ls -la / 2>/dev/null || true
    echo "[ENTRYPOINT] Attempting to create and use /home/container..."
    mkdir -p /home/container 2>/dev/null || true
    cd /home/container || exit 1
  }
fi

echo "[ENTRYPOINT] Final working directory: $(pwd)"
echo "[ENTRYPOINT] Directory contents:"
ls -la . 2>/dev/null || echo "[ENTRYPOINT] Cannot list directory contents"

# Install cloudflared if missing and tunnel is enabled (non-blocking)
if [ "${CF_TUNNEL_ENABLE}" = "1" ] && [ -n "${CF_TOKEN}" ] && ! command -v cloudflared >/dev/null 2>&1; then
  echo "[ENTRYPOINT] Cloudflare tunnel enabled, installing cloudflared..."
  (
    echo "[ENTRYPOINT] Updating package manager..."
    apt-get update -y >/dev/null 2>&1 || {
      echo "[ENTRYPOINT] Package update failed, continuing..."
    }
    
    echo "[ENTRYPOINT] Installing curl..."
    apt-get install -y curl >/dev/null 2>&1 || {
      echo "[ENTRYPOINT] curl installation failed, continuing..."
    }
    
    echo "[ENTRYPOINT] Downloading cloudflared..."
    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared >/dev/null 2>&1 || {
      echo "[ENTRYPOINT] cloudflared download failed"
      exit 1
    }
    
    chmod +x /usr/local/bin/cloudflared 2>/dev/null || {
      echo "[ENTRYPOINT] Failed to make cloudflared executable"
      exit 1
    }
    
    echo "[ENTRYPOINT] cloudflared installation completed"
  ) &
  CLOUDFLARED_PID=$!
elif [ "${CF_TUNNEL_ENABLE}" = "1" ] && command -v cloudflared >/dev/null 2>&1; then
  echo "[ENTRYPOINT] cloudflared already available"
fi

# Place helper scripts if present in /home/container (copied by host)
if [ -f "tunnel-on.sh" ]; then
  echo "[ENTRYPOINT] Setting up tunnel-on script..."
  cp tunnel-on.sh /usr/local/bin/tunnel-on 2>/dev/null || true
  chmod +x /usr/local/bin/tunnel-on 2>/dev/null || true
fi
if [ -f "tunnel-off.sh" ]; then
  echo "[ENTRYPOINT] Setting up tunnel-off script..."
  cp tunnel-off.sh /usr/local/bin/tunnel-off 2>/dev/null || true
  chmod +x /usr/local/bin/tunnel-off 2>/dev/null || true
fi

# Create a simple default app if no main files exist
if [ ! -f "package.json" ] && [ ! -f "run.js" ] && [ ! -f "index.js" ] && [ ! -f "server.js" ] && [ ! -f "app.js" ]; then
  echo "[ENTRYPOINT] No application files found, creating default Node.js app..."
  
  cat > package.json << 'EOF'
{
  "name": "default-app",
  "version": "1.0.0",
  "main": "run.js",
  "scripts": {
    "start": "node run.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

  cat > run.js << 'EOF'
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to JS Panel Container</h1>
    <p>Container ID: ${process.env.CONTAINER_ID || 'unknown'}</p>
    <p>This is a default Node.js application.</p>
    <p>Upload your files using the File Manager to replace this app.</p>
    <p>Server started at: ${new Date().toISOString()}</p>
  `);
});

app.listen(port, '0.0.0.0', () => {
  console.log(\`Server running on port \${port}\`);
  console.log(\`Container ID: \${process.env.CONTAINER_ID || 'unknown'}\`);
});
EOF

  echo "[ENTRYPOINT] Created default application files"
fi

# Wait for cloudflared installation to complete if it was started
if [ -n "$CLOUDFLARED_PID" ]; then
  wait $CLOUDFLARED_PID 2>/dev/null || true
fi

# Auto-start tunnel if enabled
if [ "${CF_TUNNEL_ENABLE}" = "1" ] && [ -n "${CF_TOKEN}" ]; then
  echo "[ENTRYPOINT] Starting Cloudflare tunnel..."
  if command -v cloudflared >/dev/null 2>&1; then
    nohup cloudflared tunnel --no-autoupdate run --token "${CF_TOKEN}" >tunnel.log 2>&1 &
    echo $! > tunnel.pid
    echo "[ENTRYPOINT] Cloudflare tunnel started with PID $(cat tunnel.pid)"
  else
    echo "[ENTRYPOINT] WARNING: cloudflared not available, skipping tunnel"
  fi
fi

# Ensure dependencies for node app
if [ -f "package.json" ]; then
  echo "[ENTRYPOINT] Found package.json, installing npm dependencies..."
  
  # Check if node_modules already exists and has content
  if [ -d "node_modules" ] && [ "$(ls -A node_modules 2>/dev/null)" ]; then
    echo "[ENTRYPOINT] node_modules already exists, skipping npm install"
  else
    echo "[ENTRYPOINT] Installing npm dependencies..."
    
    # Try npm install with different strategies
    if npm install --production --no-audit --no-fund 2>/dev/null; then
      echo "[ENTRYPOINT] npm install completed successfully"
    elif npm install --production --force --no-audit --no-fund 2>/dev/null; then
      echo "[ENTRYPOINT] npm install completed with --force"
    elif npm install --production --legacy-peer-deps --no-audit --no-fund 2>/dev/null; then
      echo "[ENTRYPOINT] npm install completed with --legacy-peer-deps"
    else
      echo "[ENTRYPOINT] npm install failed with all strategies, continuing anyway..."
      echo "[ENTRYPOINT] You may need to install dependencies manually"
    fi
  fi
else
  echo "[ENTRYPOINT] No package.json found, skipping npm install"
fi

# Validate and fix startup command
STARTUP_CMD="${STARTUP_CMD:-node run.js}"
echo "[ENTRYPOINT] Validating startup command: $STARTUP_CMD"

# Extract node file from command if it's a node command
if [[ "$STARTUP_CMD" == *"node "* ]]; then
  # Extract the file name after 'node '
  NODE_FILE=$(echo "$STARTUP_CMD" | sed -n 's/.*node[[:space:]]\+\([^[:space:]]*\).*/\1/p')
  
  if [ -n "$NODE_FILE" ] && [ ! -f "$NODE_FILE" ]; then
    echo "[ENTRYPOINT] Warning: $NODE_FILE not found, trying alternatives..."
    
    # Try common alternatives in order of preference
    if [ -f "run.js" ]; then
      STARTUP_CMD="node run.js"
      echo "[ENTRYPOINT] Using run.js instead"
    elif [ -f "index.js" ]; then
      STARTUP_CMD="node index.js"
      echo "[ENTRYPOINT] Using index.js instead"
    elif [ -f "server.js" ]; then
      STARTUP_CMD="node server.js"
      echo "[ENTRYPOINT] Using server.js instead"
    elif [ -f "app.js" ]; then
      STARTUP_CMD="node app.js"
      echo "[ENTRYPOINT] Using app.js instead"
    else
      echo "[ENTRYPOINT] No suitable Node.js file found, keeping original command"
    fi
  fi
fi
clear
# Final startup
echo "[ENTRYPOINT] ================================"
echo "[ENTRYPOINT] Ready to start application"
echo "[ENTRYPOINT] Command: $STARTUP_CMD"
echo "[ENTRYPOINT] Working directory: $(pwd)"
echo "[ENTRYPOINT] Files in directory:"
ls -la . 2>/dev/null || echo "[ENTRYPOINT] Cannot list files"
echo "[ENTRYPOINT] ================================"

# Final validation before startup
if [[ "$STARTUP_CMD" == *"node "* ]]; then
  # Check if node is available
  if ! command -v node >/dev/null 2>&1; then
    echo "[ENTRYPOINT] ERROR: Node.js is not installed in this container!"
    echo "[ENTRYPOINT] Available commands:"
    which node npm 2>/dev/null || echo "[ENTRYPOINT] node and npm not found"
    exit 1
  fi
  
  echo "[ENTRYPOINT] Node.js version: $(node --version 2>/dev/null || echo 'unknown')"
  echo "[ENTRYPOINT] npm version: $(npm --version 2>/dev/null || echo 'unknown')"
fi

# Execute the startup command
echo "[ENTRYPOINT] Executing: $STARTUP_CMD"
exec bash -c "$STARTUP_CMD"
