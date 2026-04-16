'use strict';

const express = require('express');

const router = express.Router();

function browserEnabled() {
  return process.env.GENESIS_BROWSER_ENABLED !== 'false';
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function buildPublicUrl(req) {
  const override = trimTrailingSlash(process.env.GENESIS_BROWSER_PUBLIC_URL || '');
  if (override) return override;

  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = (forwardedProto ? forwardedProto.split(',')[0] : req.protocol) || 'http';
  const forwardedHost = req.get('x-forwarded-host');
  const host = (forwardedHost ? forwardedHost.split(',')[0] : req.get('host')) || 'localhost:3000';
  const hostname = host.split(':')[0] || 'localhost';
  const port = String(process.env.GENESIS_BROWSER_PORT || '8080');
  const isDefaultPort = (protocol === 'http' && port === '80') || (protocol === 'https' && port === '443');

  return `${protocol}://${hostname}${isDefaultPort ? '' : `:${port}`}`;
}

function buildSessionUrl(req) {
  const params = new URLSearchParams({
    usr: process.env.GENESIS_BROWSER_USERNAME || `${process.env.GENESIS_USER_NAME || 'User'} Browser`,
    pwd: process.env.GENESIS_BROWSER_PASSWORD || 'genesis',
    embed: '1',
    volume: '0',
  });

  return `${buildPublicUrl(req)}/?${params.toString()}`;
}

router.get('/config', (req, res) => {
  const enabled = browserEnabled();

  res.json({
    enabled,
    provider: enabled ? 'neko' : 'disabled',
    sessionUrl: enabled ? '/api/browser/session' : null,
    publicUrl: enabled ? buildPublicUrl(req) : null,
    defaultUrl: process.env.GENESIS_BROWSER_DEFAULT_URL || 'https://www.google.com/',
    downloadsPath: '/api/fs/list?path=Downloads',
  });
});

router.get('/session', (req, res) => {
  if (!browserEnabled()) {
    return res.status(503).send('Genesis Browser is disabled.');
  }

  return res.redirect(302, buildSessionUrl(req));
});

module.exports = router;