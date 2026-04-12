#!/usr/bin/env bash
# =============================================================================
#  Genesis AI OS — Setup Script (macOS / Linux)
#  Usage: bash setup.sh
# =============================================================================
set -e

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

COMPOSE_FILE="docker/docker-compose.yml"
ENV_FILE=".env"

print_header() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║         Genesis AI Native Operating System       ║${RESET}"
  echo -e "${BOLD}${CYAN}║                   Setup Script                   ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
  echo ""
}

print_step() {
  echo -e "${BOLD}${CYAN}▸ $1${RESET}"
}

print_ok() {
  echo -e "  ${GREEN}✓ $1${RESET}"
}

print_warn() {
  echo -e "  ${YELLOW}⚠ $1${RESET}"
}

print_error() {
  echo -e "  ${RED}✗ $1${RESET}"
}

print_header

# ─── 1. Check Docker ───────────────────────────────────────────────────────────
print_step "Checking Docker..."
if ! command -v docker &>/dev/null; then
  print_error "Docker is not installed."
  echo ""
  echo "  Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
  echo "  Then re-run this script."
  exit 1
fi

DOCKER_VERSION=$(docker --version 2>/dev/null | head -1)
print_ok "Docker found: $DOCKER_VERSION"

# Check Docker is running
if ! docker info &>/dev/null; then
  print_error "Docker daemon is not running."
  echo "  Start Docker Desktop and try again."
  exit 1
fi
print_ok "Docker daemon is running"

# ─── 2. Check Docker Compose ──────────────────────────────────────────────────
print_step "Checking Docker Compose..."
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
  print_ok "Docker Compose (plugin): $(docker compose version --short 2>/dev/null)"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
  print_ok "docker-compose: $(docker-compose --version)"
else
  print_error "Docker Compose is not available."
  echo "  Update Docker Desktop (it includes Compose), or install the plugin:"
  echo "  https://docs.docker.com/compose/install/"
  exit 1
fi

# ─── 3. Check compose file ────────────────────────────────────────────────────
print_step "Checking project files..."
if [ ! -f "$COMPOSE_FILE" ]; then
  print_error "Missing: $COMPOSE_FILE"
  echo "  Make sure you are running this script from the genesis-os root directory."
  exit 1
fi
print_ok "docker-compose.yml found"

# ─── 4. Create .env if missing ────────────────────────────────────────────────
print_step "Configuring environment..."
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# Genesis AI OS — Environment Configuration
# Edit these values before running start.sh / start.bat

# AI Model (default: gemma4:e4b — CPU-optimised MoE, ~9.6 GB download)
# Faster but smaller: gemma4:2b
# Needs GPU:         gemma4:26b
GENESIS_MODEL=gemma4:e4b

# Port Genesis OS is served on
GENESIS_PORT=3000

# Your name (shown in the AI identity profile)
GENESIS_USER_NAME=User

# Require approval before destructive AI actions (recommended: true)
GENESIS_APPROVAL_MODE=true

# Workspace directory mounted into the container
# Change to an absolute path to use your own files, e.g. /home/user/projects
GENESIS_WORKSPACE=./docker/workspace

# GPU acceleration for Ollama (set to 0 to force CPU-only)
# OLLAMA_NUM_GPU=999
EOF
  print_ok "Created .env with default settings (edit before starting)"
else
  print_ok ".env already exists — skipping"
fi

# ─── 5. Check available RAM ───────────────────────────────────────────────────
print_step "Checking system resources..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  TOTAL_RAM_GB=$(( $(sysctl -n hw.memsize) / 1073741824 ))
elif [[ -f /proc/meminfo ]]; then
  TOTAL_RAM_GB=$(( $(awk '/MemTotal/{print $2}' /proc/meminfo) / 1048576 ))
else
  TOTAL_RAM_GB=0
fi

if [ "$TOTAL_RAM_GB" -gt 0 ]; then
  print_ok "RAM: ${TOTAL_RAM_GB} GB detected"
  if [ "$TOTAL_RAM_GB" -lt 10 ]; then
    print_warn "Less than 10 GB RAM. Consider using GENESIS_MODEL=gemma4:2b in .env for better performance."
  fi
fi

# GPU check (optional)
if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
  GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
  print_ok "NVIDIA GPU detected: $GPU_NAME (GPU acceleration will be used)"
else
  print_warn "No NVIDIA GPU detected — running on CPU (normal for laptops)"
fi

# ─── 6. Pull Docker images ────────────────────────────────────────────────────
print_step "Pulling Docker images (this may take a few minutes on first run)..."
$COMPOSE_CMD -f "$COMPOSE_FILE" pull ollama 2>/dev/null || true
print_ok "Docker images ready"

# ─── 7. Done ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}✓ Setup complete!${RESET}"
echo ""
echo "  Edit ${BOLD}.env${RESET} to change the AI model, port, or workspace path."
echo ""
echo "  To start Genesis AI OS, run:"
echo -e "    ${BOLD}bash start.sh${RESET}"
echo ""
