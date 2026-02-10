# syntax=docker/dockerfile:1

# =============================================================================
# Desert Services Hub - Dockerfile
# =============================================================================
# Bun server + Python extraction pipeline.
# Webhook events → sync item → download PDF → extract line items.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install JS dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app

COPY package.json bun.lock ./

RUN bun install

# -----------------------------------------------------------------------------
# Stage 2: Production image (Bun + Python)
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Python + uv (needed for pdf-analysis extraction)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-venv curl && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:$PATH"

# Copy JS deps
COPY --from=deps /app/node_modules ./node_modules

# Config files
COPY package.json tsconfig.json tsconfig.base.json bunfig.toml ./

# Web server + API routes
COPY apps/web ./apps/web

# CLI tools
COPY apps/cli-tools/monday-cli ./apps/cli-tools/monday-cli
COPY apps/cli-tools/sharepoint-cli ./apps/cli-tools/sharepoint-cli
COPY apps/cli-tools/email-cli ./apps/cli-tools/email-cli

# Workers
COPY apps/workers/estimate-poller/lib ./apps/workers/estimate-poller/lib
COPY apps/workers/contract-intake/lib ./apps/workers/contract-intake/lib
COPY apps/workers/outlook-folder-watcher/lib ./apps/workers/outlook-folder-watcher/lib

# Dust permit intake worker
COPY apps/workers/dust-permit-intake/lib ./apps/workers/dust-permit-intake/lib

# Notifications worker
COPY apps/workers/notifications/lib ./apps/workers/notifications/lib

# PDF analysis pipeline (Python)
COPY apps/cli-tools/pdf-analysis-cli ./apps/cli-tools/pdf-analysis-cli

# Shared libraries + frontend dependencies
COPY lib ./lib
COPY hooks ./hooks
COPY styles ./styles

# Static assets (logo, etc.)
COPY public ./public

# Install Python deps for pdf-analysis
RUN cd apps/cli-tools/pdf-analysis-cli && uv sync --frozen 2>/dev/null || uv sync

# Install opencode CLI (used for Kimi K2.5 reconciliation in parse pipeline)
RUN bun add -g opencode-ai

# Data + temp directories
RUN mkdir -p /app/data /app/tmp

EXPOSE 3000 4747

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default entrypoint — override per service in docker-compose.yml
CMD ["bun", "run", "apps/web/server.ts"]
