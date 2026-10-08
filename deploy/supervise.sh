#!/usr/bin/env bash
# Keep a Nightshift process alive on a dev machine: restart on exit with a short backoff.
#   bash deploy/supervise.sh <name> <command...>
name="$1"; shift
while true; do
  echo "$(date -u +%FT%TZ) [supervise] starting $name"
  "$@"
  code=$?
  echo "$(date -u +%FT%TZ) [supervise] $name exited ($code); restarting in 10s"
  sleep 10
done
