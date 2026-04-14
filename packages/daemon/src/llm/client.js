'use strict';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const DEFAULT_MODEL = process.env.GENESIS_MODEL || 'gemma4:e4b';

let _addLog;
function getLogger() {
  if (!_addLog) {
    try { _addLog = require('../logger').addLog; } catch { _addLog = () => {}; }
  }
  return _addLog;
}

/**
 * Non-streaming chat via native Ollama /api/chat endpoint.
 * Supports tool_calls (works with Gemma 4's native function-calling).
 * The native API returns tool_calls[i].function.arguments as an object;
 * we normalize to JSON string so runAgent's JSON.parse() still works.
 */
async function chat(messages, { model, tools, signal } = {}) {
  const log = getLogger();
  const usedModel = model || DEFAULT_MODEL;
  const t0 = Date.now();
  log('info', `[llm] chat → ${usedModel} | msgs: ${messages.length}`);

  const body = {
    model: usedModel,
    messages,
    stream: false,
  };
  if (tools && tools.length) body.tools = tools;

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal || AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const json = await res.json();
  const elapsed = Date.now() - t0;
  const msg = json.message || { role: 'assistant', content: '' };

  // Native API: tool_calls[i].function.arguments is already a JS object.
  // Normalise to string so callers can JSON.parse() it uniformly.
  if (msg.tool_calls?.length) {
    msg.tool_calls = msg.tool_calls.map((tc, i) => ({
      id: tc.id || `call_${Date.now()}_${i}`,
      type: 'function',
      function: {
        name: tc.function?.name || '',
        arguments:
          typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments ?? {}),
      },
    }));
  }

  const toolNames = msg.tool_calls?.map((tc) => tc.function?.name).join(', ') || 'none';
  const contentPreview = (msg.content || '').slice(0, 120).replace(/\n/g, ' ');
  const evalDuration = json.eval_duration ? ` | eval: ${(json.eval_duration / 1e9).toFixed(1)}s` : '';
  const promptTokens = json.prompt_eval_count ? ` | prompt_tokens: ${json.prompt_eval_count}` : '';
  const evalTokens = json.eval_count ? ` | eval_tokens: ${json.eval_count}` : '';
  log('info', `[llm] done in ${elapsed}ms${evalDuration}${promptTokens}${evalTokens} | tools: [${toolNames}] | content: "${contentPreview}"`);

  return msg;
}

/**
 * Stream a chat completion from Ollama.
 * Calls onChunk(text) for each streamed token.
 * Returns the full assistant message text.
 * Uses the native /api/chat NDJSON stream format.
 */
async function streamChat(messages, { model, onChunk, signal } = {}) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      stream: true,
    }),
    signal: signal || AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const token = json.message?.content || '';
        if (token) {
          full += token;
          onChunk?.(token);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  // flush remaining buffer
  if (buf.trim()) {
    try {
      const json = JSON.parse(buf);
      const token = json.message?.content || '';
      if (token) { full += token; onChunk?.(token); }
    } catch {}
  }

  return full;
}

/**
 * Non-streaming single completion for internal use (browse summary, etc.)
 */
async function complete(messages, { model } = {}) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages,
      stream: false,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`Ollama error ${res.status}`);
  const json = await res.json();
  return json.message?.content || '';
}

/**
 * List available models from Ollama
 */
async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

/**
 * Pre-load the model into Ollama's memory so the first real request is fast.
 * Uses /api/generate with an empty prompt — Ollama loads the model without
 * generating any tokens, then unloads after keep_alive expires normally.
 */
async function warmup({ model } = {}) {
  const log = getLogger();
  const usedModel = model || DEFAULT_MODEL;
  log('info', `[llm] warming up model: ${usedModel}`);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: usedModel, prompt: '', keep_alive: '10m' }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      await res.text().catch(() => {});
      log('info', `[llm] model "${usedModel}" loaded and ready`);
    } else {
      log('warn', `[llm] warmup got ${res.status} — model may not be pulled yet`);
    }
  } catch (err) {
    log('warn', `[llm] warmup failed (Ollama not ready?): ${err.message}`);
  }
}

module.exports = { streamChat, complete, listModels, chat, warmup };
