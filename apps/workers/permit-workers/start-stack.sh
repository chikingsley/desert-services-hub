#!/bin/bash
set -e

echo "Starting permit-worker container..."

# 1. Start Xvnc (TigerVNC - provides both X server and VNC)
echo "Starting Xvnc on $DISPLAY..."
# -SecurityTypes None: No password
# -AlwaysShared: Allow multiple clients
Xvnc $DISPLAY -geometry ${VNC_RESOLUTION:-1280x720} -SecurityTypes None -AlwaysShared > /dev/null 2>&1 &
XPID=$!
sleep 2

# 2. Start Window Manager (Openbox)
echo "Starting Openbox..."
export DISPLAY=:1
openbox-session > /dev/null 2>&1 &
sleep 1

# 3. Start noVNC (Websocket proxy)
echo "Starting noVNC on port 6080..."
websockify --web /usr/share/novnc 6080 localhost:5900 > /dev/null 2>&1 &

# 4. Start the API Server (also serves frontend)
echo "Starting Server..."
mkdir -p /app/data
cd /app
bun run apps/workers/permit-workers/src/index.ts &
SERVER_PID=$!

echo "All services started."
echo "  - VNC: http://localhost:6080"
echo "  - Server (API + UI): http://localhost:47822"

# Wait for any process to exit
wait -n $XPID $SERVER_PID
