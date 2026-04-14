'use strict';

/**
 * packages/tools/registry.js
 *
 * Loads SKILL.md descriptor files from packages/tools/builtin/<toolName>/SKILL.md
 * Parses YAML frontmatter and markdown body into a structured tool registry.
 *
 * Usage:
 *   const registry = require('./registry');
 *   const skills = registry.getAll();          // all tool descriptors
 *   const skill  = registry.get('bash');       // single tool by name
 *   const table  = registry.summary();         // markdown table for prompts
 */

const fs = require('fs');
const path = require('path');

const BUILTIN_DIR = path.join(__dirname, 'builtin');

/** Parse YAML-like frontmatter from a SKILL.md string.
 *  Supports simple key: value pairs only (no nested objects). */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta = {};
  for (const line of match[1].split('\n')) {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) {
      const val = rest.join(':').trim();
      // Coerce simple booleans
      meta[key.trim()] = val === 'true' ? true : val === 'false' ? false : val;
    }
  }
  return { meta, body: match[2].trim() };
}

/** Load all SKILL.md files from the builtin directory. */
function loadBuiltins() {
  const skills = {};

  if (!fs.existsSync(BUILTIN_DIR)) return skills;

  const entries = fs.readdirSync(BUILTIN_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(BUILTIN_DIR, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const raw = fs.readFileSync(skillPath, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const name = meta.name || entry.name;
      skills[name] = {
        name,
        displayName: meta.displayName || name,
        category: meta.category || 'general',
        requiresApproval: meta.requiresApproval === true,
        destructive: meta.destructive,
        description: body,
        sourceFile: skillPath,
      };
    } catch (err) {
      // Non-fatal — log and skip
      console.warn(`[tools/registry] Failed to load ${skillPath}: ${err.message}`);
    }
  }

  return skills;
}

// Load once at require time (synchronous — these are small local files)
let _cache = null;

function _getCache() {
  if (!_cache) {
    _cache = loadBuiltins();
  }
  return _cache;
}

/** Reload all SKILL.md files from disk. Use after hot-adding a new tool. */
function reload() {
  _cache = loadBuiltins();
  return _cache;
}

/** Get all tool descriptors as a plain object keyed by tool name. */
function getAll() {
  return _getCache();
}

/** Get a single tool descriptor by name. Returns null if not found. */
function get(name) {
  return _getCache()[name] || null;
}

/** List of all registered tool names. */
function names() {
  return Object.keys(_getCache());
}

/** Compact markdown summary table for injection into LLM prompts. */
function summary() {
  const skills = _getCache();
  const rows = Object.values(skills).map(
    (s) => `| \`${s.name}\` | ${s.category} | ${s.requiresApproval ? '⚠️ approval' : '✓ free'} |`
  );
  if (!rows.length) return '';
  return [
    '| Tool | Category | Approval |',
    '|------|----------|----------|',
    ...rows,
  ].join('\n');
}

module.exports = { getAll, get, names, reload, summary };
