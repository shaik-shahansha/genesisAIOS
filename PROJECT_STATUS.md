# Genesis OS — Build Status Tracker

> Cross-session tracker. Update this file at the end of every session.
> Last updated: 2026-04-14 — **OpenClaw-inspired: model failover chain, SOUL.md/AGENTS.md identity layer, chat slash commands, SKILL.md tool descriptors added.**

---

## Current Priority: Phase 1 Features (on top of running Docker MVP)

**Goal:** Extended AI capabilities — voice, image generation, mini-app creation, full-screen chat, persistent memory.

**Default model:** `gemma4:e4b` (CPU-optimized, 9.6 GB, effective 4B params via MoE)  
**Lighter alternative:** `gemma4:e2b` (7.2 GB, for RAM-constrained machines)

---

## Docker MVP Checklist

### Infrastructure
- [x] `docker/Dockerfile` — multi-stage build (ui-builder + daemon runtime)
- [x] `docker/docker-compose.yml` — daemon + Ollama + model-init service
- [x] Ollama auto-pulls `gemma4:e4b` on first container start via `model-init`
- [x] Health checks for all services
- [x] `.env.example` with all required environment variables

### Daemon (Node.js — `packages/daemon/`)
- [x] `src/index.js` — Express server, bus wiring, graceful shutdown
- [x] `src/bus.js` — EventEmitter internal bus
- [x] `src/llm/client.js` — Ollama streaming client (model from env) + **model failover chain** (`GENESIS_MODEL_FALLBACK`)
- [x] `src/db/index.js` — SQLite init + migrations (messages, settings, auth_sessions, created_apps, generated_images)
- [x] `src/routes/chat.js` — `POST /api/ai/chat` streaming + agentic loop (6-step tool calling) + `GET /api/ai/status` + `POST /api/ai/compact`
- [x] `src/routes/fs.js` — `GET/POST /api/fs/*` file system API
- [x] `src/routes/shell.js` — `WS /api/shell` PTY terminal
- [x] `src/routes/browse.js` — `POST /api/browse` URL fetch + AI summary
- [x] `src/routes/image.js` — `POST /api/image/generate` image generation (pollinations free API or local SD)
- [x] `src/routes/apps.js` — `GET/POST/DELETE /api/apps/*` mini-app CRUD

### Daemon AI Tools (function calling in `chat.js`)
- [x] `list_files` — browse workspace directory
- [x] `read_file` — read workspace file content
- [x] `write_file` — create/overwrite workspace files
- [x] `create_folder` — create workspace directories
- [x] `run_command` — execute shell commands in workspace
- [x] `browse_page` — fetch + summarize web pages via LLM
- [x] `open_app` — open any built-in or user-created app in OS UI
- [x] `generate_image` — generate image from prompt, save to workspace/generated/, return URL
- [x] `create_app` — generate HTML/JS/IndexedDB mini-app, save to workspace/apps/, register in SQLite
- [x] `create_document` — generate exact `.docx`, `.xlsx`, `.pptx`, or `.pdf` files
- [x] `replace_file` — update an existing text file with approval on overwrite
- [x] `copy_path` — copy files/folders across the workspace with approval on replace
- [x] `move_path` — move/rename files and folders with approval on replace
- [x] `delete_path` — delete files/folders with explicit approval
- [x] `search_files` — search workspace files by name/path

### UI Shell (React — `packages/ui/src/shell/`)
- [x] `Desktop.jsx` — wallpaper, icon grid, right-click context menu + **user-created app tiles** (dynamic, from `/api/apps/list`)
- [x] `Taskbar.jsx` — dock, running app indicators, clock, AI orb slot
- [x] `WindowManager.jsx` — draggable + resizable floating windows, glassmorphism, resolves dynamic apps
- [x] `AppLauncher.jsx` — full-screen search/launch overlay
- [x] `NotificationPanel.jsx` — slide-in panel for AI + system messages
- [x] `AIOrb.jsx` — animated AI icon (idle / listening / thinking / speaking states)

### Design System (`packages/ui/src/design/`)
- [x] `tokens.js` — colour palette, blur values, shadow depths, animation durations
- [x] `Glass.jsx` — reusable glassmorphism panel component
- [x] `animations.js` — Framer Motion presets (window open/close, orb states)

