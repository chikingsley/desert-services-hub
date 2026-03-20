#!/bin/bash
set -e

echo "Starting permit-worker container..."

# Start remote desktop stack (sets VNC_PID)
source /app/lib/vnc/start-remote-desktop.sh

# Start the API Server
echo "Starting Server..."
mkdir -p /app/data
cd /app
bun run apps/dust-permits/src/index.ts &
SERVER_PID=$!

echo "All services started."
if [ "${REMOTE_DESKTOP_BACKEND:-novnc}" = "kasmvnc" ]; then
  echo "  - KasmVNC: http://localhost:${KASMVNC_PORT:-8444}"
else
  echo "  - VNC: http://localhost:${NOVNC_PORT:-6080}"
fi
echo "  - Server (API + UI): http://localhost:47822"

if [ "${REMOTE_DESKTOP_BACKEND:-novnc}" = "kasmvnc" ]; then
  while true; do
    if ! kill -0 "${VNC_PID}" 2>/dev/null; then
      echo "[kasmvnc] Xvnc process exited." >&2
      exit 1
    fi
    if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      wait "${SERVER_PID}"
      exit $?
    fi
    sleep 2
  done
fi

wait -n "${VNC_PID}" "${SERVER_PID}"
