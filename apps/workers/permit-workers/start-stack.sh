#!/bin/bash
set -e

echo "Starting permit-worker container..."

# Resolve display and matching VNC TCP port.
# VNC listens on 5900 + display number (e.g. :1 -> 5901).
DISPLAY="${DISPLAY:-:1}"
DISPLAY_NUM="${DISPLAY#*:}"
DISPLAY_NUM="${DISPLAY_NUM%%.*}"
if [[ -z "${DISPLAY_NUM}" || ! "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  DISPLAY_NUM=1
fi
VNC_TCP_PORT=$((5900 + DISPLAY_NUM))

# 1. Start Xvnc (TigerVNC - provides both X server and VNC)
echo "Starting Xvnc on $DISPLAY..."
# -SecurityTypes None: No password
# -AlwaysShared: Allow multiple clients
Xvnc $DISPLAY -geometry ${VNC_RESOLUTION:-1280x720} -SecurityTypes None -AlwaysShared > /dev/null 2>&1 &
XPID=$!
sleep 2

# 2. Start Window Manager (Openbox)
echo "Starting Openbox..."
export DISPLAY
openbox-session > /dev/null 2>&1 &
sleep 1

# 3. Start noVNC (Websocket proxy)
echo "Starting noVNC on port 6080 (proxying localhost:${VNC_TCP_PORT})..."
websockify --web /usr/share/novnc 6080 "localhost:${VNC_TCP_PORT}" > /dev/null 2>&1 &

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
