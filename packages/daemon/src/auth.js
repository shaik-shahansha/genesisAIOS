'use strict';

const crypto = require('crypto');
const db = require('./db');

const COOKIE_NAME = 'genesis_session';
const PASSWORD_KEY = 'auth.password_hash';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function parseCookies(header = '') {
  return header.split(';').reduce((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

function deleteSetting(key) {
  db.prepare('DELETE FROM settings WHERE key = ?').run(key);
}

function hasPassword() {
  return Boolean(getSetting(PASSWORD_KEY));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password) {
  const stored = getSetting(PASSWORD_KEY);
  if (!stored) return false;
  const [, salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function setPassword(password) {
  setSetting(PASSWORD_KEY, hashPassword(password));
}

function clearPassword() {
  deleteSetting(PASSWORD_KEY);
  db.prepare('DELETE FROM auth_sessions').run();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(res) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  db.prepare('INSERT INTO auth_sessions (id, token_hash, expires_at) VALUES (?, ?, ?)').run(id, tokenHash, expiresAt);
  setSessionCookie(res, token, expiresAt);
  return { id, expiresAt };
}

function setSessionCookie(res, token, expiresAt) {
  const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (token) {
    db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
  }
  clearSessionCookie(res);
}

function getSession(req) {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= unixepoch()').run();
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const row = db.prepare('SELECT * FROM auth_sessions WHERE token_hash = ? AND expires_at > unixepoch()').get(hashToken(token));
  return row || null;
}

function authStatus(req) {
  const passwordSet = hasPassword();
  const authenticated = passwordSet ? Boolean(getSession(req)) : true;
  return { passwordSet, authenticated };
}

function requireAuth(req, res, next) {
  if (!hasPassword()) return next();
  if (getSession(req)) return next();
  return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
}

function requireWsAuth(info, next) {
  if (!hasPassword()) return next(true);
  const req = info.req || info;
  return next(Boolean(getSession(req)));
}

module.exports = {
  authStatus,
  clearPassword,
  clearSessionCookie,
  createSession,
  destroySession,
  getSession,
  hasPassword,
  requireAuth,
  requireWsAuth,
  setPassword,
  verifyPassword,
};