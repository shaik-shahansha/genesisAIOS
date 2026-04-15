'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const db = require('../db');

const router = express.Router();
const ROOT = path.resolve(process.env.GENESIS_PROJECT_ROOT || path.join(__dirname, '../../../../workspace'));

// POST /api/apps/create  { name, description, icon, html_content }
router.post('/create', async (req, res) => {
  const { name, description, icon = '🧩', html_content } = req.body;
  if (!name || !html_content) {
    return res.status(400).json({ error: 'name and html_content required' });
  }

  const id = uuidv4();
  const appDir = path.join(ROOT, 'apps', name.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'index.html'), html_content, 'utf8');

  db.prepare(
    'INSERT INTO created_apps (id, name, description, icon, html_content) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, description || '', icon, html_content);

  res.json({ ok: true, id, name, icon });
});

// GET /api/apps/list
router.get('/list', (_req, res) => {
  const rows = db
    .prepare('SELECT id, name, description, icon, created_at FROM created_apps ORDER BY created_at DESC')
    .all();
  res.json({ apps: rows });
});

// GET /api/apps/:id — get full app definition
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM created_apps WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

// DELETE /api/apps/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM created_apps WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/apps/shortcut  { filePath, name }  — create a desktop shortcut (mini app that opens the file)
router.post('/shortcut', async (req, res) => {
  const { filePath, name } = req.body;
  if (!filePath || !name) return res.status(400).json({ error: 'filePath and name required' });
  const { v4: shortId } = require('uuid');
  const ext = filePath.split('.').pop().toLowerCase();
  const appMap = { pdf: 'pdf', docx: 'office', xlsx: 'office', pptx: 'office', doc: 'office', md: 'editor', txt: 'editor', js: 'editor', ts: 'editor', py: 'editor', html: 'editor' };
  const appId = appMap[ext] || 'editor';
  const icon = { pdf: '📄', docx: '📝', xlsx: '📊', pptx: '📊', png: '🖼️', jpg: '🖼️', mp4: '🎬' }[ext] || '📂';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title></head><body style="margin:0;background:#1a1625;display:flex;align-items:center;justify-content:center;height:100vh;color:white;font-family:sans-serif;"><script>window.parent.postMessage({type:'genesis_open_app',appId:'${appId}',props:{filePath:'${filePath}'}}, '*');<\/script><p>Opening ${name}\u2026</p></body></html>`;
  const id = uuidv4();
  db.prepare('INSERT INTO created_apps (id, name, description, icon, html_content) VALUES (?, ?, ?, ?, ?)').run(id, name, `Shortcut to ${filePath}`, icon, html);
  res.json({ ok: true, id, icon });
});

module.exports = router;
