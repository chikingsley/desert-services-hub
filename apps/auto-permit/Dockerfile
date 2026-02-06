# Auto-Permit Full Stack: Server + VNC
# All-in-one container for browser automation with visual feedback
FROM mcr.microsoft.com/playwright:v1.57.0-noble

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

# Set working directory
WORKDIR /app

# Copy package files first (better layer caching)
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy all project files
COPY . .

# Copy startup script
COPY scripts/start-stack.sh /start-stack.sh
RUN chmod +x /start-stack.sh

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
