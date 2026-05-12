# Windows — add Docker to PATH if needed, then launch:
# $env:PATH += ";C:\Program Files\Docker\Docker\resources\bin"
# cd <your-genesis-os-folder>
docker compose -f docker/docker-compose.yml up --build



 cd ~/genesis-os && git pull

docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.override.yml \
  -f docker/docker-compose.vps.yml \
  build daemon

docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.override.yml \
  -f docker/docker-compose.vps.yml \
  up -d