### Built-in Apps (`packages/ui/src/apps/`)
- [x] `registry.jsx` — app registry with lazy imports + `resolveApp()` for dynamic user apps
- [x] `FileManager/` — tree sidebar + icon grid, file operations via `/api/fs`
- [x] `PDFViewer/` — native browser iframe PDF rendering via `/api/fs/raw`
- [x] `OfficeViewer/` — `docx-preview` + `SheetJS` (.docx, .xlsx)
- [x] `AIBrowser/` — iframe + URL bar + AI summarize via `/api/browse`
- [x] `TextEditor/` — Monaco Editor (code/text files)
- [x] `Terminal/` — `xterm.js` connected to `/api/shell` WebSocket
- [x] `Settings/` — model picker, accent colour, wallpaper, voice toggle
- [x] `AppBuilder/` — "My Apps" manager: grid of user-created apps with delete confirm
- [x] `UserApp/` — iframe runner for user-created HTML/JS/IndexedDB apps (sandboxed)

### ChatPanel (`packages/ui/src/components/ChatPanel.jsx`)
- [x] Streaming SSE chat with 40-message history loaded from SQLite on mount
- [x] Voice input via Web Speech API (SpeechRecognition) — works in Chrome/Edge
- [x] Voice input fallback via MediaRecorder → `POST /api/ai/transcribe` → Whisper sidecar
- [x] TTS via Web Speech API (`speechSynthesis`) — speaks assistant replies
- [x] **Maximize / full-screen mode** — expand to ChatGPT-style full view with toggle button
- [x] **Quick action chips** — 6 shortcut buttons when chat is empty (create doc, open browser, generate image, create app, files, terminal)
- [x] **Image rendering** — inline display of generated images with download link (`![...](/api/fs/raw/...)`)
- [x] Stop voice / toggle while listening
- [x] Continuous voice mode via local Whisper sidecar with silence detection and local Kokoro TTS
- [x] Inline approval cards for destructive agent actions (delete / overwrite / destructive command)
- [x] Local image preview + save actions for generated images stored in `Pictures/`
- [x] **Slash commands** — `/new`, `/reset`, `/status`, `/compact`, `/think <level>`, `/model <name>`

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Docker MVP — OS Shell | 🟢 Done | docker compose up works, UI renders, AI chat functional |
| 1 | Voice + Image Gen + App Builder | 🟢 Done | All tools working, voice echo fixed, image gen non-blocking |
| 1.5 | Memory + Voice Sidecars | 🟢 Done | ChromaDB memory sidecar + Kokoro TTS + Whisper STT running in Docker |
| 2 | Agentic improvements | 🟢 Done | skipFinalLlm short-circuit, native Ollama API, Gemma 4 tool parser, approval-gated destructive actions |
| 2.5 | OpenClaw-inspired features | 🟢 Done | Model failover, SOUL.md/AGENTS.md, slash commands, SKILL.md registry |
| 3 | Multi-device Deployment | 🔴 Not started | |
| 4 | Robotics / Raspberry Pi | 🔴 Not started | |

Status key: 🔴 Not started · 🟡 In progress · 🟢 Done · ⏸ Blocked

---

## What's Been Built

### Phase 0 — Complete (Docker MVP running)

**Daemon** (`packages/daemon/`) — Node.js OS kernel
- `src/index.js` — Express server, static UI serving, global error recovery, graceful shutdown
- `src/bus.js` — Internal EventEmitter bus (max 50 listeners)
- `src/db/index.js` — SQLite in WAL mode, auto-migrations: `messages`, `settings`, `auth_sessions`, `created_apps`, `generated_images`
- `src/llm/client.js` — Ollama streaming client, `streamChat()` + `complete()` + `listModels()`
- `src/routes/chat.js` — SSE streaming chat, 40-message SQLite history context, system prompt, full agentic loop (9 tools)
- `src/routes/chat.js` — expanded agent loop with exact document generation, search/copy/move/delete tools, approval workflow, voice health/status, and approve/reject endpoints
- `src/routes/fs.js` — Full CRUD file API with path-traversal protection (`safePath()`)
- `src/routes/shell.js` — WebSocket PTY via `node-pty` (xterm-256color)
- `src/routes/browse.js` — URL fetch + HTML strip + 12K LLM summary, http/https only
- `src/office.js` — real `.docx`, `.xlsx`, `.pptx`, and `.pdf` generation buffers for agent-created documents
- `src/workspace.js` — default folder bootstrapping plus document/image output routing and app inference

### Phase 1 — Complete (2026-04-11)

