# Quoting Service - Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
