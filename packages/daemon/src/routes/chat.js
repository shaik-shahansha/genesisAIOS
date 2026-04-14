'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const db = require('../db');
const { streamChat, listModels, chat, complete, getLastUsedModel } = require('../llm/client');
const { createOfficeDocumentBuffer, extractOfficeDocumentText, isOfficeDocumentPath } = require('../office');
const {
  ensureWorkspaceStructure,
  pickAppForFile,
  routeGeneratedPath,
  safeWorkspacePath,
} = require('../workspace');

const router = express.Router();
const execAsync = promisify(exec);
const ROOT = safeWorkspacePath('');
const MAX_FILE_BYTES = 256 * 1024;
const APPROVALS = new Map();

// ─── Persistent shell state ────────────────────────────────────────────────
// Agent bash runs with a persistent working directory. Each toolBash call
// wraps the command to capture the cwd afterward, so `cd` is sticky.
let _shellCwd = process.env.GENESIS_PROJECT_ROOT || '/workspace';

function approvalEnabled() {
  return String(process.env.GENESIS_APPROVAL_MODE || 'true').toLowerCase() !== 'false';
}

// ─── SOUL.md + AGENTS.md loader ──────────────────────────────────────────────
// Loaded once at startup; injected into every system prompt.
// Falls back gracefully if files don't exist.
let _soulContent = '';
let _agentsContent = '';

async function loadIdentityFiles() {
  const workspaceRoot = process.env.GENESIS_PROJECT_ROOT || '/workspace';
  try {
    _soulContent = await fs.readFile(path.join(workspaceRoot, 'SOUL.md'), 'utf8');
  } catch { /* not required */ }
  try {
    _agentsContent = await fs.readFile(path.join(workspaceRoot, 'AGENTS.md'), 'utf8');
  } catch { /* not required */ }
}
// Fire and forget — non-blocking at require time
loadIdentityFiles().catch(() => {});


const BASE_SYSTEM_PROMPT = `You are Genesis — a powerful agentic AI operating system running inside a Linux container. You are the brain of this OS and you have full control of the machine.

You think like a brilliant senior engineer. You are confident, direct, and you get things done immediately.

## Your capabilities via bash

You have a \`bash\` tool that gives you the full power of the Linux container:
- **Find anything**: \`find /workspace -iname '*keyword*'\`, \`grep -r 'text' /workspace\`
- **Read/process files**: \`cat\`, \`head\`, \`tail\`, \`awk\`, \`sed\`, \`jq\`, \`wc\`
- **Internet access**: \`curl -s URL\`, \`wget\`
- **Run code**: \`python3 -c 'code'\`, \`node -e 'code'\`, \`python3 script.py\`
- **Install anything**: \`pip install pkg\`, \`npm install pkg\`, \`apt-get install -y pkg\`
- **System info**: \`ls\`, \`df\`, \`ps\`, \`env\`, \`which\`, \`uname\`
- **Process data**: sort, uniq, awk pipelines, jq for JSON, python3 for anything complex
- **Create content**: write Python/JS/bash scripts and run them immediately

## When to use which tool

| Request | Use |
|---------|-----|
| List files in a folder | \`list_files\` (instant, formatted UI) |
| Find files by name/content | \`bash\` with find/grep (more powerful than search_files) |
| Read a file | \`read_file\` for simple reads; \`bash\` for processing/parsing |
| Create/write a file | \`write_file\` with full content |
| Create .docx/.xlsx/.pptx/.pdf | \`create_document\` |
| Run a command or script | \`bash\` |
| Browse a URL | \`browse_page\` OR \`bash("curl -s URL")\` |
| Open an app in the UI | \`open_app\` |
| Generate an image | \`generate_image\` |
| Build a mini app | \`create_app\` |
| Anything complex, multi-step | \`bash\` — chain commands with && or write a script |

## How you respond

1. **Think first** (1 sentence internally) — what is the simplest way to accomplish this?
2. **Act** — call the appropriate tool. Don't narrate what you're about to do, just do it.
3. **Chain tools** when needed — search → read → write → open, all in one agent loop.
4. **For bash output** — interpret the results and give the user a clear, formatted answer.
5. **Never say "Done."** alone — always say what actually happened or show the result.
6. **For knowledge/conversation** — answer directly without tools. You know a lot.

## Key paths
- User workspace: /workspace (all user files)
- Working directory persists between bash calls (cd is sticky)
- Write new documents to /workspace/Documents/ by default
- Write new images to /workspace/Pictures/ by default

User name: ${process.env.GENESIS_USER_NAME || 'User'}`;

function buildSystemPrompt() {
  let prompt = BASE_SYSTEM_PROMPT;
  if (_soulContent) {
    prompt += `\n\n--- Identity & Personality ---\n${_soulContent}\n--- End Identity ---`;
  }
  if (_agentsContent) {
    prompt += `\n\n--- Agent Rules ---\n${_agentsContent}\n--- End Agent Rules ---`;
  }
  return prompt;
}

// Legacy alias used in the chat route
const SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

const TOOL_DEFS = [
  // ─── PRIMARY AGENTIC TOOL ──────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run any bash command in the Linux container. This is the most powerful tool — use it for finding files, processing data, running scripts, installing packages, making HTTP requests, and anything else. Working directory persists between calls. Available: bash, python3, node, curl, wget, find, grep, awk, sed, jq, git, zip, tar, wc, sort, uniq, and apt-get for installing more.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The bash command to run. Chain with && or ; for multiple steps. Use absolute paths or relative from /workspace.' },
          timeout: { type: 'number', description: 'Timeout in seconds (default: 30, max: 120). Use higher values for installs or long-running scripts.' },
        },
        required: ['command'],
      },
    },
  },
  // ─── CONVENIENCE / UI TOOLS ───────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files or folders inside the workspace with a nicely formatted UI response. Use this for simple directory listings. Use bash for more complex file operations.',
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
      description: 'Create or overwrite a text-based file in the workspace with provided content. Use this for .md, .html, .txt, .csv, code, and other plain text files.',
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
      name: 'replace_file',
      description: 'Replace an existing text file with new content. Use this when updating or rewriting a file the user asked to change.',
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
      name: 'create_document',
      description: 'Create a document file in .docx, .xlsx, .pptx, or .pdf format. ALWAYS include a path with the correct extension, e.g. "Documents/report.pdf". Default to .pdf when the user does not specify a format.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Output path including file extension, e.g. Documents/report.pdf or Documents/budget.xlsx. REQUIRED — always provide this.' },
          content: { type: 'string', description: 'Full document content (markdown text for docx/pdf, CSV rows for xlsx).' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'copy_path',
      description: 'Copy a file or folder to a new location in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          destination: { type: 'string' },
        },
        required: ['source', 'destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'move_path',
      description: 'Move or rename a file or folder in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          destination: { type: 'string' },
        },
        required: ['source', 'destination'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_path',
      description: 'Delete a file or folder from the workspace. This is destructive and requires approval.',
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
      name: 'search_files',
      description: 'Search for files by name pattern inside the workspace.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Case-insensitive substring or extension to search for.' },
        },
        required: ['query'],
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