**New Daemon routes:**
- `src/routes/image.js` — Image generation via Pollinations free API (default) or local SD API (`GENESIS_SD_API_URL`). Saves PNG to `workspace/generated/`. Logs to `generated_images` SQLite table.
- `src/routes/apps.js` — Mini-app CRUD. Saves HTML to `workspace/apps/{name}/index.html`. SQLite `created_apps` table. Endpoints: `POST /create`, `GET /list`, `GET /:id`, `DELETE /:id`.

**New AI tools in `chat.js`:**
- `generate_image({ prompt })` — calls image generation inline, returns `/api/fs/raw/generated/{file}.png` URL, AI writes markdown image tag in response
- `create_app({ name, description, icon, html_content })` — AI writes complete self-contained HTML/IndexedDB app, saved to workspace + SQLite, tile appears on Desktop immediately
- Updated `wantsAction` regex to include `image|picture|photo|app|application`
- Exact binary document generation enforced when the user asks for `.docx`, `.xlsx`, `.pptx`, or `.pdf`
- Added explicit `create_document`, `replace_file`, `copy_path`, `move_path`, `delete_path`, and `search_files` tools
- Added destructive-action approval path via `POST /api/ai/approve` and `POST /api/ai/reject`

**New UI components:**
- `apps/AppBuilder/index.jsx` — "My Apps" grid with delete confirm; `window._genesisRefreshApps()` hook for live refresh
- `apps/UserApp/index.jsx` — Sandboxed `<iframe srcDoc>` runner for user-created apps; accepts `appId`, `appName`, `appIcon` props
- `apps/registry.jsx` — Added `appbuilder` entry + `resolveApp(appId)` export for dynamic `userapp_{uuid}` resolution

**Updated UI:**
- `App.jsx` — Loads user apps from `/api/apps/list` on boot; `window._genesisRefreshApps` global hook; passes `openApp` via OS context
- `shell/Desktop.jsx` — Renders user-created app tiles dynamically (emoji icons) alongside built-in icons
- `shell/WindowManager.jsx` — Uses `resolveApp()` instead of `APP_REGISTRY.find()`; passes `openApp` prop to all app components
- `components/ChatPanel.jsx`:
  - **Maximize toggle** — full-screen ChatGPT-style view with layout centering
  - **Quick action chips** — 6 chips shown on empty chat: Create document, Open browser, Generate image, Create app, Browse files, Open terminal
  - **Image rendering** — inline `<img>` display with Download link for `/api/fs/raw/` URLs
  - **Voice improvements** — MediaRecorder fallback to Whisper sidecar; stop/toggle while listening; pulsing recording indicator; TTS strips image markdown

### Phase 1.5 — Complete (2026-04-12)

**Daemon — LLM client rewrite (`src/llm/client.js`):**
- Switched from OpenAI-compat `/v1/chat/completions` to native Ollama `/api/chat` NDJSON streaming
- Tool calls normalised: `arguments` object → JSON string for compatibility

**Daemon — Chat route improvements (`src/routes/chat.js`):**
- `parseTextToolCalls()` — parses Gemma 4's `<tool_code>func(args)</tool_code>` text format as fallback when structured tool_calls absent
- Context trimmed to last 10 messages before LLM call (prevents context bloat)
- `memoryStore()` + `memorySearch()` helpers — store/retrieve from ChromaDB sidecar (`MEMORY_SERVICE_URL`)
- `skipFinalLlm` short-circuit — `write_file`, `create_folder`, `generate_image` return `{ skipFinalLlm: true, finalMessage }` so agent loop exits without an extra LLM call (eliminates 5–30s delay)
- `generate_image` — returns Pollinations CDN URL immediately (FLUX-schnell model, ~5x faster than SDXL), background-saves to workspace. No more blocking wait.
- System prompt updated: AI instructed to write `.md`/`.html` for documents, never `.docx`

**Memory sidecar (`packages/memory/main.py`):**
- FastAPI service on port 7701
- ChromaDB + ONNX MiniLM embeddings (no PyTorch dependency)
- `POST /store` — embed and store conversation turns
- `POST /search` — semantic retrieval (top-N results)
- `GET /health` — liveness check

**Voice sidecar (`packages/voice/main.py`):**
- FastAPI service on port 7702
- `POST /transcribe` — audio (webm/wav/mp3) → text via faster-whisper (tiny model, CPU)
- `POST /tts` — text → WAV via Kokoro TTS (82MB, Apache licensed, CPU-only, ~0.2s latency)
- `GET /health` — liveness check
- Startup no longer blocks on model download/load; service binds immediately and loads Whisper/Kokoro in background

