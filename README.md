# Genesis OS

> AI-native operating system. `docker compose up` → browser opens → use it as an OS.

**Built by Shahansha Shaik** | Stack: Node.js + React + Ollama | Licence: MIT

---

## Quick Start — Docker (recommended)

```bash
# 1. Clone
git clone https://github.com/your-org/genesis-os
cd genesis-os

# 2. (Optional) copy env
cp .env.example .env

# 3. Launch — boots Ollama, pulls gemma4:e4b, starts daemon + UI
docker compose -f docker/docker-compose.yml up --build

# 4. Open browser
open http://localhost:3000
```

On first run, **Ollama will automatically pull `gemma4:e4b`** (~9.6 GB). This takes a few minutes once, then it's cached.

### Lighter-weight option (RAM-constrained)

Edit `.env` → set `GENESIS_MODEL=gemma4:e2b` (7.2 GB, effective 2B params).

---

## Development (no Docker)

```bash
# Install deps
npm install

# Run Ollama locally (separate terminal):
ollama serve
ollama pull gemma4:e4b

# Run daemon + UI in parallel:
npm run dev
# Daemon: http://localhost:3000
# UI dev server: http://localhost:5173 (proxies API to :3000)
```

---

## Architecture

```
genesis-os/
├── packages/
│   ├── daemon/     Node.js — Express API, LLM bridge, SQLite, fs/shell/browse routes
│   ├── ui/         React + Vite — OS shell, apps, AIOrb, glassmorphism design system
│   ├── memory/     Python — ChromaDB vector memory (Phase 1)
│   └── voice/      Python — Whisper STT + Piper TTS (Phase 2)
├── docker/         Dockerfile + docker-compose.yml
└── workspace/      Default file workspace Genesis can read/edit
```

## Default apps

| Icon | App | Opens via |
|------|-----|-----------|
| 📁 | File Manager | Taskbar or AI orb |
| 📄 | PDF Viewer | Files or chat |
| 📊 | Office Viewer | Files (.docx, .xlsx) |
| 🌐 | AI Browser | Taskbar |
| 📝 | Text Editor / Code | Files or chat |
| ⬛ | Terminal | Taskbar |
| ⚙️ | Settings | Taskbar |

## Models

| Tag | Size | Best for |
|-----|------|---------|
| `gemma4:e4b` | 9.6 GB | Default — CPU inference, 128K context, multimodal |
| `gemma4:e2b` | 7.2 GB | RAM-limited machines |
| `gemma3:4b` | 3.3 GB | Very limited RAM (<8 GB) |

---

## Build status

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for cross-session progress tracker.
