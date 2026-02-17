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
# LibreOffice-core for legacy .doc/.xls/.ppt extraction via Kreuzberg
# unzip for ZIP archive extraction in files-intake pipeline
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-venv curl libreoffice-core unzip && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PATH="/root/.local/bin:$PATH"

# Copy JS deps
COPY --from=deps /app/node_modules ./node_modules

# Config files
COPY package.json tsconfig.json tsconfig.base.json bunfig.toml ./

# Web server + API routes
COPY apps/web ./apps/web

# Background jobs — webhook receiver + job queue + sync timers + notifications
COPY apps/background-jobs ./apps/background-jobs

# CF Workers — shared modules referenced by background-jobs workers
COPY apps/cf-workers ./apps/cf-workers

# Packages
COPY packages/sharepoint ./packages/sharepoint
COPY packages/email ./packages/email
COPY packages/documents ./packages/documents
COPY packages/contracts ./packages/contracts
COPY packages/monday ./packages/monday
COPY packages/estimates ./packages/estimates
COPY packages/permits ./packages/permits
COPY packages/takeoff ./packages/takeoff

# Shared libraries
COPY lib ./lib

# Install Python deps for pdf-analysis
RUN cd packages/documents/pdf-analysis-cli && uv sync --frozen 2>/dev/null || uv sync

# Install Python deps for contract extraction (LangExtract fork)
RUN cd packages/contracts/langextract && uv sync --frozen 2>/dev/null || uv sync

# Install opencode CLI (used for Kimi K2.5 reconciliation in parse pipeline)
RUN bun add -g opencode-ai

# Data + temp directories
RUN mkdir -p /app/data /app/tmp

EXPOSE 3000 4747

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Default entrypoint — override per service in docker-compose.yml
CMD ["bun", "run", "apps/web/server.ts"]
