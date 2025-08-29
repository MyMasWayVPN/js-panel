#!/usr/bin/env bash
set -e
APP_DIR="/opt/js-panel"
SERVICE_NAME="js-panel"
REPO_URL="https://github.com/MyMasWayVPN/js-panel.git"

function install_panel(){
  echo "[INFO] Installing panel from $REPO_URL"
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  pushd "$APP_DIR/backend"
  npm install --production
  popd
  # systemd service
  cat >/etc/systemd/system/$SERVICE_NAME.service <<EOF
[Unit]
Description=JS Panel Backend
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now $SERVICE_NAME
  echo "[INFO] Installed and started service $SERVICE_NAME"
}

function update_panel(){
  echo "[INFO] Updating panel"
  pushd "$APP_DIR" || exit 1
  git pull origin main || git pull || true
  popd
  pushd "$APP_DIR/backend"
  npm install --production || true
  systemctl restart $SERVICE_NAME || true
  popd
}

function reinstall_panel(){
  echo "[INFO] Reinstalling panel"
  systemctl stop $SERVICE_NAME || true
  docker ps -a --filter "label=js-panel" -q | xargs -r docker rm -f || true
  rm -rf "$APP_DIR"
  install_panel
}

function uninstall_panel(){
  echo "[INFO] Uninstalling panel"
  systemctl stop $SERVICE_NAME || true
  systemctl disable $SERVICE_NAME || true
  rm -f /etc/systemd/system/$SERVICE_NAME.service || true
  rm -rf "$APP_DIR" || true
  systemctl daemon-reload || true
  echo "[INFO] Uninstalled"
}

case "$1" in
  install) install_panel ;;
  update) update_panel ;;
  reinstall) reinstall_panel ;;
  uninstall) uninstall_panel ;;
  *) echo "Usage: $0 {install|update|reinstall|uninstall}" ;;
esac
