# Genesis OS — VPS Deployment Guide

Deploy Genesis OS on a VPS (DigitalOcean, Hetzner, Vultr, Linode, etc.) via Docker Compose — CPU-only, no GPU required.

---

## Recommended VPS Specs

| Tier | RAM | CPU | Storage | Cost (est.) | Model |
|---|---|---|---|---|---|
| **Minimum** | 4 GB | 2 vCPU | 30 GB SSD | ~$6–12/mo | `qwen2.5:1.5b` (1 GB) |
| **Recommended** | 8 GB | 4 vCPU | 50 GB SSD | ~$18–24/mo | `qwen3:1.7b` (1.4 GB) |
| **Comfortable** | 16 GB | 4 vCPU | 80 GB SSD | ~$36–48/mo | `llama3.2:3b` (2 GB) |

> **Note:** `gemma4:e4b` (the default) needs ~12 GB RAM — fine on a 16 GB VPS. For cheaper VPS, use `qwen3:1.7b` or `qwen2.5:1.5b` instead.

---

## 1. Provision the VPS

### Recommended OS
- Ubuntu 24.04 LTS (most Docker-compatible)

### Initial server hardening (run as root)
```bash
# Update system
apt update && apt upgrade -y

# Create a non-root user
adduser genesis
usermod -aG sudo genesis

# Set up SSH key auth (on your LOCAL machine, copy your public key)
ssh-copy-id genesis@YOUR_VPS_IP

# Disable password SSH login
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Basic firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp   # Genesis UI (before reverse proxy is set up)
ufw enable
```

---

## 2. Install Docker & Docker Compose

```bash
# Switch to your genesis user
su - genesis

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

---

## 3. Clone the Repository

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/genesis-os.git
cd genesis-os
```

If the repo is private, use a personal access token or SSH key:
```bash
git clone git@github.com:YOUR_USERNAME/genesis-os.git
```

---

## 4. Configure Environment

```bash
cp .env.example .env
nano .env
```

### Recommended `.env` for a low-RAM VPS (4–8 GB)

```bash
# ── Model (pick one based on your VPS RAM) ───────────────────────────────────
# 4 GB VPS  → qwen2.5:1.5b  (~1 GB model)
# 8 GB VPS  → qwen3:1.7b    (~1.4 GB model)  ← recommended
# 16 GB VPS → llama3.2:3b   (~2 GB model)
GENESIS_MODEL=qwen3:1.7b
GENESIS_MODEL_FALLBACK=qwen2.5:1.5b,qwen2.5:0.5b

# ── Ollama ───────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_NUM_GPU=0                    # Force CPU-only (no GPU on VPS)

# ── Daemon ───────────────────────────────────────────────────────────────────
GENESIS_PORT=3000
GENESIS_USER_NAME=YourName
GENESIS_APPROVAL_MODE=true          # Require approval for destructive actions
GENESIS_VOICE_ENABLED=false         # Disable voice on headless VPS
GENESIS_FILE_WATCHER_ENABLED=true

# ── Voice (can leave defaults if GENESIS_VOICE_ENABLED=false) ────────────────
WHISPER_MODEL=base

# ── Security ─────────────────────────────────────────────────────────────────
GENESIS_ALLOW_INSECURE_TLS=false    # Set true only if behind a known proxy
```

---

## 5. Remove the GPU Requirement from docker-compose.yml

The default `docker-compose.yml` reserves a GPU. On a CPU-only VPS this **will cause the Ollama service to fail to start**. 

Open `docker/docker-compose.yml` and remove or comment out the `deploy` block under the `ollama` service:

```yaml
# ollama service — remove this entire block:
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]
```

You can do this with a one-liner:
```bash
# Creates a CPU-safe override file — does NOT modify the original
cat > docker/docker-compose.override.yml << 'EOF'
services:
  ollama:
    deploy: {}
EOF
```

> Using an override file keeps the original `docker-compose.yml` untouched and Git-clean.

---

## 6. Pull Images and Build

```bash
cd ~/genesis-os

# Build all services (first run takes 5–10 min)
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml build

# Or pull pre-built images if you've pushed them to a registry
# docker compose -f docker/docker-compose.yml pull
```

---

## 7. Start Genesis OS

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d
```

Watch the startup (the `model-init` service pulls the LLM — takes a few minutes on first run):

```bash
docker compose -f docker/docker-compose.yml logs -f model-init
docker compose -f docker/docker-compose.yml logs -f daemon
```

Check all services are healthy:
```bash
docker compose -f docker/docker-compose.yml ps
```

Expected output:
```
NAME                    STATUS          PORTS
genesis-ollama          healthy         0.0.0.0:11434->11434/tcp
genesis-daemon          healthy         0.0.0.0:3000->3000/tcp
genesis-memory          healthy         0.0.0.0:7701->7701/tcp
genesis-voice           healthy
genesis-model-init      exited (0)
```

---

## 8. Verify It's Working

```bash
curl http://localhost:3000/api/ai/models
```

Then open `http://YOUR_VPS_IP:3000` in your browser — you should see the Genesis OS desktop UI.

