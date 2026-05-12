# Genesis OS

> A local-first AI shell that runs as a Docker container — and the foundation for a native Linux OS variant.

**Built by Shahansha Shaik** | Stack: Node.js + React + Ollama | Licence: MIT

Genesis OS is a **persistent AI presence** that runs entirely on your own hardware. Right now it ships as a **Docker container** — `docker compose up` and your browser becomes a full OS-like interface with a desktop shell, file manager, AI chat, terminal, and more. No cloud, no accounts, no data leaving your machine.

**Next step:** deploy Genesis OS on top of bare Linux as the sole frontend — replacing the browser tab with a direct framebuffer/Wayland session, turning any machine into a purpose-built Genesis device.

---

## Quick Start — Docker

```bash
# 1. Clone
git clone https://github.com/shahansha/genesis-os
cd genesis-os

# 2. Configure (optional — defaults work out of the box)
cp .env.example .env
# Edit .env to change the model, set passwords, adjust ports, etc.

# 3. Launch — boots Ollama, pulls gemma4:e4b, starts daemon + UI
docker compose -f docker/docker-compose.yml up --build

# 4. Open
open http://localhost:3000
```

On first run, **Ollama automatically pulls `gemma4:e4b`** (~9.6 GB). This takes a few minutes once, then it's cached on a Docker volume.

### Lighter-weight option (RAM-constrained or CPU-only VPS)

Edit `.env` and set `GENESIS_MODEL=qwen3:1.7b` (1.4 GB) or `GENESIS_MODEL=gemma4:e2b` (7.2 GB).

---

## Development (no Docker)

```bash
# Install deps
npm install

# Run Ollama separately
ollama serve
ollama pull gemma4:e4b

# Start daemon + UI together
npm run dev
# Daemon: http://localhost:3000
# UI dev server: http://localhost:5173 (proxies API to :3000)
```

---

## Architecture

Genesis OS is structured as a set of independent packages wired together by Docker Compose:

```
genesis-os/
├── packages/
│   ├── daemon/     Node.js — Express API, LLM bridge, SQLite, fs/shell/browse routes
│   ├── ui/         React + Vite — OS shell, apps, AIOrb, glassmorphism design system
│   ├── memory/     Python — ChromaDB vector memory sidecar
│   └── voice/      Python — Whisper STT + Kokoro TTS sidecar
├── docker/         Dockerfile + docker-compose.yml
└── workspace/      Default file workspace Genesis can read/edit
```

The **daemon** is the kernel — all AI logic, tool execution, and state live here. The **UI** is a pure client; it holds no business logic. The **memory** and **voice** packages are Python FastAPI sidecars. All packages communicate over HTTP; the daemon is the single source of truth.

---

## Deployment targets

| Target | Status | How |
|--------|--------|-----|
| **Docker container** | ✅ Current | `docker compose up` |
| **VPS / cloud server** | ✅ Supported | See `vps_deploy_steps.md` |
| **Native Linux OS** | 🔜 Next | Genesis shell as the only frontend on a bare Linux install |
| **Bootable OS image** | 📋 Planned | Debian live-build, boots straight into Genesis |
| **Raspberry Pi** | 📋 Planned | Pi-optimised image, GPIO + camera tools |
| **Electron desktop app** | 📋 Planned | Wraps the UI in a native window |

---

## Built-in apps

| Icon | App | Notes |
|------|-----|-------|
| 📁 | File Manager | Tree sidebar + icon grid, drag-and-drop |
| 📄 | PDF Viewer | Opens via Files or AI chat |
| 📊 | Office Viewer | .docx, .xlsx, .pptx read-only preview |
| 🌐 | AI Browser | Neko remote Chromium + AI page summary |
| 📝 | Text / Code Editor | Monaco Editor (VS Code engine) |
| ⬛ | Terminal | Full PTY over WebSocket |
| ⚙️ | Settings | Model picker, accent colour, voice toggle |

---

## Models

| Tag | Size | Best for |
|-----|------|---------|
| `gemma4:e4b` | 9.6 GB | Default — CPU inference, 128K context, multimodal |
| `gemma4:e2b` | 7.2 GB | RAM-limited machines |
| `gemma3:4b` | 3.3 GB | Very limited RAM (<8 GB) |
| `qwen3:1.7b` | 1.4 GB | CPU-only VPS or minimal containers |

---

## Configuration

Copy `.env.example` to `.env` and edit. Key variables:

```bash
GENESIS_MODEL=gemma4:e4b          # Model to use (any Ollama tag)
GENESIS_USER_NAME=User            # Your name, injected into the AI system prompt
GENESIS_APPROVAL_MODE=true        # Ask before running shell/write commands
GENESIS_BROWSER_PASSWORD=...      # ⚠️ Change before network exposure
GENESIS_BROWSER_ADMIN_PASSWORD=...
```

See `.env.example` for the full reference with all variables documented.

---

## Build status

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the cross-session progress tracker.
