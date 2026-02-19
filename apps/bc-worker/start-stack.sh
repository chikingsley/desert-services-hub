#!/bin/bash
set -e

echo "Starting bc-worker container..."

# Start VNC stack (sets VNC_PID)
source /infra/vnc/start-vnc.sh

# Start the API server
echo "Starting BC auth API server..."
mkdir -p /app/data
cd /app
bun run apps/bc-worker/src/index.ts &
SERVER_PID=$!

echo "BC worker started."
echo "  - VNC: http://localhost:${NOVNC_PORT:-6080}"
echo "  - API: http://localhost:47824"

wait -n "${VNC_PID}" "${SERVER_PID}"
