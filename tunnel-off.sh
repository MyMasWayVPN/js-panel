#!/usr/bin/env bash
if [ -f /home/container/tunnel.pid ]; then
  kill "$(cat /home/container/tunnel.pid)" || true
  rm -f /home/container/tunnel.pid
  echo "[INFO] tunnel stopped"
else
  pkill cloudflared || true
  echo "[WARN] no tunnel found"
fi
