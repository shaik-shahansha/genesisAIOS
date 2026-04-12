'use strict';

const express = require('express');
const {
  authStatus,
  clearPassword,
  createSession,
  destroySession,
  hasPassword,
  setPassword,
  verifyPassword,
} = require('../auth');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json(authStatus(req));
});

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!hasPassword()) {
    return res.json({ passwordSet: false, authenticated: true });
  }
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  createSession(res);
  return res.json({ passwordSet: true, authenticated: true });
});

router.post('/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

router.post('/password', (req, res) => {
  const { currentPassword, newPassword, remove } = req.body || {};

  if (hasPassword()) {
    if (!currentPassword || !verifyPassword(currentPassword)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
  }

  if (remove) {
    clearPassword();
    destroySession(req, res);
    return res.json({ ok: true, passwordSet: false });
  }

  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  setPassword(newPassword);
  createSession(res);
  return res.json({ ok: true, passwordSet: true });
});

module.exports = router;