---

## 9. Set Up a Reverse Proxy with HTTPS (Caddy — recommended)

Caddy auto-provisions Let's Encrypt TLS certificates with zero config.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

Create `/etc/caddy/Caddyfile`:
```
your-domain.com {
    reverse_proxy localhost:3000
}
```

Start Caddy:
```bash
sudo systemctl reload caddy
```

Caddy will automatically obtain and renew a TLS certificate for your domain. Genesis OS will then be accessible at `https://your-domain.com`.

> **DNS:** Point your domain's A record to `YOUR_VPS_IP` before running Caddy.

---

## 10. Secure the Exposed Ports

Once Caddy is handling traffic on 443, lock down direct access:

```bash
# Revoke direct access to daemon port (Caddy proxies it)
sudo ufw delete allow 3000/tcp

# Revoke direct Ollama access (only internal Docker network should reach it)
sudo ufw delete allow 11434/tcp 2>/dev/null || true

sudo ufw status
```

---

## 11. Useful Management Commands

```bash
# Alias for convenience (add to ~/.bashrc)
alias gcup='docker compose -f ~/genesis-os/docker/docker-compose.yml -f ~/genesis-os/docker/docker-compose.override.yml'

# Start / stop
gcup up -d
gcup down

# View logs
gcup logs -f daemon
gcup logs -f ollama

# Restart a single service
gcup restart daemon

# Pull a model manually (if model-init failed)
docker exec genesis-ollama ollama pull qwen3:1.7b

# List downloaded models
docker exec genesis-ollama ollama list

# Check disk usage
docker system df
docker volume ls

# Update Genesis OS (git pull + rebuild)
cd ~/genesis-os
git pull
gcup build --no-cache
gcup up -d
```

---

## 12. Persistent Data

All data is stored in named Docker volumes — they survive container restarts and rebuilds:

| Volume | Contents |
|---|---|
| `genesis_data` | SQLite DB, ChromaDB memories, generated files |
| `ollama_data` | Downloaded Ollama models |

To back up your data:
```bash
# Backup
docker run --rm -v genesis_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/genesis_data_backup.tar.gz -C /data .

# Restore
docker run --rm -v genesis_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/genesis_data_backup.tar.gz -C /data
```

---

## 13. Monitor Resource Usage

```bash
# Live container stats (CPU, RAM, network)
docker stats

# Check if Ollama is using too much RAM
docker stats genesis-ollama --no-stream
```

If your VPS runs out of RAM, Ollama will crash. Consider:
1. Downgrading the model: `GENESIS_MODEL=qwen2.5:1.5b`
2. Adding swap space (helps with occasional spikes, not sustained load):

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 14. Firewall Summary

| Port | Service | Exposure |
|---|---|---|
| 22 | SSH | Public (your IP only if possible) |
| 80 | Caddy HTTP→HTTPS redirect | Public |
| 443 | Caddy HTTPS (Genesis UI) | Public |
| 3000 | Genesis daemon | Internal only (blocked by UFW) |
| 7701 | Memory sidecar | Internal only |
| 7702 | Voice sidecar | Internal only |
| 11434 | Ollama | Internal only |

---

## Troubleshooting

### Model pull fails on first start
```bash
# Pull manually
docker exec genesis-ollama ollama pull qwen3:1.7b
```

### `daemon` exits immediately
```bash
docker logs genesis-daemon
# Usually means Ollama or memory service isn't healthy yet — give it 2 minutes
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --force-recreate daemon
```

### Out of disk space (models are large)
```bash
df -h
docker system prune -f        # remove unused images/containers
docker exec genesis-ollama ollama rm unused-model-name
```

### Can't reach the UI from browser
```bash
# Check daemon is running
curl http://localhost:3000/api/ai/models

# Check UFW allows the port
sudo ufw status

# Check Caddy logs if using HTTPS
sudo journalctl -u caddy -f
```

### Reset everything (nuclear option)
```bash
docker compose -f docker/docker-compose.yml down -v   # -v deletes volumes too!
docker system prune -af
```
> ⚠️ This deletes all memories, chat history, and downloaded models.

---

## Quick Reference: Model Selection by VPS RAM

```bash
# 4 GB VPS — absolute minimum
GENESIS_MODEL=qwen2.5:1.5b    # 986 MB, tools support, Apache 2.0

# 8 GB VPS — recommended
GENESIS_MODEL=qwen3:1.7b      # 1.4 GB, thinking mode, agent-optimised

# 16 GB VPS — comfortable
GENESIS_MODEL=llama3.2:3b     # 2 GB, 128K context, Meta's official small model

# 16+ GB VPS — full experience (original default)
GENESIS_MODEL=gemma4:e4b      # 9.6 GB, multimodal, 128K context
```

Change the model at any time by editing `.env` and restarting:
```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml restart daemon
docker exec genesis-ollama ollama pull qwen3:1.7b
```