async function memorySearch(query, n = 8) {
  if (!MEMORY_URL || !query?.trim()) return [];
  try {
    const r = await fetch(`${MEMORY_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, n_results: n }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

/**
 * Fetch the persistent user identity profile from the memory service.
 * Returns an empty object if unavailable.
 */
async function memoryGetProfile() {
  if (!MEMORY_URL) return {};
  try {
    const r = await fetch(`${MEMORY_URL}/profile`, { signal: AbortSignal.timeout(3_000) });
    if (!r.ok) return {};
    const d = await r.json();
    return d.profile || {};
  } catch { return {}; }
}

/**
 * Merge new facts into the persistent user profile.
 * Silently ignores failure (non-critical path).
 */
async function memoryUpdateProfile(facts) {
  if (!MEMORY_URL || !facts || !Object.keys(facts).length) return;
  try {
    await fetch(`${MEMORY_URL}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* non-critical */ }
}

// Simple regex-based personal fact extractor.
// Detects things like "my name is X", "I am a X", "I work at X", "I live in X".
// Returns a key→value object of extracted facts (may be empty).
function extractPersonalFacts(message) {
  const facts = {};
  const m = message;
  const patterns = [
    [/my name is ([A-Z][^\s,\.]+(?:\s+[A-Z][^\s,\.]+)*)/i, 'name'],
    [/(?:call me|i(?:'m| am)) ([A-Z][^\s,\.]+)/i, 'name'],
    [/i(?:'m| am) a[n]? ([^,.!?]+)/i, 'occupation'],
    [/i work (?:at|for|as) ([^,.!?]+)/i, 'occupation'],
    [/i(?:'m| am) from ([^,.!?]+)/i, 'location'],
    [/i live in ([^,.!?]+)/i, 'location'],
    [/my (?:email|address) is ([^\s,]+)/i, 'email'],
    [/i (?:prefer|like|love) ([^,.!?]+)/i, 'preferences'],
    [/my (?:age|birthday) is ([^,.!?]+)/i, 'age'],
  ];
  for (const [re, key] of patterns) {
    const match = m.match(re);
    if (match) {
      const val = match[1].trim();
      if (val.length > 1 && val.length < 80) facts[key] = val;
    }
  }
  return facts;
}

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('Request aborted')));
  });
}

async function fetchVoiceHealth(voiceUrl) {
  if (!voiceUrl) {
    return { ok: false, whisper: false, tts: false, error: 'Voice service not configured' };
  }

  try {
    const response = await fetch(`${voiceUrl}/health`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) {
      return { ok: false, whisper: false, tts: false, error: `Voice sidecar error: ${response.status}` };
    }
    const data = await response.json();
    return {
      ok: Boolean(data.ok),
      whisper: Boolean(data.whisper),
      tts: Boolean(data.tts),
      error: null,
    };
  } catch (err) {
    return { ok: false, whisper: false, tts: false, error: err.message };
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildApprovalResult(toolName, args, message, metadata = {}) {
  const id = uuidv4();
  APPROVALS.set(id, { toolName, args, message, metadata, createdAt: Date.now() });
  return {
    requiresApproval: true,
    approval: {
      id,
      toolName,
      message,
      metadata,
    },
    action: {
      type: 'approval_required',
      approvalId: id,
      toolName,
      message,
      metadata,
    },
    skipFinalLlm: true,
    finalMessage: message,
  };
}

async function copyRecursive(sourcePath, destinationPath) {
  const sourceStat = await fs.stat(sourcePath);
  if (sourceStat.isDirectory()) {
    await fs.mkdir(destinationPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name));
    }
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
}

function isDestructiveCommand(command = '') {
  return /(\brm\b|\bdel\b|\berase\b|\bremove-item\b|\brmdir\b|\bmv\b|\bmove-item\b|\brename-item\b|\bcopy-item\b.*-force|\bcp\b.*\s-f\b|>\s*[^\n]+|\bset-content\b|\bout-file\b)/i.test(command);
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

function inferRequestedBinaryDocumentFormat(text = '') {
  const lower = String(text || '').toLowerCase();
  if (/(\.docx\b|\bdocx\b|\bword document\b)/.test(lower)) return 'docx';
  if (/(\.xlsx\b|\bxlsx\b|\bexcel\b|\bspreadsheet\b)/.test(lower)) return 'xlsx';
  if (/(\.pptx\b|\bpptx\b|\bpowerpoint\b|\bslide deck\b|\bpresentation\b)/.test(lower)) return 'pptx';
  if (/(\.pdf\b|\bpdf\b)/.test(lower)) return 'pdf';
  // Generic "create (a) document/report/file" with no explicit format → default to pdf
  if (/\b(create|make|generate|write|build)\b.{0,40}\b(document|report|file|guide|plan|brief|proposal|summary|analysis)\b/.test(lower)) return 'pdf';
  return null;
}

function safePath(rel) {
  return safeWorkspacePath(rel);
}

async function toolListFiles({ path: rel = '' }) {
  await ensureWorkspaceStructure();
  const dir = safePath(rel);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`Cannot read directory '${rel || '.'}': ${err.message}`);
  }
  const items = entries.slice(0, 200).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' : 'file',
    path: path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/'),
  }));
  const cwd = path.relative(ROOT, dir).replace(/\\/g, '/') || '.';
  const dirs = items.filter((i) => i.type === 'dir');
  const files = items.filter((i) => i.type === 'file');
  const lines = [
    ...dirs.map((i) => `📁 **${i.name}/**`),
    ...files.map((i) => `📄 ${i.name}`),
  ];
  const header = `**${cwd}** — ${dirs.length} folder(s), ${files.length} file(s)`;
  const finalMessage = items.length ? `${header}\n${lines.join('\n')}` : `**${cwd}** is empty.`;
  return { cwd, items, skipFinalLlm: true, finalMessage };
}

