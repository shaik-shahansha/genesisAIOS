#!/bin/bash
# Genesis OS — update & restart script
# Usage: bash update.sh

set -e
cd ~/genesis-os

echo "==> Pulling latest code..."
git pull

echo "==> Rebuilding images..."
# Only build daemon + memory — skip ollama/voice (not used on VPS)
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.override.yml \
  -f docker/docker-compose.vps.yml \
  build --no-cache daemon memory

echo "==> Restarting services..."
# Only start daemon + memory — ollama runs natively on the host
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.override.yml \
  -f docker/docker-compose.vps.yml \
  up -d --remove-orphans daemon memory

echo "==> Waiting for daemon to be healthy..."
for i in $(seq 1 24); do
  sleep 5
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' genesis-daemon 2>/dev/null || echo "starting")
  echo "    [$i/24] daemon: $STATUS"
  if [ "$STATUS" = "healthy" ]; then
    echo ""
    echo "✓ Genesis OS is up at https://genesisos.genesisagi.in"
    docker compose -f docker/docker-compose.yml ps
    exit 0
  fi
done

echo ""
echo "✗ Daemon did not become healthy in time. Check logs:"
echo "  docker logs genesis-daemon --tail 50"
exit 1
