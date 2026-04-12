'use strict';

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { createReadStream, statSync } = require('fs');

const router = express.Router();

const ROOT = path.resolve(process.env.GENESIS_PROJECT_ROOT || path.join(__dirname, '../../../../workspace'));

/** Resolve a user-supplied relative path safely within ROOT */
function safePath(rel) {
  const resolved = path.resolve(ROOT, rel || '');
  if (!resolved.startsWith(ROOT)) throw new Error('Path traversal denied');
  return resolved;
}

// GET /api/fs/list?path=relative/dir
router.get('/list', async (req, res) => {
  try {
    const dir = safePath(req.query.path || '');
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (e) => {
        const full = path.join(dir, e.name);
        let size = 0;
        try {
          size = statSync(full).size;
        } catch {}
        return {
          name: e.name,
          type: e.isDirectory() ? 'dir' : 'file',
          path: path.relative(ROOT, full).replace(/\\/g, '/'),
          size,
          ext: e.isFile() ? path.extname(e.name).toLowerCase().slice(1) : null,
        };
      })
    );
    res.json({ items, cwd: path.relative(ROOT, dir).replace(/\\/g, '/') || '.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/fs/read?path=file.txt
router.get('/read', async (req, res) => {
  try {
    const file = safePath(req.query.path || '');
    const stat = await fs.stat(file);
    if (stat.size > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large (>10MB) for text preview' });
    }
    const content = await fs.readFile(file, 'utf8');
    res.json({ content, path: req.query.path });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/fs/raw?path=file.pdf  — binary stream for PDF/office viewer
router.get('/raw', async (req, res) => {
  try {
    const file = safePath(req.query.path || '');
    const stat = await fs.stat(file);
    const ext = path.extname(file).toLowerCase();
    const mime = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', stat.size);
    createReadStream(file).pipe(res);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/fs/write  { path, content }
router.post('/write', async (req, res) => {
  try {
    const { path: rel, content } = req.body;
    if (!rel || content === undefined) return res.status(400).json({ error: 'path and content required' });
    const file = safePath(rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    res.json({ ok: true, path: rel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/fs/mkdir  { path }
router.post('/mkdir', async (req, res) => {
  try {
    const { path: rel } = req.body;
    if (!rel) return res.status(400).json({ error: 'path required' });
    await fs.mkdir(safePath(rel), { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/fs/delete?path=file.txt
router.delete('/delete', async (req, res) => {
  try {
    const file = safePath(req.query.path || '');
    await fs.rm(file, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
