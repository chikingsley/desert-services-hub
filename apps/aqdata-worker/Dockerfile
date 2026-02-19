# syntax=docker/dockerfile:1

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install || true

FROM oven/bun:1 AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json tsconfig.base.json ./
COPY apps/aqdata-worker/package.json ./apps/aqdata-worker/
COPY apps/aqdata-worker/tsconfig.json ./apps/aqdata-worker/
COPY apps/aqdata-worker/src ./apps/aqdata-worker/src
COPY lib/db/client.ts ./lib/db/client.ts
RUN mkdir -p /app/data/aqdata
EXPOSE 47823
CMD ["bun", "run", "apps/aqdata-worker/src/index.ts"]