async function toolReadFile({ path: rel }) {
  await ensureWorkspaceStructure();
  const file = safePath(rel);
  const stat = await fs.stat(file);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File too large to read safely (${stat.size} bytes)`);
  }

  const ext = path.extname(file).toLowerCase().slice(1);
  if (['docx', 'xlsx', 'pptx'].includes(ext)) {
    const buffer = await fs.readFile(file);
    const content = await extractOfficeDocumentText(ext, buffer);
    const preview = content.length > 4000 ? content.slice(0, 4000) + '\n…(truncated)' : content;
    return { path: rel, content, skipFinalLlm: true, finalMessage: `**${rel}**\n\`\`\`\n${preview}\n\`\`\`` };
  }

  const content = await fs.readFile(file, 'utf8');
  const preview = content.length > 4000 ? content.slice(0, 4000) + '\n…(truncated)' : content;
  return { path: rel, content, skipFinalLlm: true, finalMessage: `**${rel}**\n\`\`\`\n${preview}\n\`\`\`` };
}

async function toolWriteFile({ path: rel, content }, options = {}) {
  await ensureWorkspaceStructure();
  const outputPath = routeGeneratedPath(rel, undefined);
  const file = safePath(outputPath);
  const exists = await pathExists(file);

  if (exists && approvalEnabled() && !options.bypassApproval) {
    return buildApprovalResult('replace_file', { path: outputPath, content }, `Approval required to replace \`${outputPath}\`.`, {
      destructive: true,
      type: 'replace',
      path: outputPath,
    });
  }

  await fs.mkdir(path.dirname(file), { recursive: true });

  if (isOfficeDocumentPath(outputPath)) {
    const buffer = await createOfficeDocumentBuffer(path.extname(outputPath).toLowerCase().slice(1), content || '');
    await fs.writeFile(file, buffer);
    return {
      ok: true,
      path: outputPath,
      bytes: buffer.length,
      action: { type: 'open_app', appId: pickAppForFile(outputPath), props: { filePath: outputPath } },
      skipFinalLlm: true,
      finalMessage: `Created \`${outputPath}\` (${buffer.length} bytes).`,
    };
  }

  await fs.writeFile(file, content, 'utf8');
  return {
    ok: true,
    path: outputPath,
    bytes: Buffer.byteLength(content || '', 'utf8'),
    action: { type: 'open_app', appId: pickAppForFile(outputPath), props: { filePath: outputPath } },
    skipFinalLlm: true,
    finalMessage: `Created \`${outputPath}\` (${Buffer.byteLength(content || '', 'utf8')} bytes).`,
  };
}

async function toolReplaceFile({ path: rel, content }, options = {}) {
  return toolWriteFile({ path: rel, content }, options);
}

