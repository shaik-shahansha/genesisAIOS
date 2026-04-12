'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const db = require('../db');
const { streamChat, listModels, chat, complete } = require('../llm/client');

const router = express.Router();
const execAsync = promisify(exec);
const ROOT = path.resolve(process.env.GENESIS_PROJECT_ROOT || path.join(__dirname, '../../../../workspace'));
const MAX_FILE_BYTES = 256 * 1024;

const SYSTEM_PROMPT = `You are Genesis, an AI-native operating system assistant running locally on the user's device.

CRITICAL RULES — follow them without exception:
1. You MUST call a tool for ANY request involving files, folders, commands, browsing, images, or apps. NEVER just describe what you would do.
2. When the user says "create", "write", "make", "generate", "open", "browse", "run", "build", "show" — immediately call the appropriate tool.
3. Do NOT say "I would create..." or "I can create...". Just call write_file, create_folder, generate_image, open_app, run_command, etc.
4. After a tool executes successfully, give a short (1-2 sentence) confirmation only.
5. When generating an image, embed it in your reply as: ![description](url)
6. When creating a mini app, call create_app with complete self-contained HTML.
7. For documents (invoices, reports, letters, etc.): ALWAYS write a .md or .html file via write_file. NEVER use .docx — you cannot produce binary Office files.
8. For "open browser": call open_app with appId "browser".
9. Always chain tools in one agent loop — do not ask the user to confirm before calling tools.

Available appIds for open_app: files, pdf, office, browser, editor, terminal, settings, appbuilder
User name: ${process.env.GENESIS_USER_NAME || 'User'}`;

const TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files or folders inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path from workspace root. Use empty string for root.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file from the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path from workspace root.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file in the workspace with provided content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Create a folder in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the workspace and return its output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_page',
      description: 'Fetch and summarize a web page or answer a question about it.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          question: { type: 'string' },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open a Genesis app in the UI, optionally with props such as a URL or filePath.',
      parameters: {
        type: 'object',
        properties: {
          appId: { type: 'string', description: 'One of files, pdf, office, browser, editor, terminal, settings, appbuilder.' },
          props: { type: 'object' },
        },
        required: ['appId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image from a text prompt and save it to the workspace. Returns the image URL.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed description of the image to generate.' },
        },
        required: ['prompt'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_app',
      description: 'Create a mini app with a name, icon, and HTML/JS/CSS using IndexedDB for local storage. The app will appear as a tile on the desktop and can be opened in a window.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short display name for the app (e.g. "Todo List").' },
          description: { type: 'string', description: 'One-sentence description of what the app does.' },
          icon: { type: 'string', description: 'A single emoji for the app icon.' },
          html_content: { type: 'string', description: 'Complete self-contained HTML with embedded CSS and JS using IndexedDB. Must be a fully functional single-page HTML app. Include dark theme styling matching genesis OS.' },
        },
        required: ['name', 'icon', 'html_content'],
      },
    },
  },
];

// ─── Memory service helpers ───────────────────────────────────────────────────
const MEMORY_URL = process.env.MEMORY_SERVICE_URL;

