
## Project identity

You are helping build **Genesis OS** — an AI-native operating system and personal intelligence layer.
It is NOT a chatbot, NOT a web app wrapper, NOT a coding tool.

Genesis OS is a **persistent local AI presence** that:
- Runs continuously on the user's hardware (laptop, phone, Raspberry Pi, server)
- Remembers everything across sessions using local vector memory
- Speaks, listens, and watches the filesystem without being prompted
- Controls files, runs shell commands, and triggers physical hardware as an agent
- Runs ANY open model (Gemma 4, Qwen 3, Mistral, Phi-4, LLaMA) via Ollama
- Deploys as: Docker container, desktop app (Electron), bootable OS, web demo (WebGPU), mobile PWA

**Built by:** Shahansha Shaik
**Stack:** Node.js + Python + Ollama + React
**Licence:** MIT

---

## MVP Priority — Docker First, Ship Fast

> **The #1 goal right now: a working Docker MVP you can `docker compose up` and immediately use as an OS.**

- **Target model:** `gemma4:e4b` (default) or `gemma4:e2b` for weaker CPUs
  - The "E" = **Effective parameters** (Mixture-of-Experts). `e4b` activates only ~4B params at inference → fast CPU inference despite 9.6 GB file
  - `e2b` (7.2 GB) is the fastest CPU option when RAM is limited
  - Both support multimodal (text + image), 128K context, and native function calling
  - `gemma4:26b` is NOT for CPU — 18 GB + 4B active params, needs GPU offload
- Everything ships as a single `docker compose up`. No GPU required.
- The UI looks and feels like a **world-class desktop OS** — better visual polish than macOS or Windows, not a chat interface.
- An **animated AI assistant icon** lives in the corner of every screen — always accessible, never obtrusive.

---

## OS UI Design System — The Look & Feel

Genesis OS must look and feel like a **next-generation desktop OS**, not a web app.

### Core design principles
- **Dark-first glassmorphism** — blurred frosted panels, depth layering, subtle glow accents
- **Fluid motion** — 60fps animations everywhere: window open/close, dock bounce, icon hover, transitions
- **Spatial hierarchy** — desktop → taskbar → floating windows → context menus (each layer has distinct blur/shadow depth)
- **Accent colour** — single configurable accent (default: electric violet `#7C3AED`), applied as glows, borders, AI orb colour

### Desktop shell components (all rendered in React, no native OS dependencies)
```
packages/ui/src/shell/
├── Desktop.jsx          # Wallpaper, icon grid, right-click context menu
├── Taskbar.jsx          # Bottom bar: app icons, clock, system tray, AI orb
├── WindowManager.jsx    # Draggable/resizable floating window system
├── AppLauncher.jsx      # Cmd+Space / click orb → full-screen app search
├── NotificationPanel.jsx # Slide-in from right — AI messages + system events
└── AIOrb.jsx            # The animated AI assistant icon (always visible)
```

### AIOrb — the AI assistant entry point
- Lives in the **bottom-right corner** of the taskbar (always on top)
- **Idle state:** slow breathing pulse glow in accent colour
- **Listening state:** concentric ripple waves + mic icon
- **Thinking state:** spinning neural-net particle orbit
- **Speaking/responding:** waveform visualizer animation
- Clicking opens floating chat panel. Hold-to-talk activates voice.
- Implemented with CSS animations + Framer Motion, no canvas/WebGL required for MVP

### Built-in applications (MVP Docker target)
Every app is a floating window managed by `WindowManager.jsx`. Apps register via `packages/ui/src/apps/registry.js`.

| App | Tech | Notes |
|-----|------|-------|
| **File Manager** | React + daemon `/api/fs` endpoints | Tree sidebar + icon grid view, drag-drop, preview pane |
| **PDF Viewer** | `@react-pdf-viewer/core` + `pdfjs-dist` | Opens via File Manager or AI chat |
| **Office Viewer** | `docx-preview` + `SheetJS (xlsx)` | .docx, .xlsx, .pptx read-only preview |
| **AI Browser** | React iframe + daemon `/api/browse` proxy | URL bar with AI summarize/ask-about-page. Local only for MVP. |
| **Text Editor** | Monaco Editor (VSCode engine) | Opens any text/code file |
| **Terminal** | `xterm.js` → daemon `/api/shell` (websocket) | Full PTY, requires `GENESIS_APPROVAL_MODE=false` or approval |
| **Settings** | React form | Model picker, wallpaper, accent colour, voice on/off |