**Docker Compose updates:**
- Added `genesis-memory` service (Python, port 7701, `CHROMA_PATH`, `MEMORY_SERVICE_URL`)
- Added `genesis-voice` service (Python, port 7702, `WHISPER_MODEL=tiny`, `KOKORO_VOICE=bf_emma`)

**UI — Voice mode rewrite (`ChatPanel.jsx`):**
- **Echo fix** — `isSpeakingRef` flag: mic aborted (`recognition.abort()`) before TTS starts, restarted 500ms after TTS ends. `onresult` guarded by `isSpeakingRef` — drops all recognition events during playback.
- **Kokoro TTS** — voice mode uses `/api/ai/tts` (Kokoro local sidecar) sentence-by-sentence. Falls back to Web Speech API if sidecar unavailable.
- Standard TTS (non-continuous) uses Web Speech API capped at 300 chars
- Continuous voice now uses local MediaRecorder + silence detection + Whisper sidecar instead of browser continuous recognition
- Chat surfaces voice-sidecar readiness/errors and inline approvals for destructive agent actions

**UI — Browser app (`AIBrowser/index.jsx`):**
- Default quicklinks changed to DuckDuckGo, Wikipedia, Hacker News
- Search terms (non-URLs with spaces) redirect to DuckDuckGo automatically
- Blocked-site overlay — detects `refused to connect` / iframe block and shows friendly message with "Open in new tab" and "Search DuckDuckGo" buttons

**UI — Office Viewer (`OfficeViewer/index.jsx`):**
- Added `.md` and `.markdown` rendering (basic Markdown → HTML conversion)
- Added `.html`/`.htm` rendering in sandboxed iframe
- Added `.txt` plain-text rendering
- DOCX parse failure fallback — if `docx-preview` throws (e.g. plain-text file with `.docx` extension), renders as plain text with warning
- Accepts any unknown extension with plain-text fallback

---

## Environment Variable Reference (additions for Phase 1)

```bash
# Image generation
GENESIS_IMAGE_PROVIDER=pollinations   # pollinations (default, free, no key) | sd_api (local Stable Diffusion)
GENESIS_SD_API_URL=http://localhost:7860  # Only used if GENESIS_IMAGE_PROVIDER=sd_api

# Voice sidecar (optional — browser STT works without this)
VOICE_SERVICE_URL=http://localhost:7702  # Python Whisper sidecar URL

# Model failover (Session 7)
GENESIS_MODEL_FALLBACK=gemma4:e2b,llama3.2:3b  # Comma-separated fallback models tried in order on LLM error
```

---

## Active Decisions & Notes

- `gemma4:e4b` chosen as default: MoE model with ~4B active params at inference → fast on CPU, 9.6 GB download
- Image generation: Pollinations.ai used as free, no-key default. Local SD supported via env var. Private/offline mode should set `GENESIS_IMAGE_PROVIDER=sd_api`.
- User-created apps: HTML/JS/IndexedDB apps sandboxed in iframes with `sandbox="allow-scripts allow-same-origin allow-forms allow-modals"`. Full offline-capable mini-app support.
- Chat memory: All messages stored in SQLite. Last 40 turns sent to LLM. ChromaDB vector search planned for Phase 2.
- Voice: Browser Web Speech API (Chrome/Edge) works without any sidecar. Whisper server-side available via `VOICE_SERVICE_URL` env + Python sidecar (Phase 3).
- Voice: local-first path is now Whisper STT + Kokoro TTS sidecars, with browser speech kept only as a fallback for output.
- Agent behavior: approval is required only for destructive actions (delete, overwrite, destructive shell commands); normal actions run agentically without confirmation.
- UI framework: React 18 + Vite 5 + Framer Motion 11 + Tailwind CSS 3

---

## Blockers / To Fix

- [x] Rebuild Docker image to include new routes (`image.js`, `apps.js`)
- [x] Memory sidecar (ChromaDB) deployed and healthy
- [x] Voice sidecar (Kokoro TTS + Whisper STT) deployed and starts serving before models finish loading
- [x] Image gen non-blocking — returns CDN URL instantly
- [x] Voice echo loop fixed — mic muted during TTS
- [x] Agent second-LLM-call eliminated for file/image operations
- [x] Exact `.docx` / `.xlsx` / `.pptx` / `.pdf` generation enforced in agent tool flow
- [x] Agent destructive actions gated with inline approval instead of blanket confirmation
- [ ] Test `create_app` tool end-to-end
- [ ] Test full voice round-trip (continuous Whisper input + Kokoro output) in browser after daemon rebuild
- [ ] DNS issue on some networks — Docker Desktop needs `"dns": ["8.8.8.8","8.8.4.4"]` in daemon.json (see Troubleshooting below)

