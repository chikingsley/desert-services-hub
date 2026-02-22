#!/bin/bash
set -e

echo "Starting permit-worker container..."

# Start VNC stack (sets VNC_PID)
source /app/lib/vnc/start-vnc.sh

# Start the API Server
echo "Starting Server..."
mkdir -p /app/data
cd /app
bun run apps/dust-permits/src/index.ts &
SERVER_PID=$!

echo "All services started."
echo "  - VNC: http://localhost:${NOVNC_PORT:-6080}"
echo "  - Server (API + UI): http://localhost:47822"

wait -n "${VNC_PID}" "${SERVER_PID}"
