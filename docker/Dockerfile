# ─── Stage 1: Build UI ────────────────────────────────────────────────────────
FROM node:20-alpine AS ui-builder

WORKDIR /app
COPY package.json ./
COPY packages/ui/package.json ./packages/ui/
COPY packages/daemon/package.json ./packages/daemon/

RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npm install --workspace=packages/ui

COPY packages/ui ./packages/ui
RUN cd packages/ui && npx vite build --outDir ../daemon/dist --emptyOutDir

# ─── Stage 2: Daemon runtime ──────────────────────────────────────────────────
FROM node:20-slim AS daemon

# node-pty requires python3/make/g++ to compile its native addon.
# curl is needed to pre-download node headers (bypassing corporate SSL proxy with -k).
# Other tools are used by the agentic bash tool: git, jq, wget, zip, unzip, bc, file,
# procps (ps/top), findutils, grep, sed, gawk, ca-certificates for curl HTTPS.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv make g++ ca-certificates curl \
    git jq wget zip unzip bc file procps findutils grep sed gawk \
    && rm -rf /var/lib/apt/lists/*

# Allow pip to install into the system Python without a venv (PEP 668 override).
# This lets the AI agent run `pip install <pkg>` freely inside the container.
RUN pip3 config set global.break-system-packages true

# Pre-install common Python packages the AI agent frequently needs.
RUN pip3 install --no-cache-dir \
    pandas openpyxl xlrd numpy requests beautifulsoup4 \
    Pillow matplotlib lxml python-docx \
    pypdf pdfplumber

WORKDIR /app

COPY package.json ./
COPY packages/daemon/package.json ./packages/daemon/

# Corporate proxy fix: pre-download node headers with curl -k (SSL bypass),
# then point node-gyp to the local cache via npm_config_nodedir so it never
# attempts its own HTTPS download during npm install.
RUN node_ver=$(node --version | sed 's/v//') \
    && curl -fk -o /tmp/nh.tgz "https://nodejs.org/download/release/v${node_ver}/node-v${node_ver}-headers.tar.gz" \
    && mkdir -p /root/.node-gyp/${node_ver} \
    && tar xzf /tmp/nh.tgz -C /root/.node-gyp/${node_ver} --strip-components=1 \
    && printf '9' > /root/.node-gyp/${node_ver}/installVersion \
    && rm /tmp/nh.tgz

RUN npm_config_nodedir=/root/.node-gyp/$(node --version | sed 's/v//') \
    npm install --workspace=packages/daemon --omit=dev

# Copy built UI into daemon's dist folder
COPY --from=ui-builder /app/packages/daemon/dist ./packages/daemon/dist

COPY packages/daemon/src ./packages/daemon/src

# Workspace data volume mount point
RUN mkdir -p /workspace /data

ENV GENESIS_PORT=3000
ENV GENESIS_DATA_DIR=/data
ENV GENESIS_PROJECT_ROOT=/workspace
ENV GENESIS_MODEL=gemma4:e4b
ENV OLLAMA_BASE_URL=http://ollama:11434
ENV GENESIS_USER_NAME=User
ENV GENESIS_APPROVAL_MODE=true
ENV GENESIS_VOICE_ENABLED=false
ENV GENESIS_FILE_WATCHER_ENABLED=true
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/ai/models').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/packages/daemon
CMD ["node", "src/index.js"]
