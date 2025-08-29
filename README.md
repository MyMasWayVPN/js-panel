# MyMasWayVPN / js-panel (Complete)

This repo contains a minimal but functional JS Panel to manage Node.js Docker containers with optional Cloudflare Tunnel support.

## Quick install
Run on your server (Debian/Ubuntu):
```bash
bash <(curl -s https://raw.githubusercontent.com/MyMasWayVPN/js-panel/main/installer.sh) install
```

Or clone and install:
```bash
git clone https://github.com/MyMasWayVPN/js-panel.git /opt/js-panel
cd /opt/js-panel
bash installer.sh install
```

## Features
- Login via credentials in backend/.env
- Create/start/stop/restart/delete containers
- Console logs (WebSocket)
- File manager (upload/list/download)
- Settings tab to edit STARTUP_CMD, CF_TUNNEL_ENABLE, CF_TOKEN (will recreate container to apply env)
- Containers are mounted to DATA_DIR on the host (default /opt/js-data)
- entrypoint.sh copied to container will run STARTUP_CMD and auto-start tunnel if enabled

## Notes
- This is a starting point. Secure with HTTPS, harden auth, and run behind a reverse proxy in production.
