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

function rewriteUrlAttr(value, base, proxyOrigin) {
  if (!value) return value;
  const v = value.trim();
  if (!v || v.startsWith('#') || v.startsWith('javascript:') || v.startsWith('data:') ||
      v.startsWith('mailto:') || v.startsWith('tel:') || v.includes('/api/browse/proxy')) {
    return value;
  }
  try {
    const absolute = new URL(v, base).toString();
    return `${proxyOrigin}/api/browse/proxy?url=${encodeURIComponent(absolute)}`;
  } catch {
    return value;
  }
}

/**
 * Minimal HTML injection: strip CSP/XFO meta tags and inject a small script
 * that upgrades link clicks and form submits to go through the proxy.
 * Sub-resource requests (fetch, XHR, script/img src) are handled by the
 * proxy-sw.js service worker registered in the UI layer.
 */
function injectProxyEnhancements(html, targetUrl, proxyOrigin) {
  const base = targetUrl.href;

  let output = html
    .replace(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '')
    .replace(/<meta[^>]+http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

  const baseTag = `<base href="${base}">`;
  const navScript = `
<script>
(() => {
  const PROXY = ${JSON.stringify(proxyOrigin)};
  const REAL_URL = ${JSON.stringify(base)};
  const toProxy = (url) => PROXY + '/api/browse/proxy?url=' + encodeURIComponent(url);
  const nativeSubmit = HTMLFormElement.prototype.submit;
  const buildProxyForm = (actionUrl, method, formData) => {
    const proxyForm = document.createElement('form');
    proxyForm.method = 'POST';
    proxyForm.action = toProxy(actionUrl) + '&method=' + encodeURIComponent(method);
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) continue;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      proxyForm.appendChild(input);
    }
    return proxyForm;
  };
  const buildFormUrl = (form) => {
    const rawAction = form.getAttribute('action') || REAL_URL;
    const action = new URL(rawAction, REAL_URL);
    const params = new URLSearchParams(new FormData(form));
    if ((form.method || 'get').toLowerCase() === 'get') {
      action.search = params.toString();
    }
    return action.toString();
  };
  const navigateForm = (form) => {
    const method = (form.method || 'get').toLowerCase();
    const actionUrl = buildFormUrl(form);
    if (method === 'get') {
      window.location.href = toProxy(actionUrl);
      return;
    }

    const proxyForm = buildProxyForm(actionUrl, method.toUpperCase(), new FormData(form));
    document.body.appendChild(proxyForm);
    nativeSubmit.call(proxyForm);
  };

  // Tell the parent UI what real URL this page represents
  try { window.parent.postMessage({ type: 'genesis-nav', url: REAL_URL }, '*'); } catch(_) {}

  HTMLFormElement.prototype.submit = function proxiedSubmit() {
    navigateForm(this);
  };

  const nativeRequestSubmit = HTMLFormElement.prototype.requestSubmit;
  if (nativeRequestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function proxiedRequestSubmit(submitter) {
      if (submitter && submitter.name && !submitter.disabled) {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = submitter.name;
        hidden.value = submitter.value;
        hidden.dataset.genesisSubmitter = 'true';
        this.appendChild(hidden);
      }
      navigateForm(this);
      this.querySelectorAll('input[data-genesis-submitter="true"]').forEach((node) => node.remove());
    };
  }

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') ||
        href.startsWith('mailto:') || href.startsWith('tel:')) return;
    event.preventDefault();
    const absolute = new URL(href, ${JSON.stringify(base)}).toString();
    window.location.href = toProxy(absolute);
  }, true);

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    navigateForm(form);
  }, true);
})();
</script>`;

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}${baseTag}${navScript}`);
  } else {
    output = `${baseTag}${navScript}${output}`;
  }

  return output;
}

// /api/browse/proxy?url=https://example.com[&method=POST]
router.all('/proxy', async (req, res) => {
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

    const upstreamMethod = String(req.query.method || req.method || 'GET').toUpperCase();
    const isBodyMethod = !['GET', 'HEAD'].includes(upstreamMethod);
    const contentType = req.get('content-type') || 'application/x-www-form-urlencoded; charset=UTF-8';
    let upstreamBody;

    if (isBodyMethod) {
      if (contentType.includes('application/json') && typeof req.body === 'object') {
        upstreamBody = JSON.stringify(req.body);
      } else if (typeof req.body === 'string') {
        upstreamBody = req.body;
      } else {
        upstreamBody = new URLSearchParams(
          Object.entries(req.body || {}).flatMap(([key, value]) => {
            if (Array.isArray(value)) {
              return value.map((entry) => [key, entry]);
            }
            return [[key, value]];
          })
        ).toString();
      }
    }

    const upstream = await fetch(target.href, {
      method: upstreamMethod,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GenesisOS/0.1)',
        Accept: '*/*',
        ...(isBodyMethod ? { 'Content-Type': contentType } : {}),
      },
      body: isBodyMethod ? upstreamBody : undefined,
      signal: AbortSignal.timeout(20_000),
      redirect: 'follow',
    });

    const responseType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    const proxyOrigin = `${req.protocol}://${req.get('host')}`;

    if (responseType.includes('text/html')) {
      const html = await upstream.text();
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(injectProxyEnhancements(html, target, proxyOrigin));
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', responseType);
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
