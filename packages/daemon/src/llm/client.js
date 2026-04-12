'use strict';

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const DEFAULT_MODEL = process.env.GENESIS_MODEL || 'gemma4:e4b';

/**
 * Non-streaming chat via native Ollama /api/chat endpoint.
 * Supports tool_calls (works with Gemma 4's native function-calling).
 * The native API returns tool_calls[i].function.arguments as an object;
 * we normalize to JSON string so runAgent's JSON.parse() still works.
 */
async function chat(messages, { model, tools, signal } = {}) {
  const body = {
    model: model || DEFAULT_MODEL,
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

module.exports = { streamChat, complete, listModels, chat };