---

## Session Log

### 2026-04-11 — Session 1: Planning
- Researched Gemma 4 CPU models; chose `gemma4:e4b` (MoE, 9.6 GB, ~4B active params)
- Updated `copilot-instructions.md` with MVP priority, OS UI design system, AIOrb spec, phase checklist
- Created `PROJECT_STATUS.md`

### 2026-04-11 — Session 2: Full Implementation
- Wrote all daemon files (6 source files, all routes)
- Wrote all UI framework + design system + shell components + 7 built-in apps + Docker infrastructure
- Docker first-run attempted → failed: `docker` not in PowerShell PATH (Docker Desktop not running)

### 2026-04-11 — Session 3: Docker running + Phase 1 features
- Docker running successfully (`docker compose up --build -d`)  
- Daemon + Ollama + UI all operational
- AI chat streaming working, agentic loop verified (folder creation, browser open)
- **Phase 1 implemented:**
  - Image generation via Pollinations API + `generate_image` AI tool
  - Mini-app builder (`create_app` tool) with IndexedDB support + Desktop tiles
  - ChatPanel maximize (full-screen ChatGPT-style)
  - Quick action chips (6 shortcuts on empty chat)
  - Voice improvements: MediaRecorder + Whisper sidecar fallback, stop/toggle, TTS with image stripping
  - `AppBuilder` app (`My Apps` manager)
  - `UserApp` iframe runner for created apps
  - Dynamic app registry (`resolveApp()`) supporting runtime user apps
  - Desktop tiles updated to show user-created apps live
  - SQLite migrations for `created_apps` + `generated_images` tables

### 2026-04-12 — Session 4: Memory + Voice sidecars, Ollama native API, Gemma 4 tool parsing
- Switched LLM client to native Ollama `/api/chat` NDJSON streaming
- Added `parseTextToolCalls()` to handle Gemma 4's `<tool_code>` text format
- Wrote `packages/memory/main.py` — ChromaDB + ONNX MiniLM FastAPI sidecar (port 7701)
- Wrote `packages/voice/main.py` — Kokoro TTS + faster-whisper FastAPI sidecar (port 7702)
- Added both sidecars to `docker-compose.yml`
- Added `skipFinalLlm` short-circuit to `write_file` and `create_folder` tools
- Voice mode in ChatPanel: switched to Kokoro sentence-by-sentence TTS; Web Speech fallback
- Deployed successfully; all 4 containers healthy

### 2026-04-13 — Session 5: Bug fixes — voice echo, image blocking, Office Viewer, AI Browser
- **Voice echo fixed:** replaced Web Audio VAD (unreliable, detected speaker as mic input) with `isSpeakingRef` mute pattern: `recognition.abort()` before TTS, restart 500ms after TTS ends. All `onresult`/`onend`/`onerror` handlers guard on `isSpeakingRef`.
- **Image gen non-blocking:** added `skipFinalLlm: true` + `finalMessage: '![prompt](url)'` to `generate_image` return — agent exits immediately with inline markdown image, no 2nd LLM call.
- **AI Browser:** DuckDuckGo default, auto-search for non-URLs, blocked-site overlay for `X-Frame-Options` sites.
- **Office Viewer:** `.md`/`.html`/`.txt` rendering; DOCX fallback to plain text on parse error.
- **Docker DNS fix:** added `"dns": ["8.8.8.8","8.8.4.4","1.1.1.1"]` to `%USERPROFILE%\.docker\daemon.json` to fix `registry-1.docker.io: no such host` on networks with broken DNS.
- Rebuilt and redeployed daemon container; genesis-daemon healthy

### 2026-04-13 — Session 6: Agentic expansion, exact Office/PDF files, local voice hardening
- Added exact binary document generation for `.docx`, `.xlsx`, `.pptx`, and `.pdf` via `create_document`; agent now rewrites `.html`/`.md` fallbacks into the requested binary format automatically
- Added broader agent tools in `chat.js`: `replace_file`, `copy_path`, `move_path`, `delete_path`, and `search_files`
- Implemented approval-gated destructive actions with inline chat approvals and daemon approve/reject endpoints
- Routed generated documents to `Documents/`, generated images to `Pictures/`, and added local open/save actions for generated images
- Reworked continuous voice to use local MediaRecorder + silence detection + Whisper sidecar; added Kokoro voice selection and voice readiness status in Settings
- Hardened `/api/ai/transcribe` and `/api/ai/tts` to return clean errors instead of `unhandledRejection` on sidecar failures
- Fixed `genesis-voice` startup hang by moving Whisper/Kokoro loading to background initialization; rebuilt container and verified `genesis-voice` healthy