### App registry pattern
```js
// packages/ui/src/apps/registry.js
export const APP_REGISTRY = [
  { id: 'files',    name: 'Files',      icon: '📁', component: () => import('./FileManager') },
  { id: 'pdf',      name: 'PDF Viewer', icon: '📄', component: () => import('./PDFViewer') },
  { id: 'office',   name: 'Office',     icon: '📊', component: () => import('./OfficeViewer') },
  { id: 'browser',  name: 'Browser',    icon: '🌐', component: () => import('./AIBrowser') },
  { id: 'editor',   name: 'Editor',     icon: '📝', component: () => import('./TextEditor') },
  { id: 'terminal', name: 'Terminal',   icon: '⬛', component: () => import('./Terminal') },
  { id: 'settings', name: 'Settings',   icon: '⚙️', component: () => import('./Settings') },
];
```

---

## Repository structure

```
genesis-os/
├── packages/
│   ├── daemon/          # Node.js core — event bus, API server, Ollama bridge, file watcher, fs API
│   ├── memory/          # Python — ChromaDB embeddings, retrieval, context compression
│   ├── voice/           # Python — Whisper STT, Piper TTS, openWakeWord
│   ├── ui/              # React + Vite — OS shell, desktop, apps, AI orb, voice controls
│   │   └── src/
│   │       ├── shell/   # Desktop, Taskbar, WindowManager, AppLauncher, AIOrb, NotificationPanel
│   │       ├── apps/    # FileManager, PDFViewer, OfficeViewer, AIBrowser, TextEditor, Terminal, Settings
│   │       └── design/  # Design tokens, glassmorphism components, animation presets
│   ├── tools/           # Tool registry — built-in tools + plugin loader
│   ├── electron/        # Desktop app wrapper
│   └── web-demo/        # Transformers.js WebGPU browser demo
├── docker/              # Dockerfile, docker-compose.yml
├── os-image/            # Debian live-build config (bootable OS)
├── pi-image/            # Raspberry Pi image builder
└── docs/                # Architecture, API reference, deployment guides
```

---

## Architecture rules — always follow these

### 1. The daemon is the OS kernel — treat it like one
- `packages/daemon/src/index.js` is the always-running process. It NEVER crashes. All errors are caught, logged, and recovered.
- All inter-module communication goes through the internal EventEmitter bus (`packages/daemon/src/bus.js`), NOT through direct function calls between packages.
- The daemon exposes one HTTP API on port 3000 (configurable). All packages communicate via this API or the bus.

### 2. Model-agnostic always
- NEVER hardcode a model name in logic code. Always use `process.env.GENESIS_MODEL` or the value from `config.json`.
- All LLM calls go through `packages/daemon/src/llm/client.js` which wraps Ollama's OpenAI-compatible endpoint.
- Switching models must require zero code changes — only a config/env change.

### 3. Memory is the core differentiator
- Every conversation turn is stored in SQLite AND ChromaDB.
- When handling a new message, ALWAYS retrieve relevant memories from ChromaDB before building the prompt.
- Never truncate history arbitrarily. Use the context compression service in `packages/memory/compress.py` when the window fills.
- Memory is append-only. Never delete memories without explicit `memory.delete(id)` call from a confirmed user action.

### 4. Tools are plugins — always
- Every built-in tool (read_file, write_file, run_shell, etc.) lives in `packages/tools/builtin/` and implements the same interface as a user plugin.
- Tool schema follows the Gemma 4 / OpenAI function calling format exactly.
- Never call tools directly in agent logic. Always go through the tool registry (`packages/tools/registry.js`).
- Before executing any destructive tool (write_file, run_shell, send_email, delete), check `tool.requiresApproval` and emit `approval_required` on the bus if true.

### 5. Python services are sidecars — not subprocesses
- `packages/memory/` and `packages/voice/` run as separate Python processes (managed by the daemon via `packages/daemon/src/services/manager.js`).
- They expose a local HTTP API (FastAPI). The daemon calls them over localhost. Never spawn them as one-shot subprocesses.
- Python dependencies: always use `requirements.txt`. Never `pip install` loose commands in code.

### 6. The UI is a client — not the app
- `packages/ui/` is a React SPA. It has NO business logic. It calls the daemon API only.
- All AI logic lives in the daemon. The UI renders what the daemon returns.
- The UI must work identically in: browser (localhost:3000), Electron window, and mobile browser (PWA).

### 7. Docker is a first-class deployment target
- Every feature must work inside Docker. If it requires a display, use a virtual framebuffer or expose a web interface.
- `docker-compose.yml` is the canonical way to run the full stack: daemon + memory + voice + Ollama + UI.
- The `Dockerfile` must produce a working image with `docker run -p 3000:3000 genesis-os`. No extra steps.

