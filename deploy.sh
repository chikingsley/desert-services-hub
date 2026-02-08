#!/bin/bash
cd ~/github/desert-services-hub
git fetch origin main 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] New commits detected, pulling..."
    git pull origin main
    docker compose up -d --build 2>&1
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy complete"
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Up to date"
fi
