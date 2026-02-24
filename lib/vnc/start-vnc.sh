#!/bin/bash
# =============================================================================
# Shared VNC startup script
# =============================================================================
# Source this from container start-stack.sh scripts.
#
# Required env:
#   DISPLAY         — X display (default :1)
#   VNC_RESOLUTION  — Xvnc geometry (default 1280x720)
#
# Optional env:
#   NOVNC_PORT      — WebSocket listener (default 6080)
#
# After sourcing, VNC_PID is set to the Xvnc process PID for use in `wait -n`.
# =============================================================================

DISPLAY="${DISPLAY:-:1}"
DISPLAY_NUM="${DISPLAY#*:}"
DISPLAY_NUM="${DISPLAY_NUM%%.*}"
if [[ -z "${DISPLAY_NUM}" || ! "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  DISPLAY_NUM=1
fi
VNC_TCP_PORT=$((5900 + DISPLAY_NUM))
NOVNC_PORT="${NOVNC_PORT:-6080}"

# Clean stale lock files from previous container restarts
rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"

echo "[vnc] Starting Xvnc on ${DISPLAY} (${VNC_RESOLUTION:-1280x720})..."
Xvnc "${DISPLAY}" \
  -geometry "${VNC_RESOLUTION:-1280x720}" \
  -SecurityTypes None \
  -AlwaysShared \
  > /dev/null 2>&1 &
VNC_PID="$!"
sleep 2

echo "[vnc] Starting Openbox..."
export DISPLAY
openbox-session > /dev/null 2>&1 &
sleep 1

echo "[vnc] Starting noVNC on port ${NOVNC_PORT} (proxying localhost:${VNC_TCP_PORT})..."
websockify --web /usr/share/novnc "${NOVNC_PORT}" "localhost:${VNC_TCP_PORT}" > /dev/null 2>&1 &

echo "[vnc] VNC stack ready: http://localhost:${NOVNC_PORT}"
