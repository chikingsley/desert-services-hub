#!/bin/bash
set -euo pipefail

echo "Starting background-jobs container..."

mkdir -p /app/data
cd /app

echo "Starting webhook server..."
bun run apps/background-jobs/webhooks.ts &
SERVER_PID=$!

echo "Background-jobs started."
echo "  - API: http://localhost:${WEBHOOK_PORT:-4747}"

wait "${SERVER_PID}"