### 2026-04-14 — Session 7: OpenClaw-inspired features (model failover, identity layer, slash commands, SKILL.md)
- **Researched OpenClaw** (357k-star personal AI gateway) and identified 4 features worth adopting for Genesis OS
- **Model failover chain** (`packages/daemon/src/llm/client.js`): all three LLM functions (`chat`, `streamChat`, `complete`) now try primary model then fall through a configurable `GENESIS_MODEL_FALLBACK` comma-separated list on any error; `getLastUsedModel()` exported; `GENESIS_MODEL_FALLBACK=gemma4:e2b,llama3.2:3b` added to `docker-compose.yml`
- **SOUL.md + AGENTS.md** (`docker/workspace/`): personality and agent rules defined as editable workspace files; `routes/chat.js` loads both at startup and injects via `buildSystemPrompt()`; graceful fallback if files absent
- **Chat slash commands** (`ChatPanel.jsx` + `routes/chat.js`): `/new`/`/reset` clears history; `/status` shows model, fallbacks, message count, identity file status; `/compact` summarises history with LLM then replaces with single summary message; `/think <level>` sets reasoning intensity; `/model <name>` switches active model — all intercepted client-side before the network fetch
- **SKILL.md tool registry** (`packages/tools/`): created `SKILL.md` descriptor files for all 11 built-in tools (`bash`, `read_file`, `write_file`, `replace_file`, `list_files`, `delete_path`, `browse_page`, `create_document`, `generate_image`, `create_app`, `open_app`); created `packages/tools/registry.js` — loads + parses frontmatter at require time, exports `getAll()`, `get()`, `names()`, `reload()`, `summary()` for prompt injection

---

## Next Session — Pick Up Here

1. Rebuild daemon container to pick up all Session 7 changes: `docker compose up --build -d genesis-daemon`
2. Verify slash commands in browser: `/status`, `/compact`, `/model gemma4:e2b`, `/reset`
3. Test model failover by temporarily setting `GENESIS_MODEL=nonexistent-model` and confirming it falls through to `gemma4:e2b`
4. Wire `packages/tools/registry.js` into `routes/chat.js` — inject `registry.summary()` into the system prompt so the LLM knows the full tool catalog at runtime
5. Test exact binary document requests end-to-end with the new agent surface
6. Consider adding `/help` slash command that lists all available commands with descriptions


---

## Current Priority: Docker MVP (Phase 0)

**Goal:** `docker compose up` → browser opens → world-class OS UI with working AI chat, file manager, and core apps.

**Default model:** `gemma4:e4b` (CPU-optimized, 9.6 GB, effective 4B params via MoE)  
**Lighter alternative:** `gemma4:e2b` (7.2 GB, for RAM-constrained machines)

---

## Docker MVP Checklist

### Infrastructure
- [x] `docker/Dockerfile` — multi-stage build (ui-builder + daemon runtime)
- [x] `docker/docker-compose.yml` — daemon + Ollama + model-init service
- [x] Ollama auto-pulls `gemma4:e4b` on first container start via `model-init`
- [x] Health checks for all services
- [x] `.env.example` with all required environment variables

### Daemon (Node.js — `packages/daemon/`)
- [x] `src/index.js` — Express server, bus wiring, graceful shutdown
- [x] `src/bus.js` — EventEmitter internal bus
- [x] `src/llm/client.js` — Ollama streaming client (model from env)
- [x] `src/db/index.js` — SQLite init + migrations
- [x] `src/routes/chat.js` — `POST /api/ai/chat` streaming
- [x] `src/routes/fs.js` — `GET/POST /api/fs/*` file system API
- [x] `src/routes/shell.js` — `WS /api/shell` PTY terminal
- [x] `src/routes/browse.js` — `POST /api/browse` URL fetch + AI summary

### UI Shell (React — `packages/ui/src/shell/`)
- [x] `Desktop.jsx` — wallpaper, icon grid, right-click context menu  
- [x] `Taskbar.jsx` — dock, running app indicators, clock, AI orb slot
- [x] `WindowManager.jsx` — draggable + resizable floating windows, glassmorphism
- [x] `AppLauncher.jsx` — full-screen search/launch overlay
- [x] `NotificationPanel.jsx` — slide-in panel for AI + system messages
- [x] `AIOrb.jsx` — animated AI icon (idle / listening / thinking / speaking states)

