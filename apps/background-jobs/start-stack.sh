#!/bin/bash
set -euo pipefail

echo "Starting background-jobs container..."

VNC_ENABLED="${BACKGROUND_JOBS_VNC_ENABLED:-1}"
DISPLAY="${DISPLAY:-:1}"
DISPLAY_NUM="${DISPLAY#*:}"
DISPLAY_NUM="${DISPLAY_NUM%%.*}"
if [[ -z "${DISPLAY_NUM}" || ! "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  DISPLAY_NUM=1
fi

VNC_TCP_PORT=$((5900 + DISPLAY_NUM))
NOVNC_PORT="${BACKGROUND_JOBS_VNC_PORT:-6080}"
XPID=""

if [[ "${VNC_ENABLED}" != "0" ]]; then
  echo "Starting Xvnc on ${DISPLAY}..."
  Xvnc "${DISPLAY}" -geometry "${BACKGROUND_JOBS_VNC_RESOLUTION:-1600x1200}" -SecurityTypes None -AlwaysShared > /dev/null 2>&1 &
  XPID="$!"
  sleep 2

  echo "Starting Openbox..."
  export DISPLAY
  openbox-session > /dev/null 2>&1 &
  sleep 1

  echo "Starting noVNC on port ${NOVNC_PORT} (proxying localhost:${VNC_TCP_PORT})..."
  websockify --web /usr/share/novnc "${NOVNC_PORT}" "localhost:${VNC_TCP_PORT}" > /dev/null 2>&1 &
fi

mkdir -p /app/data
cd /app

echo "Starting webhook server..."
bun run apps/background-jobs/webhooks.ts &
SERVER_PID=$!

echo "Background-jobs stack started."
if [[ "${VNC_ENABLED}" != "0" ]]; then
  echo "  - noVNC: http://localhost:${NOVNC_PORT}"
fi
echo "  - API: http://localhost:${WEBHOOK_PORT:-4747}"

if [[ -n "${XPID}" ]]; then
  wait -n "${XPID}" "${SERVER_PID}"
else
  wait "${SERVER_PID}"
fi
