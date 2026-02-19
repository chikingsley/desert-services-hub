# syntax=docker/dockerfile:1

# =============================================================================
# Desert Services Hub - Permit Worker Dockerfile
# =============================================================================
# Playwright + VNC + Bun for browser automation with visual feedback.
# Portal scraping, permit sync, and dust permit automation.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install JS dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy root package files
COPY package.json bun.lock ./

# Install root deps (some platform-specific packages may fail on Linux)
RUN bun install || true

# -----------------------------------------------------------------------------
# Stage 2: Production image (Playwright + VNC + Bun)
# -----------------------------------------------------------------------------
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner

# Install VNC components + unzip (needed for Bun)
RUN apt-get update && apt-get install -y --no-install-recommends \
  unzip \
  tigervnc-standalone-server \
  tigervnc-common \
  tigervnc-tools \
  novnc \
  websockify \
  openbox \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# Install Bun
COPY --from=oven/bun:1.2 /usr/local/bin/bun /usr/local/bin/bun
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

# Permit worker source + tests
COPY apps/dust-permits/src ./apps/dust-permits/src
COPY apps/dust-permits/tests ./apps/dust-permits/tests

# Shared libraries (needed for @lib/* imports)
COPY lib ./lib

# Shared VNC startup
COPY infra/vnc/start-vnc.sh /infra/vnc/start-vnc.sh
RUN chmod +x /infra/vnc/start-vnc.sh

# Startup script
COPY apps/dust-permits/start-stack.sh /start-stack.sh
RUN chmod +x /start-stack.sh

# Data + temp directories
RUN mkdir -p /app/data /app/tmp

# Expose ports
# 6080 = noVNC web interface (watch the browser)
# 47822 = API server (also serves frontend)
EXPOSE 6080 47822

# Environment Defaults
ENV DISPLAY=:1
ENV HEADLESS=false
ENV NODE_ENV=production

# Start everything: VNC + Server
ENTRYPOINT ["/start-stack.sh"]
