#!/usr/bin/env bash
set -e
cd /home/container || exit 0

# Install cloudflared if missing (non-blocking)
if ! command -v cloudflared >/dev/null 2>&1; then
  apt-get update -y || true
  apt-get install -y curl || true
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared || true
  chmod +x /usr/local/bin/cloudflared || true
fi

# Place helper scripts if present in /home/container (copied by host)
if [ -f /home/container/tunnel-on.sh ]; then
  mv /home/container/tunnel-on.sh /usr/local/bin/tunnel-on 2>/dev/null || true
  chmod +x /usr/local/bin/tunnel-on 2>/dev/null || true
fi
if [ -f /home/container/tunnel-off.sh ]; then
  mv /home/container/tunnel-off.sh /usr/local/bin/tunnel-off 2>/dev/null || true
  chmod +x /usr/local/bin/tunnel-off 2>/dev/null || true
fi

# Auto-start tunnel if enabled
if [ "${CF_TUNNEL_ENABLE}" = "1" ] && [ -n "${CF_TOKEN}" ]; then
  nohup cloudflared tunnel --no-autoupdate run --token "${CF_TOKEN}" >/home/container/tunnel.log 2>&1 &
  echo $! > /home/container/tunnel.pid
fi

# Ensure dependencies for node app
if [ -f package.json ] && [ ! -d node_modules ]; then
  npm install --production || true
fi

# Run the startup command (from STARTUP_CMD env)
exec bash -lc "${STARTUP_CMD:-'node run.js'}"
