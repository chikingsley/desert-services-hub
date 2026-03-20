#!/bin/bash
# =============================================================================
# Shared KasmVNC startup script
# =============================================================================

set -euo pipefail

DISPLAY="${DISPLAY:-:1}"
DISPLAY_NUM="${DISPLAY#*:}"
DISPLAY_NUM="${DISPLAY_NUM%%.*}"
if [[ -z "${DISPLAY_NUM}" || ! "${DISPLAY_NUM}" =~ ^[0-9]+$ ]]; then
  DISPLAY_NUM=1
fi

KASMVNC_PORT="${KASMVNC_PORT:-8444}"
KASMVNC_REQUIRE_SSL="${KASMVNC_REQUIRE_SSL:-false}"
KASMVNC_USERNAME="${KASMVNC_USERNAME:-operator}"
KASMVNC_PASSWORD="${KASMVNC_PASSWORD:-desertservices}"
KASMVNC_PUBLIC_IP="${KASMVNC_PUBLIC_IP:-}"
KASMVNC_UDP_PORT="${KASMVNC_UDP_PORT:-${KASMVNC_PORT}}"
KASMVNC_DISABLE_BASIC_AUTH="${KASMVNC_DISABLE_BASIC_AUTH:-1}"
VNC_RESOLUTION="${VNC_RESOLUTION:-1280x720}"
VNC_WIDTH="${VNC_RESOLUTION%x*}"
VNC_HEIGHT="${VNC_RESOLUTION#*x}"
DE_SELECTED_SENTINEL="${HOME}/.vnc/.de-was-selected"
PID_FILE="${HOME}/.vnc/$(hostname):${DISPLAY_NUM}.pid"

rm -f "/tmp/.X${DISPLAY_NUM}-lock" "/tmp/.X11-unix/X${DISPLAY_NUM}"
mkdir -p "${HOME}/.vnc"

cat > "${HOME}/.vnc/kasmvnc.yaml" <<EOF
desktop:
  resolution:
    width: ${VNC_WIDTH}
    height: ${VNC_HEIGHT}
  allow_resize: true
  pixel_depth: 24
network:
  protocol: http
  interface: 0.0.0.0
  websocket_port: ${KASMVNC_PORT}
  udp:
    port: ${KASMVNC_UDP_PORT}
EOF

if [[ -n "${KASMVNC_PUBLIC_IP}" ]]; then
  cat >> "${HOME}/.vnc/kasmvnc.yaml" <<EOF
    public_ip: ${KASMVNC_PUBLIC_IP}
EOF
fi

cat >> "${HOME}/.vnc/kasmvnc.yaml" <<EOF
  ssl:
    require_ssl: ${KASMVNC_REQUIRE_SSL}
EOF

printf '#!/bin/bash\nexec openbox-session\n' > "${HOME}/.vnc/xstartup"
chmod +x "${HOME}/.vnc/xstartup"
touch "${DE_SELECTED_SENTINEL}"

rm -f "${HOME}/.kasmpasswd"
printf '%s\n%s\n' "${KASMVNC_PASSWORD}" "${KASMVNC_PASSWORD}" | \
  vncpasswd -u "${KASMVNC_USERNAME}" -ow >/dev/null

echo "[kasmvnc] Starting vncserver on ${DISPLAY} (${VNC_RESOLUTION})..."
vncserver "${DISPLAY}" \
  -DisableBasicAuth "${KASMVNC_DISABLE_BASIC_AUTH}" \
  -geometry "${VNC_RESOLUTION}" \
  -depth 24 \
  -xstartup "${HOME}/.vnc/xstartup" >/dev/null 2>&1
sleep 2

VNC_PID=""
if [[ -f "${PID_FILE}" ]]; then
  VNC_PID="$(tr -d '\n' < "${PID_FILE}")"
fi

if [[ -z "${VNC_PID}" ]]; then
  VNC_PID="$(pgrep -n -f "(Xvnc|Xkasmvnc).*${DISPLAY}" || true)"
fi

if [[ -z "${VNC_PID}" ]]; then
  echo "[kasmvnc] Failed to locate Xvnc process for ${DISPLAY}" >&2
  exit 1
fi

echo "[kasmvnc] KasmVNC ready: http://localhost:${KASMVNC_PORT}"
