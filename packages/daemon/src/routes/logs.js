'use strict';

const express = require('express');
const { logs, listeners } = require('../logger');

const router = express.Router();

// GET /api/logs — return buffered logs (last 1000 entries)
router.get('/', (_req, res) => {
  res.json({ logs });
});

// GET /api/logs/stream — SSE live stream
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send all buffered logs immediately so the viewer shows history on connect
  for (const entry of logs) {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  }

  // Send a heartbeat comment every 15 s to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  const send = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  listeners.add(send);

  req.on('close', () => {
    listeners.delete(send);
    clearInterval(heartbeat);
  });
});

module.exports = router;
