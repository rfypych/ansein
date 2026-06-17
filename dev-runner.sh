#!/bin/bash
# Persistent dev server wrapper — respawns next dev if it dies
trap "" SIGHUP SIGTERM SIGINT
cd /home/z/my-project
while true; do
  bun x next dev -p 3000 > /tmp/dev.log 2>&1
  echo "$(date): dev server exited, restarting in 3s..." >> /tmp/dev-runner.log
  sleep 3
done