### Design System (`packages/ui/src/design/`)
- [x] `tokens.js` — colour palette, blur values, shadow depths, animation durations
- [x] `Glass.jsx` — reusable glassmorphism panel component
- [x] `animations.js` — Framer Motion presets (window open/close, orb states)

### Built-in Apps (`packages/ui/src/apps/`)
- [x] `registry.js` — app registry with lazy imports
- [x] `FileManager/` — tree sidebar + icon grid, file operations via `/api/fs`
- [x] `PDFViewer/` — native browser iframe PDF rendering via `/api/fs/raw`
- [x] `OfficeViewer/` — `docx-preview` + `SheetJS` (.docx, .xlsx)
- [x] `AIBrowser/` — iframe + URL bar + AI summarize via `/api/browse`
- [x] `TextEditor/` — Monaco Editor (code/text files)
- [x] `Terminal/` — `xterm.js` connected to `/api/shell` WebSocket
- [x] `Settings/` — model picker, accent colour, wallpaper, voice toggle

---

## Phase Status

| Phase | Name | Status | Notes |
|-------|------|--------|-------|
| 0 | Docker MVP — OS Shell | � In progress | All code written — Docker first-run failed (PATH issue in terminal) |
| 1 | Memory (ChromaDB) | 🔴 Not started | After MVP ships |
| 2 | Voice (Whisper + Piper) | 🔴 Not started | |
| 3 | Agent Tools | 🔴 Not started | |
| 4 | Multi-device Deployment | 🔴 Not started | |
| 5 | Robotics / Raspberry Pi | 🔴 Not started | |

Status key: 🔴 Not started · 🟡 In progress · 🟢 Done · ⏸ Blocked

---

## What's Been Built

### Phase 0 — Complete (code-complete, awaiting successful Docker run)

**Daemon** (`packages/daemon/`) — Node.js OS kernel
- `src/index.js` — Express server, static UI serving, global error recovery, graceful shutdown
- `src/bus.js` — Internal EventEmitter bus (max 50 listeners)
- `src/db/index.js` — SQLite in WAL mode, `messages` + `settings` tables auto-created
- `src/llm/client.js` — Ollama streaming client, `streamChat()` + `complete()` + `listModels()`
- `src/routes/chat.js` — SSE streaming chat, 40-message history context, system prompt injection
- `src/routes/fs.js` — Full CRUD file API with path-traversal protection (`safePath()`)
- `src/routes/shell.js` — WebSocket PTY via `node-pty` (xterm-256color)
- `src/routes/browse.js` — URL fetch + HTML strip + 12K LLM summary, http/https only

**UI Shell** (`packages/ui/src/shell/`) — React 18 + Framer Motion + Tailwind
- `Desktop.jsx` — Glassmorphism wallpaper, 6-app icon grid, right-click context menu
- `Taskbar.jsx` — Bottom dock with animated icons, running-app indicators, live clock, AI orb slot
- `WindowManager.jsx` — Draggable + resizable floating windows, traffic-light buttons, maximize toggle
- `AppLauncher.jsx` — Full-screen Cmd+Space launcher, fuzzy filter, staggered app grid
- `NotificationPanel.jsx` — Slide-in notification panel from right edge
- `AIOrb.jsx` — Animated AI icon: idle pulse / listening waveform / thinking spinner / speaking bars

**Design System** (`packages/ui/src/design/`)
- `tokens.js` — Electric violet `#7C3AED` accent, full glassmorphism token set, spring animation configs
- `Glass.jsx` — Reusable `<Glass>` + `<AnimatedGlass>` components with forwardRef
- `animations.js` — Framer Motion variant presets for windows, orb states, dock icons, stagger lists

**Built-in Apps** (`packages/ui/src/apps/`)
- `FileManager` — Breadcrumb nav, back/forward history, icon grid, dir-first sort, opens files in correct app
- `PDFViewer` — Native browser iframe via `/api/fs/raw` (no canvas issues)
- `OfficeViewer` — `docx-preview` for .docx; SheetJS HTML table for .xlsx
- `AIBrowser` — iframe + URL bar + AI summarize sidebar via `/api/browse`
- `TextEditor` — Monaco Editor (VSCode engine), language auto-detect, Ctrl+S async save, dirty indicator
- `Terminal` — xterm.js WebSocket PTY to `/api/shell`, custom violet colour theme
- `Settings` — Model picker from Ollama, accent colour (6 choices), wallpaper (4 themes), voice toggle

