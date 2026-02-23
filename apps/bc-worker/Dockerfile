# syntax=docker/dockerfile:1

# =============================================================================
# Desert Services Hub - BC Worker Dockerfile
# =============================================================================
# BuildingConnected auth bootstrap: headed Playwright + VNC + Bun.
# Manual 2FA / CAPTCHA completion via noVNC, saves auth state for background-jobs.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install JS dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install || true

# -----------------------------------------------------------------------------
# Stage 2: Production image (Playwright + VNC + Bun)
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner

# VNC stack + clipboard tools (xdotool/xclip for X11 clipboard bridge)
RUN apt-get update && apt-get install -y --no-install-recommends \
  unzip \
  tigervnc-standalone-server \
  tigervnc-common \
  tigervnc-tools \
  novnc \
  websockify \
  openbox \
  xdotool \
  xclip \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# Install Bun
COPY --from=oven/bun:1.2 /usr/local/bin/bun /usr/local/bin/bun
ENV PATH="/usr/local/bin:${PATH}"

# Openbox auto-start with VNC
RUN mkdir -p ~/.vnc && \
  printf '#!/bin/bash\nexec openbox-session\n' > ~/.vnc/xstartup && \
  chmod +x ~/.vnc/xstartup

WORKDIR /app

# JS deps
COPY --from=deps /app/node_modules ./node_modules

# Config files
COPY package.json tsconfig.json tsconfig.base.json bunfig.toml ./

# BC worker source
COPY apps/bc-worker/src ./apps/bc-worker/src

# VNC startup script
COPY lib/vnc ./lib/vnc
RUN chmod +x /app/lib/vnc/start-vnc.sh

# Startup script
COPY apps/bc-worker/start-stack.sh /start-stack.sh
RUN chmod +x /start-stack.sh

# Data directories
RUN mkdir -p /app/data

# 6080 = noVNC web interface, 47824 = API server
EXPOSE 6080 47824

ENV DISPLAY=:1
ENV HEADLESS=false
ENV NODE_ENV=production

ENTRYPOINT ["/start-stack.sh"]