### 8. Async everywhere in Node.js
- Never use synchronous file I/O (`fs.readFileSync`) in the daemon request path. Use `fs.promises` or streams.
- Never block the event loop. CPU-bound tasks go to Python sidecars or worker threads.
- All external calls (Ollama, ChromaDB, SearxNG) have a timeout and a fallback.

---

## Coding conventions

### Node.js / JavaScript
```js
// ✅ Good — async, handles errors, uses env config
async function callLLM(messages) {
  const response = await fetch(`${process.env.OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.GENESIS_MODEL || 'gemma4:e4b',
      messages,
      stream: true
    }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok) throw new Error(`LLM error: ${response.status}`);
  return response;
}

// ❌ Bad — hardcoded model, no error handling, sync
const result = callLLMSync('gemma4:e4b', messages);
```

### Python
```python
# ✅ Good — typed, async FastAPI endpoint
from fastapi import FastAPI, HTTPException
from typing import List
import chromadb

app = FastAPI()
client = chromadb.PersistentClient(path="./data/chroma")

@app.post("/memory/retrieve")
async def retrieve(query: str, n_results: int = 5) -> List[dict]:
    collection = client.get_collection("genesis_memory")
    results = collection.query(query_texts=[query], n_results=n_results)
    return results["documents"][0] if results["documents"] else []

# ❌ Bad — synchronous, no types, no error handling
def get_memory(query):
    return collection.query(query_texts=[query])