async function memoryStore(id, role, content) {
  if (!MEMORY_URL || !content?.trim()) return;
  try {
    await fetch(`${MEMORY_URL}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, role, content }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

async function memorySearch(query, n = 3) {
  if (!MEMORY_URL || !query?.trim()) return [];
  try {
    const r = await fetch(`${MEMORY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: n }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

// ─── Gemma 4 / text-format tool-call parser ─────────────────────────────────
// Gemma 4 emits tool calls as text (e.g. <tool_code>func(args)</tool_code>)
// rather than structured tool_calls objects when Ollama doesn't translate them.
// This parser extracts and normalises them so runAgent can execute them.

function parseCallArgs(argsStr) {
  if (!argsStr.trim()) return {};
  // 1. direct JSON
  try { return JSON.parse(argsStr); } catch {}
  // 2. Python-style kwargs with single-quotes / None/True/False
  try {
    const j = argsStr
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/'/g, '"')
      // kwargs: key= → "key":
      .replace(/([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g, '"$1":')
      .replace(/,\s*\}/g, '}')
      .replace(/,\s*\]/g, ']');
    return JSON.parse(`{${j}}`);
  } catch {}
  // 3. regex fallback: grab key='val' / key=123 / key=true
  const result = {};
  const re = /([a-zA-Z_]\w*)\s*=\s*(?:"([^"]*?)"|'([^']*?)'|([\d.]+)|(true|false|null))/g;
  let kv;
  while ((kv = re.exec(argsStr)) !== null) {
    const key = kv[1];
    if (kv[2] !== undefined)      result[key] = kv[2];
    else if (kv[3] !== undefined) result[key] = kv[3];
    else if (kv[4] !== undefined) result[key] = Number(kv[4]);
    else if (kv[5] === 'true')    result[key] = true;
    else if (kv[5] === 'false')   result[key] = false;
    else                          result[key] = null;
  }
  return result;
}

function parseTextToolCalls(content) {
  if (!content) return [];
  const calls = [];
  let m;

  // Pattern 1: <tool_code>func_name(args)</tool_code>  (Gemma 4 native format)
  const re1 = /<tool_code>([\s\S]*?)<\/tool_code>/gi;
  while ((m = re1.exec(content)) !== null) {
    const inner = m[1].trim();
    const fnM = inner.match(/^([a-zA-Z_]\w*)\(([\s\S]*)\)$/s);
    if (fnM) {
      calls.push({
        id: `tc_${Date.now()}_${calls.length}`,
        type: 'function',
        function: { name: fnM[1], arguments: JSON.stringify(parseCallArgs(fnM[2])) },
      });
    }
  }

  // Pattern 2: <tool_call>{"name":"...", "arguments":{...}}</tool_call>
  const re2 = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  while ((m = re2.exec(content)) !== null) {
    try {
      const p = JSON.parse(m[1].trim());
      if (p.name) {
        calls.push({
          id: `tc_${Date.now()}_${calls.length}`,
          type: 'function',
          function: {
            name: p.name,
            arguments: typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments || {}),
          },
        });
      }
    } catch {}
  }

  // Pattern 3: JSON code block  {"name":"...", "arguments":{...}}
  if (!calls.length) {
    const re3 = /```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/gi;
    while ((m = re3.exec(content)) !== null) {
      try {
        const p = JSON.parse(m[1]);
        if (p.name && (p.arguments !== undefined || p.parameters !== undefined)) {
          calls.push({
            id: `tc_${Date.now()}_${calls.length}`,
            type: 'function',
            function: {
              name: p.name,
              arguments: JSON.stringify(p.arguments || p.parameters || {}),
            },
          });
        }
      } catch {}
    }
  }

  return calls;
}

function safePath(rel) {
  const resolved = path.resolve(ROOT, rel || '');
  if (!resolved.startsWith(ROOT)) throw new Error('Path traversal denied');
  return resolved;
}

async function toolListFiles({ path: rel = '' }) {
  const dir = safePath(rel);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = entries.slice(0, 200).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' : 'file',
    path: path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/'),
  }));
  return { cwd: path.relative(ROOT, dir).replace(/\\/g, '/') || '.', items };
}

async function toolReadFile({ path: rel }) {
  const file = safePath(rel);
  const stat = await fs.stat(file);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large to read safely (${stat.size} bytes)`);
  }
  const content = await fs.readFile(file, 'utf8');
  return { path: rel, content };
}

async function toolWriteFile({ path: rel, content }) {
  const file = safePath(rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content, 'utf8');
  return { ok: true, path: rel, bytes: Buffer.byteLength(content || '', 'utf8'), skipFinalLlm: true, finalMessage: `Created \`${rel}\` (${Buffer.byteLength(content || '', 'utf8')} bytes).` };
}

async function toolCreateFolder({ path: rel }) {
  await fs.mkdir(safePath(rel), { recursive: true });
  return { ok: true, path: rel, skipFinalLlm: true, finalMessage: `Created folder \`${rel}\`.` };
}

