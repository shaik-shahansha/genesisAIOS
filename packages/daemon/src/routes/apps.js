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

module.exports = router;
