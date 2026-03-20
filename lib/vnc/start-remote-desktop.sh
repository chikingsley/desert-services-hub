#!/bin/bash
set -euo pipefail

REMOTE_DESKTOP_BACKEND="${REMOTE_DESKTOP_BACKEND:-novnc}"

case "${REMOTE_DESKTOP_BACKEND}" in
  novnc)
    source /app/lib/vnc/start-vnc.sh
    ;;
  kasmvnc)
    source /app/lib/vnc/start-kasmvnc.sh
    ;;
  *)
    echo "[remote-desktop] Unsupported backend: ${REMOTE_DESKTOP_BACKEND}" >&2
    exit 1
    ;;
esac