async function toolRunCommand({ command }) {
  const { stdout, stderr } = await execAsync(command, {
    cwd: ROOT,
    timeout: 30_000,
    maxBuffer: 512 * 1024,
    shell: true,
    env: process.env,
  });
  return {
    stdout: (stdout || '').slice(0, 20_000),
    stderr: (stderr || '').slice(0, 20_000),
  };
}

async function toolGenerateImage({ prompt }) {
  const { v4: genUuid } = require('uuid');
  const provider = (process.env.GENESIS_IMAGE_PROVIDER || 'pollinations').toLowerCase();
  const outDir = path.join(ROOT, 'generated');
  await fs.mkdir(outDir, { recursive: true });

  const filename = `img_${genUuid().slice(0, 8)}.png`;
  const filePath = path.join(outDir, filename);
  const relPath = `generated/${filename}`;

  if (provider === 'sd_api') {
    // SD API — blocking (returns base64)
    const sdUrl = process.env.GENESIS_SD_API_URL || 'http://localhost:7860';
    const r = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, negative_prompt: 'low quality, blurry', width: 512, height: 512, steps: 20 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) throw new Error(`SD API error: ${r.status}`);
    const data = await r.json();
    const buf = Buffer.from(data.images[0], 'base64');
    await fs.writeFile(filePath, buf);

    const db2 = require('../db');
    db2.prepare('INSERT INTO generated_images (id, prompt, file_path) VALUES (?, ?, ?)').run(genUuid(), prompt, relPath);
    return { ok: true, path: relPath, url: `/api/fs/raw?path=${encodeURIComponent(relPath)}` };
  }

  // Pollinations — return direct CDN URL immediately, background-save to workspace
  // Use FLUX.1-schnell model (much faster than default SDXL)
  const encoded = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1_000_000);
  const directUrl = `https://image.pollinations.ai/prompt/${encoded}?model=flux-schnell&width=512&height=512&seed=${seed}&nologo=true`;

  // Background save — non-blocking so agent responds instantly
  const db2 = require('../db');
  const imgId = genUuid();
  db2.prepare('INSERT INTO generated_images (id, prompt, file_path) VALUES (?, ?, ?)').run(imgId, prompt, relPath);
  (async () => {
    try {
      const r = await fetch(directUrl, { signal: AbortSignal.timeout(90_000) });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        await fs.writeFile(filePath, buf);
      }
    } catch { /* best-effort */ }
  })();

  // Return direct URL immediately — browser renders from Pollinations CDN while saving in background
  return { ok: true, path: relPath, url: directUrl };
}

async function toolCreateApp({ name, description, icon, html_content }) {
  const { v4: appUuid } = require('uuid');
  const db2 = require('../db');
  const id = appUuid();

  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const appDir = path.join(ROOT, 'apps', safeName);
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'index.html'), html_content, 'utf8');

  db2.prepare(
    'INSERT INTO created_apps (id, name, description, icon, html_content) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, description || '', icon || '🧩', html_content);

  return { ok: true, id, name, icon: icon || '🧩', action: { type: 'open_app', appId: `userapp_${id}`, props: { appId: id } } };
}

async function toolBrowsePage({ url, question }) {
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    throw new Error('Invalid URL');
  }

  if (process.env.GENESIS_ALLOW_INSECURE_TLS !== 'false') {
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

  if (!fetchRes.ok) throw new Error(`Fetch failed: ${fetchRes.status}`);

  const contentType = fetchRes.headers.get('content-type') || '';
  let text = await fetchRes.text();
  if (contentType.includes('html')) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  text = text.slice(0, 12_000);

  const prompt = question
    ? `Answer this question about the page: "${question}"\n\nPage content:\n${text}`
    : `Summarize this page in concise bullet points:\n\n${text}`;

  const summary = await complete([
    { role: 'system', content: 'You are a web research assistant.' },
    { role: 'user', content: prompt },
  ]);

  return { url: parsed.href, summary };
}