async function toolCreateDocument({ path: rel, content, filename, format }, options = {}) {
  await ensureWorkspaceStructure();

  // ── Auto-generate a path when the LLM omits it ──────────────────────────
  // The LLM (especially Gemma 4) often omits the path even though it's marked
  // required in the schema. Derive a sensible filename from content or args.
  let resolvedRel = rel || filename || '';
  if (!resolvedRel || !path.extname(resolvedRel)) {
    // Try to extract a title from the first markdown heading in content
    const headingMatch = (content || '').match(/^#+\s+(.+)/m);
    const titleSlug = headingMatch
      ? headingMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
      : 'document';
    const ext = format || (resolvedRel && path.extname(resolvedRel).slice(1)) || 'pdf';
    resolvedRel = `Documents/${titleSlug}.${ext}`;
  }

  const outputPath = routeGeneratedPath(resolvedRel, 'document');
  const ext = path.extname(outputPath).toLowerCase().slice(1);

  if (!['docx', 'xlsx', 'pptx', 'pdf'].includes(ext)) {
    throw new Error('create_document only supports .docx, .xlsx, .pptx, and .pdf');
  }

  const file = safePath(outputPath);
  const exists = await pathExists(file);
  if (exists && approvalEnabled() && !options.bypassApproval) {
    return buildApprovalResult('create_document', { path: outputPath, content }, `Approval required to replace \`${outputPath}\`.`, {
      destructive: true,
      type: 'replace',
      path: outputPath,
    });
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  const buffer = await createOfficeDocumentBuffer(ext, content || '');
  await fs.writeFile(file, buffer);

  return {
    ok: true,
    path: outputPath,
    bytes: buffer.length,
    action: { type: 'open_app', appId: pickAppForFile(outputPath), props: { filePath: outputPath } },
    skipFinalLlm: true,
    finalMessage: `Created \`${outputPath}\` (${buffer.length} bytes).`,
  };
}

async function toolCreateFolder({ path: rel }) {
  await ensureWorkspaceStructure();
  await fs.mkdir(safePath(rel), { recursive: true });
  return { ok: true, path: rel, skipFinalLlm: true, finalMessage: `Created folder \`${rel}\`.` };
}

async function toolCopyPath({ source, destination }, options = {}) {
  await ensureWorkspaceStructure();
  const sourcePath = safePath(source);
  const destinationPath = safePath(destination);
  const outputPath = routeGeneratedPath(destination, undefined);
  const normalizedDestination = safePath(outputPath);
  const exists = await pathExists(normalizedDestination);

  if (exists && approvalEnabled() && !options.bypassApproval) {
    return buildApprovalResult('copy_path', { source, destination: outputPath }, `Approval required to replace \`${outputPath}\` while copying.`, {
      destructive: true,
      type: 'replace',
      source,
      destination: outputPath,
    });
  }

  await copyRecursive(sourcePath, normalizedDestination);
  return { ok: true, path: outputPath, skipFinalLlm: true, finalMessage: `Copied \`${source}\` to \`${outputPath}\`.` };
}

async function toolMovePath({ source, destination }, options = {}) {
  await ensureWorkspaceStructure();
  const sourcePath = safePath(source);
  const outputPath = routeGeneratedPath(destination, undefined);
  const destinationPath = safePath(outputPath);
  const exists = await pathExists(destinationPath);

  if (exists && approvalEnabled() && !options.bypassApproval) {
    return buildApprovalResult('move_path', { source, destination: outputPath }, `Approval required to replace \`${outputPath}\` while moving \`${source}\`.`, {
      destructive: true,
      type: 'replace',
      source,
      destination: outputPath,
    });
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.rename(sourcePath, destinationPath);
  return { ok: true, path: outputPath, skipFinalLlm: true, finalMessage: `Moved \`${source}\` to \`${outputPath}\`.` };
}

async function toolDeletePath({ path: rel }, options = {}) {
  await ensureWorkspaceStructure();
  const targetPath = safePath(rel);

  if (approvalEnabled() && !options.bypassApproval) {
    return buildApprovalResult('delete_path', { path: rel }, `Approval required to delete \`${rel}\`.`, {
      destructive: true,
      type: 'delete',
      path: rel,
    });
  }

  await fs.rm(targetPath, { recursive: true, force: true });
  return { ok: true, path: rel, skipFinalLlm: true, finalMessage: `Deleted \`${rel}\`.` };
}

async function toolSearchFiles({ query }) {
  await ensureWorkspaceStructure();
  const matches = [];
  const stack = [''];
  const lowered = String(query || '').toLowerCase();

  while (stack.length && matches.length < 100) {
    const current = stack.pop();
    const dir = safePath(current);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = path.posix.join(current.replace(/\\/g, '/'), entry.name).replace(/^\/+/, '');
      if (entry.name.toLowerCase().includes(lowered) || relPath.toLowerCase().includes(lowered)) {
        matches.push({
          name: entry.name,
          path: relPath,
          type: entry.isDirectory() ? 'dir' : 'file',
        });
      }
      if (entry.isDirectory()) stack.push(relPath);
      if (matches.length >= 100) break;
    }
  }

  const lines = matches.map((m) => `${m.type === 'dir' ? '📁' : '📄'} ${m.path}`);
  const finalMessage = matches.length
    ? `Found **${matches.length}** result(s) for \`${query}\`:\n${lines.join('\n')}`
    : `No files found matching \`${query}\`. Try a different search term or check with list_files.`;
  return { query, matches, skipFinalLlm: true, finalMessage };
}

async function toolBash({ command, timeout = 30 }, options = {}) {
  const { addLog } = require('../logger');
  if (!command || typeof command !== 'string') throw new Error('command is required');

  // Strip accidental "bash:" or "bash: " prefix the model sometimes includes
  const cleanCommand = command.replace(/^bash:\s*/i, '').trim();
  const timeoutMs = Math.min((Number(timeout) || 30), 120) * 1000;
  const cwd = _shellCwd;

  // Wrap command to capture the resulting cwd so `cd` is persistent
  const wrapped = `cd ${JSON.stringify(cwd)} 2>/dev/null; ( ${cleanCommand} ); echo "__GENESIS_EXIT__:$?"; echo "__GENESIS_CWD__:$(pwd)"`;

  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  try {
    const result = await execAsync(wrapped, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      shell: '/bin/bash',
      env: {
        ...process.env,
        HOME: '/root',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/bin',
        TERM: 'xterm-256color',
        PYTHONUNBUFFERED: '1',
      },
    });
    stdout = result.stdout || '';
    stderr = result.stderr || '';
  } catch (err) {
    if (err.killed || String(err.code) === 'SIGTERM' || err.message?.includes('timed out')) {
      return {
        output: `[Command timed out after ${timeout}s]`,
        exit_code: 124,
        cwd: _shellCwd,
      };
    }
    stdout = err.stdout || '';
    stderr = err.stderr || '';
    exitCode = err.code || 1;
  }

  // Extract the new cwd from our sentinel
  const cwdMatch = stdout.match(/__GENESIS_CWD__:(.+)/);
  if (cwdMatch) _shellCwd = cwdMatch[1].trim();
  const exitMatch = stdout.match(/__GENESIS_EXIT__:(\d+)/);
  if (exitMatch) exitCode = parseInt(exitMatch[1], 10);

  // Strip sentinels from output shown to LLM
  const clean = stdout
    .replace(/__GENESIS_EXIT__:\d+\n?/g, '')
    .replace(/__GENESIS_CWD__:.+\n?/g, '')
    .trim();

  const errClean = stderr.trim();
  const combined = [clean, errClean ? `[stderr]: ${errClean}` : ''].filter(Boolean).join('\n').trim();
  const output = combined.slice(0, 8000) || '(no output)';

  addLog('info', `[bash] exit=${exitCode} cwd=${_shellCwd} cmd=${command.slice(0, 80)}`);

  // Return output to LLM for reasoning — bash results are not skipFinalLlm
  // because the model needs to interpret/summarize the output for the user
  return {
    output,
    exit_code: exitCode,
    cwd: _shellCwd,
  };
}

async function toolRunCommand({ command }, options = {}) {
  await ensureWorkspaceStructure();

  if (approvalEnabled() && isDestructiveCommand(command) && !options.bypassApproval) {
    return buildApprovalResult('run_command', { command }, `Approval required to run a destructive command:\n\`${command}\``, {
      destructive: true,
      type: 'command',
      command,
    });
  }

  const { stdout, stderr } = await execAsync(command, {
    cwd: ROOT,
    timeout: 30_000,
    maxBuffer: 512 * 1024,
    shell: true,
    env: process.env,
  });
  const out = (stdout || '').slice(0, 20_000);
  const err = (stderr || '').slice(0, 20_000);
  const output = [out, err].filter(Boolean).join('\n').trim() || '(no output)';
  return {
    stdout: out,
    stderr: err,
    skipFinalLlm: true,
    finalMessage: `\`\`\`\n${output.slice(0, 3000)}\n\`\`\``,
  };
}

async function toolGenerateImage({ prompt }) {
  const { v4: genUuid } = require('uuid');
  const provider = (process.env.GENESIS_IMAGE_PROVIDER || 'pollinations').toLowerCase();
  await ensureWorkspaceStructure();

  const relPath = routeGeneratedPath(`generated/img_${genUuid().slice(0, 8)}.png`, 'image');
  const outDir = path.dirname(safePath(relPath));
  await fs.mkdir(outDir, { recursive: true });

  const filePath = safePath(relPath);

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
    return {
      ok: true,
      path: relPath,
      url: `/api/fs/raw?path=${encodeURIComponent(relPath)}`,
      skipFinalLlm: true,
      finalMessage: `![${prompt}](/api/fs/raw?path=${encodeURIComponent(relPath)})\nSaved to \`${relPath}\`.`,
    };
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
  return {
    ok: true,
    path: relPath,
    url: directUrl,
    skipFinalLlm: true,
    finalMessage: `![${prompt}](${directUrl})\nSaved to \`${relPath}\`.`,
  };
}

async function toolCreateApp({ name, description, icon, html_content }) {
  const { v4: appUuid } = require('uuid');
  const db2 = require('../db');
  const id = appUuid();

  await ensureWorkspaceStructure();
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  const appDir = path.join(ROOT, 'apps', safeName);
  await fs.mkdir(appDir, { recursive: true });
  await fs.writeFile(path.join(appDir, 'index.html'), html_content, 'utf8');

  db2.prepare(
    'INSERT INTO created_apps (id, name, description, icon, html_content) VALUES (?, ?, ?, ?, ?)'
  ).run(id, name, description || '', icon || '🧩', html_content);

  return {
    ok: true,
    id,
    name,
    icon: icon || '🧩',
    action: { type: 'open_app', appId: `userapp_${id}`, props: { appId: id } },
    skipFinalLlm: true,
    finalMessage: `Created app **${name}** ${icon || '🧩'}. Opening now.`,
  };
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

  return { url: parsed.href, summary, skipFinalLlm: true, finalMessage: summary };
}

async function runTool(name, args, options = {}) {
  switch (name) {
    case 'bash': return toolBash(args || {}, options);
    case 'list_files': return toolListFiles(args || {}, options);
    case 'read_file': return toolReadFile(args || {}, options);
    case 'write_file': return toolWriteFile(args || {}, options);
    case 'replace_file': return toolReplaceFile(args || {}, options);
    case 'create_document': return toolCreateDocument(args || {}, options);
    case 'copy_path': return toolCopyPath(args || {}, options);
    case 'move_path': return toolMovePath(args || {}, options);
    case 'delete_path': return toolDeletePath(args || {}, options);
    case 'search_files': return toolSearchFiles(args || {}, options);
    case 'create_folder': return toolCreateFolder(args || {}, options);
    case 'run_command': return toolRunCommand(args || {}, options);
    case 'browse_page': return toolBrowsePage(args || {}, options);
    case 'open_app': {
      const appLabel = args?.appId || 'app';
      return {
        action: { type: 'open_app', appId: args?.appId, props: args?.props || {} },
        skipFinalLlm: true,
        finalMessage: `Opened ${appLabel}.`,
      };
    }
    case 'generate_image': return toolGenerateImage(args || {}, options);
    case 'create_app': return toolCreateApp(args || {}, options);
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
    const result = /\.(docx|xlsx|pptx|pdf)$/i.test(filePath)
      ? await toolCreateDocument({ path: filePath, content })
      : await toolWriteFile({ path: filePath, content });

    if (result?.action) emit(result.action);
    if (/\.(docx|xlsx|pptx|pdf)$/i.test(filePath)) {
      return {
        content: result?.finalMessage || `Created file ${filePath}.`,
        actions: result?.action ? [result.action] : [],
      };
    }
    return {
      content: result?.finalMessage || `Created file ${filePath}.`,
      actions: result?.action ? [result.action] : [],
    };
  }

  const deleteMatch = text.match(/\bdelete\s+(?:the\s+)?(?:file|folder|path)?\s*([A-Za-z0-9._\-/ ]+)$/i);
  if (deleteMatch) {
    const target = deleteMatch[1].trim().replace(/^['"]|['"]$/g, '');
    const result = await toolDeletePath({ path: target });
    if (result?.action) emit(result.action);
    return { content: result.finalMessage || `Delete requested for ${target}.`, actions: result?.action ? [result.action] : [] };
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

  // ── create_app: handle "create/build/make a <name> app" directly ───────────
  // Instead of letting the agent loop try to coerce the LLM into passing a full
  // HTML string as a tool argument (which often fails or asks clarifying questions),
  // we intercept here, call the LLM with a focused HTML-generation prompt, then
  // call toolCreateApp directly with the output.
  const createAppMatch = text.match(
    /\b(?:create|build|make|generate)\s+(?:(?:a|an|me|the)\s+)?(.+?)\s+app\b/i
  );
  if (createAppMatch) {
    const { addLog } = require('../logger');
    const appDescription = createAppMatch[1].trim();

    // Pick a sensible display name and emoji icon from the description
    const appName = appDescription
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const iconMap = [
      [/todo|task|checklist/i, '✅'],
      [/note|journal|diary/i, '📝'],
      [/timer|stopwatch|clock|countdown/i, '⏱️'],
      [/calculator|calc|math/i, '🧮'],
      [/weather/i, '🌤️'],
      [/music|audio|player/i, '🎵'],
      [/expense|budget|finance/i, '💰'],
      [/habit/i, '🔥'],
      [/password|vault/i, '🔐'],
      [/calendar|schedule/i, '📅'],
      [/photo|gallery|image/i, '🖼️'],
      [/chat|messaging/i, '💬'],
      [/game|quiz/i, '🎮'],
      [/kpi|dashboard|analytics/i, '📊'],
    ];
    const icon = iconMap.find(([re]) => re.test(appDescription))?.[1] || '🧩';

    addLog('info', `[agent] create_app direct action — generating HTML for "${appName}"`);

    // Focused LLM call: generate only HTML, no tool calls needed
    const htmlPrompt = [
      {
        role: 'system',
        content:
          'You are an expert front-end developer. When asked to build an app, you output ONLY the complete raw HTML file — no explanations, no markdown fences, no commentary. Just the HTML. The HTML must be self-contained (inline all CSS and JS) and use IndexedDB for any persistent storage. Apply a dark glassmorphism theme with accent colour #7C3AED.',
      },
      {
        role: 'user',
        content: `Build a complete, fully functional single-page "${appName}" app. Output ONLY the raw HTML — starting with <!DOCTYPE html> and ending with </html>. No markdown code fences.`,
      },
    ];

    let htmlContent = '';
    try {
      const htmlMsg = await chat(htmlPrompt, { model: undefined });
      htmlContent = (htmlMsg.content || '').trim();
      // Strip any accidental markdown code fences the model may add
      htmlContent = htmlContent
        .replace(/^```html\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
    } catch (err) {
      addLog('warn', `[agent] create_app HTML generation failed: ${err.message}`);
      return null; // fall through to normal agent loop
    }

    if (!htmlContent.toLowerCase().includes('<html')) {
      addLog('warn', '[agent] create_app: LLM did not return valid HTML, falling back to agent loop');
      return null; // fall through to normal agent loop
    }

    const result = await toolCreateApp({
      name: appName,
      description: `A ${appDescription} app`,
      icon,
      html_content: htmlContent,
    });

    if (result?.action) emit(result.action);
    return {
      content: result?.finalMessage || `Created app **${appName}** ${icon}.`,
      actions: result?.action ? [result.action] : [],
    };
  }

  return null;
}

// Trim a conversation to keep it within a manageable size for the LLM.
// Always preserves the system message and the most recent N messages.
function trimConversation(conv, maxNonSystem = 18) {
  const system = conv.find((m) => m.role === 'system');
  const rest = conv.filter((m) => m.role !== 'system');
  if (rest.length <= maxNonSystem) return conv;
  const trimmed = rest.slice(-maxNonSystem);
  // Ensure first non-system message is from user (not orphaned tool/assistant)
  const firstUserIdx = trimmed.findIndex((m) => m.role === 'user');
  const safeRest = firstUserIdx > 0 ? trimmed.slice(firstUserIdx) : trimmed;
  return system ? [system, ...safeRest] : safeRest;
}

async function runAgent(messages, { model, onEvent, signal }) {
  const { addLog } = require('../logger');
  const conversation = trimConversation([...messages]);
  const actions = [];
  // Extract the last user message for re-prompt fallback
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const requestedBinaryFormat = inferRequestedBinaryDocumentFormat(lastUserMsg);
  // Loop detection: track last tool call to prevent infinite same-tool loops
  let lastToolSignature = null;
  let sameToolCount = 0;

  for (let step = 0; step < 8; step += 1) {
    // Check if request was aborted (client disconnected or stop clicked)
    if (signal?.aborted) {
      addLog('info', '[agent] aborted — stopping agent loop');
      return { content: '', actions };
    }

    addLog('info', `[agent] step ${step} — calling LLM with ${conversation.length} messages`);
    const stepT0 = Date.now();

    // Compose with the parent abort signal only (no per-step timeout — the
    // LLM client already enforces a ~180s hard limit via AbortSignal.timeout).
    // A 60s cap was previously set here but killed app/document generation
    // before the model could finish writing large HTML/content outputs.
    let callSignal = signal || undefined;
    if (signal) {
      const ac = new AbortController();
      signal.addEventListener('abort', () => ac.abort(), { once: true });
      callSignal = ac.signal;
    }

    let assistantMessage;
    try {
      assistantMessage = await chat(conversation, { model, tools: TOOL_DEFS, signal: callSignal });
    } catch (err) {
      const msg = err?.name === 'AbortError' || err?.message?.includes('timeout')
        ? 'Request timed out. The model took too long. Please try again or rephrase your request.'
        : `Model error: ${err.message}`;
      addLog('warn', `[agent] step ${step} aborted/timed out: ${err.message}`);
      return { content: msg, actions };
    }
    addLog('info', `[agent] step ${step} LLM returned in ${Date.now() - stepT0}ms`);

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
      // No tools called — return the model's response directly (single LLM call, no re-prompt)
      addLog('info', '[agent] No tool calls — returning final response');
      return {
        content: assistantMessage.content || 'Done.',
        actions,
      };
    }

    // Loop detection: if the same single tool+args is called twice in a row, bail out
    if (toolCalls.length === 1) {
      const sig = `${toolCalls[0].function.name}:${toolCalls[0].function.arguments}`;
      if (sig === lastToolSignature) {
        sameToolCount += 1;
        if (sameToolCount >= 2) {
          addLog('warn', `[agent] loop detected — same tool called ${sameToolCount} times in a row: ${toolCalls[0].function.name}`);
          return { content: assistantMessage.content || 'Done.', actions };
        }
      } else {
        lastToolSignature = sig;
        sameToolCount = 1;
      }
    } else {
      lastToolSignature = null;
      sameToolCount = 0;
    }

    // Ollama native /api/chat expects tool_calls[i].function.arguments as an
    // object (not a JSON string). client.js normalises it to a string for
    // uniform JSON.parse() use in this file, so we convert it back here
    // before pushing into the conversation that will be sent back to Ollama.
    conversation.push({
      role: 'assistant',
      content: assistantMessage.content || '',
      tool_calls: toolCalls.map((tc) => ({
        ...tc,
        function: {
          ...tc.function,
          arguments:
            typeof tc.function.arguments === 'string'
              ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })()
              : (tc.function.arguments ?? {}),
        },
      })),
    });

    for (const toolCall of toolCalls) {
      let args = {};
      try {
        args = typeof toolCall.function.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments || '{}')
          : (toolCall.function.arguments ?? {});
      } catch {
        args = {};
      }

      if (requestedBinaryFormat && ['write_file', 'create_document'].includes(toolCall.function.name)) {
        const requestedPath = String(args.path || '').trim();
        const hasRequestedExt = requestedPath.toLowerCase().endsWith(`.${requestedBinaryFormat}`);
        const hasTextExt = /\.(html?|md|markdown|txt)$/i.test(requestedPath);

        if (toolCall.function.name === 'write_file' || !hasRequestedExt) {
          const normalizedPath = requestedPath
            ? requestedPath.replace(/\.[^.\/]+$/, `.${requestedBinaryFormat}`)
            : `Documents/generated-document.${requestedBinaryFormat}`;
          toolCall.function.name = 'create_document';
          args = { ...args, path: normalizedPath || `Documents/generated-document.${requestedBinaryFormat}` };
        }

        if (hasTextExt) {
          args = { ...args, path: requestedPath.replace(/\.[^.\/]+$/, `.${requestedBinaryFormat}`) };
        }
      }

      // Stop processing tools if request was aborted mid-step
      if (signal?.aborted) {
        addLog('info', '[agent] aborted during tool dispatch');
        return { content: '', actions };
      }

      addLog('info', `[agent] calling tool: ${toolCall.function.name}`, JSON.stringify(args).slice(0, 200));
      onEvent?.({ toolCall: { name: toolCall.function.name, args } });

      let result;
      try {
        result = await runTool(toolCall.function.name, args);
        addLog('info', `[agent] tool ${toolCall.function.name} ✓`);
      } catch (err) {
        addLog('error', `[agent] tool ${toolCall.function.name} failed:`, err.message);
        result = { error: err.message, skipFinalLlm: true, finalMessage: `Error: ${err.message}` };
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

    // Trim conversation after each step to prevent unbounded growth
    const sysMsg = conversation.find((m) => m.role === 'system');
    const nonSys = conversation.filter((m) => m.role !== 'system');
    if (nonSys.length > 20) {
      const trimmed = nonSys.slice(-18);
      const firstUser = trimmed.findIndex((m) => m.role === 'user');
      conversation.splice(0, conversation.length, ...(sysMsg ? [sysMsg] : []), ...(firstUser > 0 ? trimmed.slice(firstUser) : trimmed));
      addLog('info', `[agent] trimmed conversation to ${conversation.length} messages`);
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

// POST /api/ai/models/pull  — stream Ollama pull progress as SSE
router.post('/models/pull', async (req, res) => {
  const { model } = req.body;
  if (!model || typeof model !== 'string') {
    return res.status(400).json({ error: 'model required' });
  }
  // Sanitise: only allow valid Ollama model tag characters
  const safeModel = model.trim().replace(/[^a-zA-Z0-9:._/-]/g, '');
  if (!safeModel) return res.status(400).json({ error: 'invalid model name' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
  try {
    const ollamaRes = await fetch(`${ollamaBase}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: safeModel, stream: true }),
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });

    if (!ollamaRes.ok) {
      res.write(`data: ${JSON.stringify({ error: `Ollama error ${ollamaRes.status}` })}\n\n`);
      return res.end();
    }

    const reader = ollamaRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.trim()) res.write(`data: ${line}\n\n`);
      }
    }
    if (buf.trim()) res.write(`data: ${buf}\n\n`);
    res.write(`data: ${JSON.stringify({ status: 'success' })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// DELETE /api/ai/models/:name  — remove a locally pulled model
router.delete('/models/:name(*)', async (req, res) => {
  const model = req.params.name;
  if (!model) return res.status(400).json({ error: 'model name required' });
  const safeModel = model.trim().replace(/[^a-zA-Z0-9:._/-]/g, '');
  const ollamaBase = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
  try {
    const r = await fetch(`${ollamaBase}/api/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: safeModel }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return res.status(r.status).json({ error: `Ollama error ${r.status}` });
    res.json({ ok: true });
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

  try {
    const audioBuffer = await readRequestBody(req);
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: req.headers['content-type'] || 'audio/webm' });
    formData.append('audio', blob, 'audio.webm');

    const response = await fetch(`${voiceUrl}/transcribe`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(45_000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status === 503 ? 503 : 502).json({
        error: data.detail || data.error || `Voice sidecar error: ${response.status}`,
      });
    }

    res.json({ text: data.text || '', language: data.language || 'en' });
  } catch (err) {
    res.status(502).json({ error: `Voice transcription unavailable: ${err.message}` });
  }
});

