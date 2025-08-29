#!/usr/bin/env bash
if [ -z "$CF_TOKEN" ]; then
  echo "[ERROR] CF_TOKEN not set" >&2; exit 1
fi
nohup cloudflared tunnel --no-autoupdate run --token "$CF_TOKEN" >/home/container/tunnel.log 2>&1 &
echo $! > /home/container/tunnel.pid
echo "[INFO] tunnel started"
