#!/bin/bash
# Dev server watchdog — restarts `next dev` when it gets OOM-killed.
# The .next compilation cache persists across restarts, so each restart
# compiles faster and uses less peak memory until the cache is warm.
cd /home/z/my-project
pkill -f "next-server" 2>/dev/null
pkill -f "bun.*dev" 2>/dev/null
sleep 2
while true; do
  echo "[$(date +%H:%M:%S)] Starting next dev (webpack, 768MB heap)..."
  NODE_OPTIONS="--max-old-space-size=768" npx next dev -p 3000 --webpack > /home/z/my-project/dev.log 2>&1
  EXIT_CODE=$?
  echo "[$(date +%H:%M:%S)] next dev exited with code $EXIT_CODE (likely OOM). Restarting in 3s..."
  sleep 3
  pkill -f "next-server" 2>/dev/null
  sleep 1
done
