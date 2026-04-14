'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const db = require('../db');
const { ensureWorkspaceStructure, ROOT, routeGeneratedPath, safeWorkspacePath } = require('../workspace');

const router = express.Router();
const PROVIDER = (process.env.GENESIS_IMAGE_PROVIDER || 'pollinations').toLowerCase();
const SD_API_URL = process.env.GENESIS_SD_API_URL || 'http://localhost:7860';

async function generateViaSD(prompt) {
  const res = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: 'low quality, blurry, deformed',
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`SD API error: ${res.status}`);
  const data = await res.json();
  const base64 = data.images?.[0];
  if (!base64) throw new Error('No image returned from SD API');
  return Buffer.from(base64, 'base64');
}

async function generateViaPollinations(prompt) {
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&seed=${seed}&nologo=true`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Pollinations error: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// POST /api/image/generate  { prompt: string }
router.post('/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'prompt required' });
  }

  await ensureWorkspaceStructure();

  const relPath = routeGeneratedPath(`generated/img_${uuidv4().slice(0, 8)}.png`, 'image');
  const outDir = path.dirname(safeWorkspacePath(relPath));
  await fs.mkdir(outDir, { recursive: true });
  const filePath = safeWorkspacePath(relPath);

  try {
    let imgBuf;
    if (PROVIDER === 'sd_api') {
      imgBuf = await generateViaSD(prompt);
    } else {
      // default: pollinations (free, no key required)
      imgBuf = await generateViaPollinations(prompt);
    }

    await fs.writeFile(filePath, imgBuf);

    db.prepare(
      'INSERT INTO generated_images (id, prompt, file_path) VALUES (?, ?, ?)'
    ).run(uuidv4(), prompt, relPath);

    res.json({ ok: true, path: relPath, url: `/api/fs/raw?path=${encodeURIComponent(relPath)}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/image/history
router.get('/history', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM generated_images ORDER BY created_at DESC LIMIT 50')
    .all();
  res.json({ images: rows });
});

module.exports = router;