async function runTool(name, args) {
  switch (name) {
    case 'list_files': return toolListFiles(args || {});
    case 'read_file': return toolReadFile(args || {});
    case 'write_file': return toolWriteFile(args || {});
    case 'create_folder': return toolCreateFolder(args || {});
    case 'run_command': return toolRunCommand(args || {});
    case 'browse_page': return toolBrowsePage(args || {});
    case 'open_app': return { action: { type: 'open_app', appId: args?.appId, props: args?.props || {} } };
    case 'generate_image': return toolGenerateImage(args || {});
    case 'create_app': return toolCreateApp(args || {});
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function tryHandleDirectAction(message, onEvent) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const emit = (action) => onEvent?.({ action });

  const openBrowserMatch = text.match(/\b(?:open|launch)\s+(?:the\s+)?browser(?:\s+(?:and\s+)?(?:open|go to)\s+(.+))?$/i);
  if (openBrowserMatch) {
    const rawUrl = (openBrowserMatch[1] || '').trim();
    const normalizedUrl = rawUrl
      ? (/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
      : undefined;
    const action = { type: 'open_app', appId: 'browser', props: normalizedUrl ? { initialUrl: normalizedUrl } : {} };
    emit(action);
    return {
      content: normalizedUrl ? `Opened Browser and navigated to ${normalizedUrl}.` : 'Opened Browser.',
      actions: [action],
    };
  }

  const openAppMap = [
    ['files', 'files'],
    ['file manager', 'files'],
    ['settings', 'settings'],
    ['terminal', 'terminal'],
    ['editor', 'editor'],
    ['pdf viewer', 'pdf'],
    ['office', 'office'],
  ];
  for (const [label, appId] of openAppMap) {
    if (new RegExp(`\\b(?:open|launch)\\s+(?:the\\s+)?${label.replace(/ /g, '\\s+')}\\b`, 'i').test(lower)) {
      const action = { type: 'open_app', appId, props: {} };
      emit(action);
      return { content: `Opened ${label}.`, actions: [action] };
    }
  }

  const folderMatch = text.match(/\bcreate\s+(?:a\s+)?folder(?:\s+(?:named|called))?\s+([A-Za-z0-9._\-/ ]+)$/i);
  if (folderMatch) {
    const folderPath = folderMatch[1].trim().replace(/^['"]|['"]$/g, '');
    await toolCreateFolder({ path: folderPath });
    return { content: `Created folder ${folderPath}.`, actions: [] };
  }

  const fileMatch = text.match(/\bcreate\s+(?:a\s+)?file(?:\s+(?:named|called))?\s+([A-Za-z0-9._\-/]+)(?:\s+with\s+content\s+([\s\S]+))?$/i);
  if (fileMatch) {
    const filePath = fileMatch[1].trim().replace(/^['"]|['"]$/g, '');
    const content = (fileMatch[2] || '').trim().replace(/^['"]|['"]$/g, '');
    await toolWriteFile({ path: filePath, content });
    return { content: `Created file ${filePath}.`, actions: [] };
  }

  const runCommandMatch = text.match(/\b(?:run|execute)\s+(?:command\s+)?([\s\S]+)$/i);
  if (runCommandMatch && !/\b(browser|files|settings|terminal|editor)\b/i.test(lower)) {
    const command = runCommandMatch[1].trim();
    const result = await toolRunCommand({ command });
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || 'No output.';
    return { content: `Command executed.\n\n\`\`\`\n${output.slice(0, 3000)}\n\`\`\``, actions: [] };
  }

  const browseMatch = text.match(/\b(?:browse|summarize|visit|go to)\s+(https?:\/\/\S+|www\.\S+|[A-Za-z0-9.-]+\.[A-Za-z]{2,}\S*)/i);
  if (browseMatch) {
    const rawUrl = browseMatch[1].trim();
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const action = { type: 'open_app', appId: 'browser', props: { initialUrl: normalizedUrl } };
    emit(action);
    return { content: `Opened Browser and navigated to ${normalizedUrl}.`, actions: [action] };
  }

  return null;
}

async function runAgent(messages, { model, onEvent }) {
  const { addLog } = require('../logger');
  const conversation = [...messages];
  const actions = [];
  // Extract the last user message for re-prompt fallback
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';

  for (let step = 0; step < 8; step += 1) {
    addLog('info', `[agent] step ${step} — calling LLM with ${conversation.length} messages`);
    const assistantMessage = await chat(conversation, { model, tools: TOOL_DEFS });

    // Primary: structured tool_calls from Ollama
    let toolCalls = assistantMessage.tool_calls || [];

    // Fallback: parse tool calls embedded as text in the response content
    // (Gemma 4 uses <tool_code>...</tool_code> when Ollama doesn't translate natively)
    if (!toolCalls.length && assistantMessage.content) {
      const parsed = parseTextToolCalls(assistantMessage.content);
      if (parsed.length) {
        addLog('info', `[agent] parsed ${parsed.length} text-format tool call(s) from content`);
        toolCalls = parsed;
        // Strip the raw tool_code blocks from the content so they're not shown to user
        assistantMessage.content = assistantMessage.content
          .replace(/<tool_code>[\s\S]*?<\/tool_code>/gi, '')
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
          .trim();
      }
    }

    if (!toolCalls.length) {
      // If this is step 0 and the user message looks action-oriented, force a retry
      const ACTION_RE = /\b(create|write|make|build|generate|open|browse|visit|run|execute|save|edit|show|launch|start|list|read|delete|move|copy|rename|search|find|fetch|download|summarize|install)\b/i;
      if (step === 0 && ACTION_RE.test(lastUserMsg)) {
        addLog('warn', '[agent] No tool calls on step 0 for action message — forcing tool use');
        conversation.push({
          role: 'assistant',
          content: assistantMessage.content || '',
        });
        conversation.push({
          role: 'user',
          content: `You did not call any tool. You MUST call the appropriate tool now to complete this request. Do not describe what you would do — call the tool directly.`,
        });
        continue;
      }

      addLog('info', '[agent] No tool calls — returning final response');
      return {
        content: assistantMessage.content || 'Done.',
        actions,
      };
    }

    conversation.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch {
        args = {};
      }

      addLog('info', `[agent] calling tool: ${toolCall.function.name}`, JSON.stringify(args).slice(0, 200));
      onEvent?.({ toolCall: { name: toolCall.function.name, args } });

      let result;
      try {
        result = await runTool(toolCall.function.name, args);
        addLog('info', `[agent] tool ${toolCall.function.name} ✓`);
      } catch (err) {
        addLog('error', `[agent] tool ${toolCall.function.name} failed:`, err.message);
        result = { error: err.message };
      }

      if (result?.action) {
        actions.push(result.action);
        onEvent?.({ action: result.action });
      }
      if (result?.ok && result?.id && result?.action) {
        onEvent?.({ action: result.action });
      }

      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // If ALL tool results for this step have skipFinalLlm, return immediately
    // without an extra LLM call — avoids 5-30s delay for simple file operations
    const allResults = toolCalls.map((tc) => {
      try { return JSON.parse(conversation[conversation.length - toolCalls.length + toolCalls.indexOf(tc)]?.content || '{}'); } catch { return {}; }
    });
    // Re-extract from conversation tail (simpler)
    const lastToolMessages = conversation.slice(-toolCalls.length);
    let allSkip = toolCalls.length > 0;
    let combinedFinal = [];
    for (const msg of lastToolMessages) {
      if (msg.role !== 'tool') { allSkip = false; break; }
      try {
        const r = JSON.parse(msg.content);
        if (!r.skipFinalLlm) { allSkip = false; break; }
        combinedFinal.push(r.finalMessage || '');
      } catch { allSkip = false; break; }
    }
    if (allSkip && combinedFinal.length) {
      addLog('info', '[agent] All tools returned skipFinalLlm — short-circuiting without extra LLM call');
      return { content: combinedFinal.join('\n'), actions };
    }
  }

  return {
    content: 'I completed the steps I could. Let me know if you need anything else.',
    actions,
  };
}

// GET /api/ai/models
router.get('/models', async (_req, res) => {
  try {
    const models = await listModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/transcribe  — audio blob → text via Whisper sidecar or Web Speech fallback
router.post('/transcribe', async (req, res) => {
  const voiceUrl = process.env.VOICE_SERVICE_URL;
  if (!voiceUrl) {
    return res.status(503).json({ error: 'Voice service not configured. Set VOICE_SERVICE_URL env var.' });
  }
  // Forward raw audio to voice sidecar
  try {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const audioBuffer = Buffer.concat(chunks);
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: req.headers['content-type'] || 'audio/webm' });
      formData.append('audio', blob, 'audio.webm');
      const r = await fetch(`${voiceUrl}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`Voice sidecar error: ${r.status}`);
      const data = await r.json();
      res.json({ text: data.text || '' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/history
router.get('/history', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM messages ORDER BY created_at ASC LIMIT 200')
    .all();
  res.json({ messages: rows });
});

// DELETE /api/ai/history
router.delete('/history', (_req, res) => {
  db.prepare('DELETE FROM messages').run();
  res.json({ ok: true });
});

// POST /api/ai/tts  — text-to-speech via voice sidecar
router.post('/tts', async (req, res) => {
  const { text, voice } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text required' });
  }
  const voiceUrl = process.env.VOICE_SERVICE_URL;
  if (!voiceUrl) {
    return res.status(503).json({ error: 'Voice service not configured' });
  }
  try {
    const r = await fetch(`${voiceUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 1000), voice: voice || 'bf_emma' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`TTS sidecar error: ${r.status}`);
    const audio = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.send(Buffer.from(audio));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/chat  — streaming SSE
router.post('/chat', async (req, res) => {
  const { message, model } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message required' });
  }

  // Persist user message
  const userMsgId = uuidv4();
  db.prepare('INSERT INTO messages (id, role, content) VALUES (?, ?, ?)').run(
    userMsgId,
    'user',
    message
  );
  // Store in vector memory (non-blocking)
  memoryStore(userMsgId, 'user', message);

  // Fetch last 10 rows (5 turns) for context
  const history = db
    .prepare("SELECT role, content FROM messages ORDER BY created_at ASC")
    .all()
    .slice(-10);

  // Retrieve semantically relevant past messages for additional context
  const relevant = await memorySearch(message, 3);
  const relevantBlock = relevant.length
    ? relevant
        .filter((r) => r.distance == null || r.distance < 0.8)
        .map((r) => `[Past context — ${r.role}]: ${r.content}`)
        .join('\n')
    : '';

  const systemContent = relevantBlock
    ? `${SYSTEM_PROMPT}\n\n--- Relevant memory ---\n${relevantBlock}\n--- End memory ---`
    : SYSTEM_PROMPT;

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
  ];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let full = '';
  try {
    const directAction = await tryHandleDirectAction(message, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    if (directAction) {
      full = directAction.content || 'Done.';
      for (const char of full) {
        res.write(`data: ${JSON.stringify({ token: char })}\n\n`);
      }
    } else {
      // Always run agentic loop — it handles pure chat too (returns text when no tools triggered)
      const agentResult = await runAgent(messages, {
        model,
        onEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });
      full = agentResult.content || '';

      for (const char of full) {
        res.write(`data: ${JSON.stringify({ token: char })}\n\n`);
      }
    }

    if (!full) {
      full = 'Done.';
      res.write(`data: ${JSON.stringify({ token: full })}\n\n`);
    }

    // Persist assistant response
    const assistantMsgId = uuidv4();
    db.prepare('INSERT INTO messages (id, role, content) VALUES (?, ?, ?)').run(
      assistantMsgId,
      'assistant',
      full
    );
    // Store in vector memory (non-blocking)
    memoryStore(assistantMsgId, 'assistant', full);

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = router;