// GET /api/ai/voice-status
router.get('/voice-status', async (_req, res) => {
  const status = await fetchVoiceHealth(process.env.VOICE_SERVICE_URL);
  res.status(status.ok ? 200 : 503).json(status);
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
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      throw new Error(data.detail || data.error || `TTS sidecar error: ${r.status}`);
    }
    const audio = await r.arrayBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.send(Buffer.from(audio));
  } catch (err) {
    res.status(502).json({ error: `Voice synthesis unavailable: ${err.message}` });
  }
});

// GET /api/ai/pending-approvals — returns all approvals waiting for user action
router.get('/pending-approvals', (req, res) => {
  const approvals = [];
  for (const [id, data] of APPROVALS.entries()) {
    approvals.push({
      type: 'approval_required',
      approvalId: id,
      toolName: data.toolName,
      message: data.message || `Approve ${data.toolName}?`,
      metadata: data.metadata || {},
    });
  }
  res.json({ approvals });
});

// POST /api/ai/approve
router.post('/approve', async (req, res) => {
  const { approvalId } = req.body || {};
  const approval = APPROVALS.get(approvalId);
  if (!approval) return res.status(404).json({ error: 'Approval request not found' });

  APPROVALS.delete(approvalId);
  try {
    const result = await runTool(approval.toolName, approval.args, { bypassApproval: true });
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/reject
router.post('/reject', (req, res) => {
  const { approvalId } = req.body || {};
  if (approvalId) APPROVALS.delete(approvalId);
  res.json({ ok: true });
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

  // Auto-extract and persist any personal facts the user shared (non-blocking)
  const personalFacts = extractPersonalFacts(message);
  if (Object.keys(personalFacts).length > 0) {
    memoryUpdateProfile(personalFacts);
  }

  const { addLog } = require('../logger');

  // Fetch last 6 DB rows (3 turns) for context — keep prompt tokens low.
  // Use a subquery to get the most recent rows, then re-order ASC.
  // Exclude the message we just inserted to avoid duplication in messages array.
  const history = db
    .prepare(`SELECT role, content FROM (
        SELECT role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 7
      ) ORDER BY created_at ASC`)
    .all()
    .filter((r) => !(r.role === 'user' && r.content === message))
    .slice(-6);

  // Retrieve semantically relevant past messages for additional context.
  // Run two searches in parallel:
  //   1. Semantic search on the current message (catches topic-relevant history)
  //   2. Identity search (always pulls in the user profile even if query is unrelated)
  const isIdentityQuery = /\b(who am i|my name|about me|i told you|remember me|do you know me|what do you know)\b/i.test(message);
  const identityQuery = 'user name profile preferences who is the user personal information';

  const memT0 = Date.now();
  const [topicResults, identityResults, userProfile] = await Promise.all([
    memorySearch(message, 8),
    isIdentityQuery ? memorySearch(identityQuery, 5) : Promise.resolve([]),
    memoryGetProfile(),
  ]);
  addLog('info', `[chat] memory search took ${Date.now() - memT0}ms, found ${topicResults.length} topic + ${identityResults.length} identity results`);

  // Merge and deduplicate results.
  // Remove the distance threshold that was previously cutting out most real memories —
  // MiniLM cosine distances for semantically related text sit at 0.4–0.8, so
  // a 0.5 cutoff was silently discarding almost everything.
  const seenContent = new Set();
  const relevantItems = [];
  for (const r of [...topicResults, ...identityResults]) {
    const key = r.content.trim();
    if (!seenContent.has(key) && r.distance < 0.95) {  // only reject near-random noise (distance ≥ 0.95)
      seenContent.add(key);
      relevantItems.push(r);
    }
  }
  // Keep top 6 by distance (closest first), but always keep pinned profile entry
  const pinnedItems = relevantItems.filter((r) => r.pinned);
  const unpinnedItems = relevantItems.filter((r) => !r.pinned).sort((a, b) => a.distance - b.distance).slice(0, 6);
  const finalMemories = [...pinnedItems, ...unpinnedItems];

  // Build the memory block injected into the system prompt
  let memoryBlock = '';
  if (Object.keys(userProfile).length > 0) {
    const profileLines = Object.entries(userProfile).map(([k, v]) => `  ${k}: ${v}`).join('\n');
    memoryBlock += `## User Profile (always accurate)\n${profileLines}\n\n`;
  }
  if (finalMemories.length > 0) {
    const contextLines = finalMemories
      .map((r) => `[${r.role}]: ${r.content}`)
      .join('\n');
    memoryBlock += `## Relevant Past Context\n${contextLines}`;
  }

  const systemContent = memoryBlock
    ? `${buildSystemPrompt()}\n\n--- Memory ---\n${memoryBlock}\n--- End Memory ---`
    : buildSystemPrompt();

  const messages = [
    { role: 'system', content: systemContent },
    ...history,
  ];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Create an AbortController tied to this request — aborts if client disconnects
  // or if the stop endpoint is hit. This propagates into the agent loop + LLM calls.
  const requestAC = new AbortController();
  req.on('close', () => requestAC.abort());

  let full = '';
  try {
    const directAction = await tryHandleDirectAction(message, (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    if (directAction) {
      full = directAction.content || '';
      for (const char of full) {
        res.write(`data: ${JSON.stringify({ token: char })}\n\n`);
      }
    } else {
      // Always run through the agent loop — Gemma 4 decides itself whether to call tools
      // or just reply conversationally. With skipFinalLlm on all tools, this is exactly
      // 1 LLM call for both pure conversation AND tool execution.
      const agentT0 = Date.now();
      const agentMessages = [...messages, { role: 'user', content: message }];
      const agentResult = await runAgent(agentMessages, {
        model,
        signal: requestAC.signal,
        onEvent: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
      });
      addLog('info', `[chat] agent completed in ${Date.now() - agentT0}ms, length: ${agentResult.content?.length || 0}`);

      // If the agent produced an approval_required action, skip streaming the text content —
      // the ApprovalCard in the UI already shows the message from the action SSE event.
      const hasApproval = agentResult.actions?.some((a) => a?.type === 'approval_required');

      if (requestAC.signal.aborted) {
        // Client disconnected — don't stream or save
        return;
      }

      full = hasApproval ? '' : (agentResult.content || '');

      for (const char of full) {
        res.write(`data: ${JSON.stringify({ token: char })}\n\n`);
      }
    }

    if (!full && !requestAC.signal.aborted) {
      // Model returned truly empty content — this should not happen with a good prompt
      // but if it does, ask the model once more for a plain reply
      addLog('warn', '[chat] empty response — re-prompting for plain reply');
      try {
        const fallback = await streamChat(
          [...messages, { role: 'user', content: message }, { role: 'assistant', content: '' }, { role: 'user', content: 'Please respond.' }],
          { model, onChunk: (token) => { res.write(`data: ${JSON.stringify({ token })}\n\n`); } }
        );
        full = fallback || 'I processed your request.';
      } catch {
        full = 'I processed your request.';
        res.write(`data: ${JSON.stringify({ token: full })}\n\n`);
      }
    }

    // Persist assistant response (skip for aborted requests and pure approval responses)
    if (full && !requestAC.signal.aborted) {
      const assistantMsgId = uuidv4();
      db.prepare('INSERT INTO messages (id, role, content) VALUES (?, ?, ?)').run(
        assistantMsgId,
        'assistant',
        full
      );
      // Store in vector memory (non-blocking)
      memoryStore(assistantMsgId, 'assistant', full);
    }

    if (!requestAC.signal.aborted) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
  } catch (err) {
    if (!requestAC.signal.aborted) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    res.end();
  }
});

module.exports = router;

// ─── GET /status ─────────────────────────────────────────────────────────────
// Returns current model, message count, fallback chain, and identity file status.
router.get('/status', (req, res) => {
  const modelRes = getLastUsedModel();
  const primaryModel = process.env.GENESIS_MODEL || 'gemma4:e4b';
  const fallbackRaw = process.env.GENESIS_MODEL_FALLBACK || '';
  const fallbackChain = fallbackRaw ? fallbackRaw.split(',').map(m => m.trim()).filter(Boolean) : [];
  const msgCount = db.prepare('SELECT COUNT(*) as count FROM messages').get().count;
  const soulLoaded = !!_soulContent;
  const agentsLoaded = !!_agentsContent;
  res.json({
    model: modelRes || primaryModel,
    primaryModel,
    fallbackChain,
    messageCount: msgCount,
    soulLoaded,
    agentsLoaded,
  });
});

// ─── POST /compact ────────────────────────────────────────────────────────────
// Summarises the conversation history with the LLM, wipes messages, and stores
// the summary as a single [system] message. Keeps the session context without
// filling the context window.
router.post('/compact', async (req, res) => {
  const log = getLogger();
  try {
    const rows = db.prepare('SELECT role, content FROM messages ORDER BY rowid ASC').all();
    if (rows.length === 0) {
      return res.json({ ok: true, summary: null, messageCount: 0 });
    }

    const transcript = rows.map(r => `[${r.role}]: ${r.content}`).join('\n');
    const summaryPrompt = [
      { role: 'system', content: 'You are a precise conversation summariser. Produce a dense, bulleted summary of the following conversation that preserves all important facts, decisions, code, and context. This summary will be used as the sole context for the continuation of this conversation.' },
      { role: 'user', content: transcript },
    ];

    log('info', `[compact] Summarising ${rows.length} messages…`);
    const summary = await complete(summaryPrompt);

    // Atomically replace messages with the summary
    db.prepare('DELETE FROM messages').run();
    const summaryId = uuidv4();
    db.prepare('INSERT INTO messages (id, role, content) VALUES (?, ?, ?)').run(
      summaryId,
      'system',
      `[Conversation Summary — compacted]\n\n${summary}`
    );

    log('info', '[compact] History compacted successfully.');
    res.json({ ok: true, summary, messageCount: rows.length });
  } catch (err) {
    log('error', `[compact] Failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
