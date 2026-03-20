# syntax=docker/dockerfile:1

# =============================================================================
# Desert Services Hub - Permit Worker Dockerfile
# =============================================================================
# Playwright + remote desktop + Bun for browser automation with visual feedback.
# Supports the legacy TigerVNC/noVNC stack and a KasmVNC variant from the same
# application codebase.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install JS dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1.3 AS deps
WORKDIR /app

# Copy root package files
COPY package.json bun.lock ./

# Install root deps (some platform-specific packages may fail on Linux)
RUN bun install || true

# -----------------------------------------------------------------------------
# Stage 2: Production image (Playwright + VNC + Bun)
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner

ARG REMOTE_DESKTOP_BACKEND=novnc
ARG KASMVNC_VERSION=1.4.0

# Install remote desktop components + unzip (needed for Bun)
RUN set -eux; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    dbus-x11 \
    openbox \
    unzip \
    xauth; \
  if [ "${REMOTE_DESKTOP_BACKEND}" = "novnc" ]; then \
    apt-get install -y --no-install-recommends \
      novnc \
      tigervnc-common \
      tigervnc-standalone-server \
      tigervnc-tools \
      websockify; \
    ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html; \
  elif [ "${REMOTE_DESKTOP_BACKEND}" = "kasmvnc" ]; then \
    arch="$(dpkg --print-architecture)"; \
    curl -fsSL \
      -o /tmp/kasmvncserver.deb \
      "https://github.com/kasmtech/KasmVNC/releases/download/v${KASMVNC_VERSION}/kasmvncserver_noble_${KASMVNC_VERSION}_${arch}.deb"; \
    apt-get install -y --no-install-recommends /tmp/kasmvncserver.deb; \
    rm -f /tmp/kasmvncserver.deb; \
  else \
    echo "Unsupported REMOTE_DESKTOP_BACKEND=${REMOTE_DESKTOP_BACKEND}" >&2; \
    exit 1; \
  fi; \
  rm -rf /var/lib/apt/lists/*

# Install Bun
COPY --from=oven/bun:1.3 /usr/local/bin/bun /usr/local/bin/bun
ENV PATH="/usr/local/bin:${PATH}"

# Configure openbox to start automatically with VNC
RUN mkdir -p ~/.vnc && \
  printf '#!/bin/bash\nexec openbox-session\n' > ~/.vnc/xstartup && \
  chmod +x ~/.vnc/xstartup

WORKDIR /app

# Copy JS deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Config files
COPY package.json tsconfig.json tsconfig.base.json ./
COPY apps/dust-permits/package.json ./apps/dust-permits/
COPY apps/dust-permits/tsconfig.json ./apps/dust-permits/

# Permit worker source
COPY apps/dust-permits/src ./apps/dust-permits/src

# Shared libraries (needed for @lib/* imports)
COPY lib ./lib

# Shared VNC startup (already in lib/ from COPY lib above)
RUN chmod +x /app/lib/vnc/start-vnc.sh
RUN chmod +x /app/lib/vnc/start-kasmvnc.sh /app/lib/vnc/start-remote-desktop.sh

# Startup script
COPY apps/dust-permits/start-stack.sh /start-stack.sh
RUN chmod +x /start-stack.sh

# Data + temp directories
RUN mkdir -p /app/data /app/tmp

# Expose ports
# 6080 = noVNC web interface (legacy)
# 8444 = KasmVNC browser client + websocket/webrtc port
# 47822 = API server (also serves frontend)
EXPOSE 6080 8444/tcp 8444/udp 47822

# Environment Defaults
ENV DISPLAY=:1
ENV HEADLESS=false
ENV NODE_ENV=production
ENV REMOTE_DESKTOP_BACKEND=novnc

# Start everything: VNC + Server
ENTRYPOINT ["/start-stack.sh"]