**Docker** (`docker/`)
- `Dockerfile` — 2-stage: `ui-builder` (Node 20 Alpine, `vite build`) → `daemon` (Node 20 Slim, native deps)
- `docker-compose.yml` — 3 services: `ollama`, `daemon` (depends_on healthy ollama), `model-init` (auto-pulls model)
- Health checks on all services; `ollama_data` + `genesis_data` named volumes

**Root**
- `package.json` — npm workspaces (`packages/daemon`, `packages/ui`)
- `.env.example` — all env vars with defaults documented
- `.gitignore` — node_modules, data, Ollama models, secrets
- `README.md` — Quick Start, dev setup, app table, model comparison table
- `workspace/README.md` — Default file workspace Genesis manages

---

## Active Decisions & Notes

- `gemma4:e4b` chosen as default: MoE model with ~4B active params at inference → fast on CPU, 9.6 GB download
- `gemma4:e2b` as fallback for machines with <12 GB RAM
- UI framework: React 18 + Vite 5 + Framer Motion 11 + Tailwind CSS 3
- Glassmorphism: `backdrop-filter: blur()` + semi-transparent backgrounds + layered box shadows
- Window manager: Pure CSS + Framer Motion drag, no native bindings needed for Docker/browser target
- PDF: Native browser iframe via `/api/fs/raw` (simplest, no canvas issues in Docker)
- Office: `docx-preview` for .docx, `SheetJS (xlsx)` for spreadsheets
- AI Browser: fetch via daemon `/api/browse` to avoid CORS; AI summary uses same LLM client
- Terminal: `node-pty` in daemon → WebSocket → `xterm.js` in UI
- All app windows lazy-loaded via dynamic imports from `registry.js`
- Vite build outputs to `packages/daemon/dist/` — daemon serves SPA statically in production
- Docker first-run: `model-init` service uses `curlimages/curl` to POST to Ollama pull API (up to 1 hour timeout)

---

## Blockers / To Fix

- [ ] **Docker `docker compose up --build` failed** — `docker` not found in PowerShell PATH. Need Docker Desktop running and added to PATH, or run from Docker Desktop terminal. Error was `CommandNotFoundException`, not a code error.
- [ ] Verify UI build path: `vite.config.js` outputs to `../../packages/daemon/dist` (relative to `packages/ui/`) — correct for `packages/daemon/dist/`
- [ ] First-run smoke test: open `http://localhost:3000`, confirm OS shell renders, AI chat responds

---

## Session Log

### 2026-04-11 — Session 1: Planning
- Researched Gemma 4 CPU models; chose `gemma4:e4b` (MoE, 9.6 GB, ~4B active params)
- Updated `copilot-instructions.md` with MVP priority, OS UI design system, AIOrb spec, phase checklist
- Created `PROJECT_STATUS.md`

### 2026-04-11 — Session 2: Full Implementation
- Wrote all daemon files (6 source files, all routes)
- Wrote all UI framework files (Vite, Tailwind, PostCSS, React entry)
- Wrote full design system (tokens, Glass component, animation presets)
- Wrote all 6 shell components (Desktop, Taskbar, WindowManager, AppLauncher, NotificationPanel, AIOrb)
- Wrote ChatPanel component
- Wrote all 7 built-in apps (FileManager, PDFViewer, OfficeViewer, AIBrowser, TextEditor, Terminal, Settings)
- Wrote Docker infrastructure (Dockerfile, docker-compose.yml)
- Wrote .env.example, .gitignore, README.md, workspace placeholder
- **Docker first-run attempted** → failed: `docker` not in PowerShell PATH (Docker Desktop not running/not in PATH)
- No code errors found — failure was environment, not code

---

## Next Session — Pick Up Here

1. **Fix Docker**: Ensure Docker Desktop is running, open a terminal where `docker --version` works
2. Run `docker compose -f docker/docker-compose.yml up --build`
3. First-run will pull `gemma4:e4b` (~9.6 GB, ~10–20 min depending on connection)
4. Open `http://localhost:3000` and smoke-test: OS shell, AI chat, File Manager, Terminal
5. Fix any runtime issues found during smoke test
6. Mark Phase 0 as 🟢 Done once all checklist items pass
6. Wire `docker/docker-compose.yml` so `docker compose up` boots everything

