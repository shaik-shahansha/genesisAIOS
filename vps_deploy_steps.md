# Genesis OS — VPS Quick Deploy Reference

**VPS:** `user@YOUR_VPS_IP`  
**Repo:** `https://github.com/YOUR_USERNAME/genesis-os`  
**OS:** Ubuntu 22.04 / 24.04  
**Model:** `qwen3:1.7b` (CPU-only, 1.4 GB)

---

## Step 1 — GitHub Personal Access Token

Go to: https://github.com/settings/tokens/new  
- Note: `genesis-os vps deploy`  
- Expiration: 90 days  
- Scope: ✓ `repo`  
- Copy the token

---

## Step 2 — SSH into VPS

```powershell
ssh user@YOUR_VPS_IP
```

---

## Step 3 — Install Docker

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version && docker compose version
```

---

## Step 4 — Clone Repo

```bash
cd ~
git clone https://YOUR_PAT@github.com/YOUR_USERNAME/genesis-os.git genesis-os
cd genesis-os
```

---

## Step 5 — Configure `.env`

```bash
cp .env.example .env
nano .env
```

Key values to set:
```bash
GENESIS_MODEL=qwen3:1.7b
GENESIS_MODEL_FALLBACK=qwen2.5:1.5b
OLLAMA_NUM_GPU=0
GENESIS_PORT=3000
GENESIS_USER_NAME=User
GENESIS_VOICE_ENABLED=false
GENESIS_APPROVAL_MODE=true
GENESIS_ALLOW_INSECURE_TLS=false
```

---

## Step 6 — CPU Override (removes GPU requirement)

```bash
cat > docker/docker-compose.override.yml << 'EOF'
services:
  ollama:
    deploy: {}
EOF
```

---

## Step 7 — Firewall

```bash
sudo ufw allow 3000/tcp
sudo ufw allow OpenSSH
sudo ufw enable
```

---

## Step 8 — Build & Start

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml build
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d
```

Watch model download (first run only):
```bash
docker compose -f docker/docker-compose.yml logs -f model-init
```

Check all services healthy:
```bash
docker compose -f docker/docker-compose.yml ps
```

---

## Step 9 — Verify

```bash
curl http://localhost:3000/api/ai/models
```

Open in browser: **http://YOUR_VPS_IP:3000**

---

## Daily Management

```bash
# Alias (add to ~/.bashrc for convenience)
alias gcup='docker compose -f ~/genesis-os/docker/docker-compose.yml -f ~/genesis-os/docker/docker-compose.override.yml'

gcup up -d          # start
gcup down           # stop
gcup logs -f daemon # logs
gcup ps             # status

# Pull a different model
docker exec genesis-ollama ollama pull qwen2.5:1.5b
docker exec genesis-ollama ollama list

# Update Genesis OS
cd ~/genesis-os && git pull
gcup build --no-cache && gcup up -d
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Model pull fails | `docker exec genesis-ollama ollama pull qwen3:1.7b` |
| Daemon exits immediately | Wait 2 min, then `gcup up -d --force-recreate daemon` |
| UI not reachable | `sudo ufw allow 3000/tcp` and check `gcup ps` |
| Out of RAM | Switch to `GENESIS_MODEL=qwen2.5:1.5b` in `.env`, restart daemon |
| Out of disk | `docker system prune -f` then `docker exec genesis-ollama ollama rm <model>` |

---

## Model Options by VPS RAM

| RAM | Model | File Size |
|---|---|---|
| 4 GB | `qwen2.5:1.5b` | 986 MB |
| 8 GB | `qwen3:1.7b` ← default | 1.4 GB |
| 16 GB | `llama3.2:3b` | 2.0 GB |
| 16+ GB | `gemma4:e4b` (original default) | 9.6 GB |
