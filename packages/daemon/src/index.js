'use strict';

// MUST be first import so console interception starts before any other module logs
require('./logger');

const express = require('express');
const expressWs = require('express-ws');
const cors = require('cors');
const path = require('path');
const bus = require('./bus');
const db = require('./db');
const auth = require('./auth');
const shellHandler = require('./routes/shell');
const { ensureWorkspaceStructure } = require('./workspace');

const PORT = process.env.GENESIS_PORT || 3000;
const UI_DIST = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../dist')
  : path.join(__dirname, '../dist');

async function start() {
  await ensureWorkspaceStructure();

  const app = express();
  expressWs(app);

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Serve built UI
  app.use(express.static(UI_DIST));

  // API routes
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api', auth.requireAuth);
  app.use('/api/ai', require('./routes/chat'));
  app.use('/api/fs', require('./routes/fs'));
  app.use('/api/browse', require('./routes/browse'));
  app.use('/api/image', require('./routes/image'));
  app.use('/api/apps', require('./routes/apps'));
  app.use('/api/logs', require('./routes/logs'));
  app.ws('/api/shell', (ws, req, next) => {
    if (!auth.hasPassword() || auth.getSession(req)) return next();
    ws.close();
    return undefined;
  }, shellHandler);

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });

  // Global error handler
  app.use((err, _req, res, _next) => {
    console.error('[daemon] unhandled error:', err.message);
    res.status(500).json({ error: err.message });
  });

  app.listen(PORT, () => {
    console.log(`[genesis] daemon running on http://localhost:${PORT}`);
    bus.emit('daemon:ready', { port: PORT });

    // Pre-load the LLM into Ollama memory so the first chat message is instant.
    (async () => {
      const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
      const model = process.env.GENESIS_MODEL || 'gemma4:e4b';
      console.log(`[genesis] warming up model: ${model}`);
      try {
        const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: '', keep_alive: '10m' }),
          signal: AbortSignal.timeout(120_000),
        });
        await res.text().catch(() => {});
        if (res.ok) console.log(`[genesis] model "${model}" loaded and ready`);
        else console.warn(`[genesis] warmup got ${res.status} — model may not be pulled yet`);
      } catch (err) {
        console.warn(`[genesis] warmup failed (Ollama not ready?): ${err.message}`);
      }
    })();
  });

  process.on('uncaughtException', (err) => {
    console.error('[daemon] uncaughtException:', err.message);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[daemon] unhandledRejection:', reason);
  });
}

start().catch((err) => {
  console.error('[daemon] startup failed:', err);
  process.exit(1);
});
