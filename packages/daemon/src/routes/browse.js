'use strict';

const express = require('express');
const { complete } = require('../llm/client');

const router = express.Router();

const MAX_TEXT = 12_000; // approx chars to send to LLM
const ALLOW_INSECURE_TLS = process.env.GENESIS_ALLOW_INSECURE_TLS !== 'false';

function normalizeUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) throw new Error('url required');
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs allowed');
  }
  return parsed;
}

function injectProxyEnhancements(html, targetUrl) {
  const baseTag = `<base href="${targetUrl.href}">`;
  const navScript = `
<script>
(() => {
  const toProxy = (value) => value ? '/api/browse/proxy?url=' + encodeURIComponent(value) : value;
  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    event.preventDefault();
    const absolute = new URL(href, document.baseURI).toString();
    window.location.href = toProxy(absolute);
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    const action = new URL(form.getAttribute('action') || document.baseURI, document.baseURI);
    const params = new URLSearchParams(new FormData(form));
    if ((form.method || 'get').toLowerCase() === 'get') {
      action.search = params.toString();
      window.location.href = toProxy(action.toString());
    }
  }, true);
})();
</script>`;

  let output = html
    .replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}${navScript}`);
  } else {
    output = `${baseTag}${navScript}${output}`;
  }

  return output;
}

// GET /api/browse/proxy?url=https://example.com
router.get('/proxy', async (req, res) => {
  let target;
  try {
    target = normalizeUrl(req.query.url);
  } catch (err) {
    return res.status(400).send(String(err.message));
  }

  try {
    if (ALLOW_INSECURE_TLS) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const upstream = await fetch(target.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GenesisOS/0.1)',
        Accept: '*/*',
      },
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });

    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('X-Frame-Options', 'ALLOWALL');

    if (contentType.includes('text/html')) {
      const html = await upstream.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(injectProxyEnhancements(html, target));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  } catch (err) {
    return res.status(502).send(`Proxy failed: ${err.message}`);
  }
});

// POST /api/browse  { url, question? }
router.post('/', async (req, res) => {
  const { url, question } = req.body;
  let parsed;
  try {
    parsed = normalizeUrl(url);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    if (ALLOW_INSECURE_TLS) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const fetchRes = await fetch(parsed.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GenesisOS/0.1)',
        Accept: 'text/html,text/plain',
      },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    });

    if (!fetchRes.ok) {
      return res.status(502).json({ error: `Fetch failed: ${fetchRes.status}` });
    }

    const contentType = fetchRes.headers.get('content-type') || '';
    let text = await fetchRes.text();

    // Strip HTML tags for a rough text extract
    if (contentType.includes('html')) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT) + '\n...[truncated]';

    const prompt = question
      ? `Answer this question about the page: "${question}"\n\nPage content:\n${text}`
      : `Summarize this web page concisely in 3-5 bullet points:\n\n${text}`;

    const summary = await complete([
      { role: 'system', content: 'You are a helpful web research assistant.' },
      { role: 'user', content: prompt },
    ]);

    res.json({ url: parsed.href, summary, textLength: text.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
