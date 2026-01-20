# syntax=docker/dockerfile:1

# =============================================================================
# Desert Services Hub - Dockerfile
# =============================================================================
# Multi-stage build optimized for Bun server with native HTML bundling
# Uses bun:sqlite (built into Bun) - no native compilation needed
# See: https://bun.sh/guides/ecosystem/docker
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Install dependencies
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# -----------------------------------------------------------------------------
# Stage 2: Production image
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source files needed for runtime
COPY --chown=appuser:appgroup package.json ./
COPY --chown=appuser:appgroup bunfig.toml ./
COPY --chown=appuser:appgroup src/server.ts ./src/
COPY --chown=appuser:appgroup tsconfig.json ./
COPY --chown=appuser:appgroup public ./public
COPY --chown=appuser:appgroup src ./src
COPY --chown=appuser:appgroup lib ./lib
COPY --chown=appuser:appgroup styles ./styles
COPY --chown=appuser:appgroup hooks ./hooks
COPY --chown=appuser:appgroup services ./services

# Create data directory for SQLite database (mount as volume for persistence)
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

# Switch to non-root user
USER appuser

# Expose the port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_PATH="/app/data/desert-services.db"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application using Bun
CMD ["bun", "run", "src/server.ts"]