```

### Tool definition format
```js
// Every tool in packages/tools/builtin/ or packages/tools/plugins/ must export this shape:
module.exports = {
  name: 'read_file',
  description: 'Read the full contents of a file in the user project directory.',
  requiresApproval: false,  // true for write/delete/shell/email actions
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative path to the file from project root' }
    },
    required: ['path']
  },
  async execute({ path }, context) {
    // context = { projectRoot, userId, bus }
    const fullPath = require('path').join(context.projectRoot, path);
    return await require('fs').promises.readFile(fullPath, 'utf8');
  }
};
```

---

## Phase context — what is built and what is next

### Phase 0 — Docker MVP (current priority — ship this FIRST)
Goal: `docker compose up` → browser opens → world-class OS UI with working AI chat, file manager, and core apps.

**UI Shell (must look better than macOS/Windows):**
- `Desktop.jsx` — wallpaper, desktop icon grid, right-click menu
- `Taskbar.jsx` — dock at bottom, running app indicators, clock, AI orb
- `WindowManager.jsx` — draggable, resizable floating windows with glassmorphism
- `AppLauncher.jsx` — full-screen launcher (Cmd+Space or orb click)
- `AIOrb.jsx` — animated assistant icon always in bottom-right, all 4 animation states (idle/listening/thinking/speaking)

**Built-in apps (MVP must-have):**
- File Manager — tree sidebar + icon grid, basic file operations
- PDF Viewer — `@react-pdf-viewer/core` + `pdfjs-dist`
- Office Viewer — `docx-preview` + `SheetJS` for .docx/.xlsx/.pptx
- AI Browser — iframe proxy + AI page summary via daemon
- Text Editor — Monaco Editor
- Terminal — `xterm.js` WebSocket PTY via daemon
- Settings — model picker, accent colour, wallpaper, voice toggle

**Daemon additions for MVP:**
- `GET/POST /api/fs/*` — file system browsing + read/write
- `WS /api/shell` — PTY terminal websocket
- `POST /api/browse` — fetch + summarize any URL with AI
- `POST /api/ai/chat` — streaming chat (already planned)

**Docker MVP checklist (track in PROJECT_STATUS.md):**
- [ ] `docker compose up` boots daemon + Ollama + UI
- [ ] Ollama auto-pulls `gemma4:e4b` on first run
- [ ] OS desktop shell renders with glassmorphism
- [ ] AI orb visible and animated
- [ ] AI chat works (streaming, with memory)
- [ ] File Manager browses workspace files
- [ ] PDF Viewer opens .pdf files
- [ ] Office Viewer opens .docx/.xlsx
- [ ] AI Browser loads URLs + AI summary
- [ ] Terminal works via WebSocket PTY

### Phase 1 (memory)
- ChromaDB Python sidecar
- sentence-transformers embeddings
- chokidar file watcher → auto-index
- Context retrieval on every message
- Identity profile (name, prefs, projects)

### Phase 2 (voice)
- faster-whisper STT Python sidecar
- Piper TTS Python sidecar
- openWakeWord ("Hey Genesis")
- Web Audio API in browser
- Screenshot → multimodal vision

### Phase 3 (agent tools)
- Tool registry + plugin loader
- Agentic loop with Gemma 4 function calling
- Built-in tools: read_file, write_file, run_shell, search_web, send_email
- Approval system for destructive actions
- node-cron scheduled proactive tasks

### Phase 4 (multi-device deployment)
- Electron desktop app
- Docker Compose full stack
- Caddy + Authelia for self-hosted web
- LAN sync between devices
- Debian live-build bootable OS image
- WebGPU browser demo (Transformers.js)

### Phase 5 (robotics + physical)
- Raspberry Pi GPIO tools
- picamera2 vision feed → Gemma multimodal
- ROS2 / pigpio bridge
- Pi-optimised OS image

---

## What NOT to do

- ❌ Do NOT add cloud API calls (OpenAI, Anthropic, Google) to core logic. If the user wants cloud, it's a plugin they opt into.
- ❌ Do NOT use localStorage or sessionStorage for AI state. All state lives in SQLite or ChromaDB.
- ❌ Do NOT put business logic in the UI package.
- ❌ Do NOT use synchronous I/O in the daemon request path.
- ❌ Do NOT hardcode model names, paths, or ports. Use environment variables with sensible defaults.
- ❌ Do NOT install packages globally inside Docker without pinning versions.
- ❌ Do NOT create new database schemas without a migration file in `packages/daemon/src/db/migrations/`.

---

## Environment variables reference

```bash
# Core
GENESIS_MODEL=gemma4:e4b          # Ollama model tag
OLLAMA_BASE_URL=http://localhost:11434
GENESIS_PORT=3000
GENESIS_DATA_DIR=./data            # All persistent data goes here

# Memory sidecar
MEMORY_SERVICE_URL=http://localhost:7701
CHROMA_PATH=./data/chroma

# Voice sidecar
VOICE_SERVICE_URL=http://localhost:7702
WHISPER_MODEL=base                 # tiny | base | small | medium
TTS_VOICE=en_US-lessac-medium     # Piper voice model

# Project / workspace
GENESIS_PROJECT_ROOT=./workspace   # Directory Genesis watches and can edit
GENESIS_USER_NAME=User             # Injected into identity profile

# Features flags
GENESIS_VOICE_ENABLED=true
GENESIS_FILE_WATCHER_ENABLED=true
GENESIS_APPROVAL_MODE=true         # Ask before destructive actions
```

---

## Key files to know

| File | Purpose |
|------|---------|
| `packages/daemon/src/index.js` | Entry point — starts everything |
| `packages/daemon/src/bus.js` | Internal event bus |
| `packages/daemon/src/llm/client.js` | All LLM calls go here |
| `packages/daemon/src/agent/loop.js` | Agentic reason→tool→observe loop |
| `packages/daemon/src/db/index.js` | SQLite setup and migrations |
| `packages/daemon/src/routes/fs.js` | File system API (`/api/fs`) |
| `packages/daemon/src/routes/shell.js` | Terminal WebSocket PTY (`/api/shell`) |
| `packages/daemon/src/routes/browse.js` | AI browser proxy (`/api/browse`) |
| `packages/memory/main.py` | FastAPI memory service entry |
| `packages/memory/retriever.py` | Context retrieval logic |
| `packages/voice/main.py` | FastAPI voice service entry |
| `packages/tools/registry.js` | Tool registration and dispatch |
| `packages/ui/src/shell/Desktop.jsx` | OS desktop — wallpaper + icon grid |
| `packages/ui/src/shell/Taskbar.jsx` | Bottom bar — dock, clock, AI orb |
| `packages/ui/src/shell/WindowManager.jsx` | Floating window system |
| `packages/ui/src/shell/AIOrb.jsx` | Animated AI assistant icon |
| `packages/ui/src/apps/registry.js` | App registry — all built-in apps |
| `packages/ui/src/design/tokens.js` | Design tokens — colours, blur, shadows |
| `docker/docker-compose.yml` | Full stack definition |
| `PROJECT_STATUS.md` | Cross-session build status tracker |

---

## When you are unsure

1. Check if a similar pattern exists in `packages/daemon/src/` before creating new abstractions.
2. Prefer composition over inheritance — Genesis uses simple modules, not class hierarchies.
3. When adding a feature, ask: "Does this work in Docker AND as a bootable OS AND on a Raspberry Pi?" If yes, proceed.
4. Memory is more important than speed. A correct but slow answer with memory context beats a fast answer without it.
5. The user is Shahansha. If context is missing, assume they are working on Genesis OS and want local-first, privacy-preserving solutions.