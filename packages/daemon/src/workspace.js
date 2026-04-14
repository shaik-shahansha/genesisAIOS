'use strict';

const fs = require('fs').promises;
const path = require('path');

const ROOT = path.resolve(process.env.GENESIS_PROJECT_ROOT || path.join(__dirname, '../../../workspace'));
const DEFAULT_WORKSPACE_FOLDERS = ['Documents', 'Downloads', 'Pictures', 'Generated'];

const DOCUMENT_EXTENSIONS = new Set([
  'doc',
  'docx',
  'html',
  'htm',
  'md',
  'markdown',
  'pdf',
  'ppt',
  'pptx',
  'rtf',
  'txt',
  'xls',
  'xlsx',
  'csv',
]);

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
]);

function normalizeRelativePath(rel = '') {
  return String(rel || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
}

function safeWorkspacePath(rel = '') {
  const normalized = normalizeRelativePath(rel);
  const resolved = path.resolve(ROOT, normalized);
  if (!resolved.startsWith(ROOT)) throw new Error('Path traversal denied');
  return resolved;
}

async function ensureWorkspaceStructure() {
  await fs.mkdir(ROOT, { recursive: true });
  await Promise.all(
    DEFAULT_WORKSPACE_FOLDERS.map((folder) => fs.mkdir(path.join(ROOT, folder), { recursive: true }))
  );
}

function extensionOf(rel = '') {
  return path.extname(normalizeRelativePath(rel)).toLowerCase().slice(1);
}

function inferOutputKind(rel = '') {
  const ext = extensionOf(rel);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  return 'other';
}

function routeGeneratedPath(rel = '', explicitKind) {
  const normalized = normalizeRelativePath(rel);
  const kind = explicitKind || inferOutputKind(normalized);
  const dir = path.posix.dirname(normalized);
  const base = path.posix.basename(normalized);
  const isRootLevel = !normalized || dir === '.';
  const isGeneratedLevel = dir.toLowerCase() === 'generated';

  if (!base) {
    if (kind === 'document') return 'Documents';
    if (kind === 'image') return 'Pictures';
    return 'Generated';
  }

  if (kind === 'document' && (isRootLevel || isGeneratedLevel)) {
    return `Documents/${base}`;
  }
  if (kind === 'image' && (isRootLevel || isGeneratedLevel)) {
    return `Pictures/${base}`;
  }
  if (kind === 'other' && isRootLevel) {
    return `Generated/${base}`;
  }
  return normalized;
}

function pickAppForFile(rel = '') {
  const ext = extensionOf(rel);
  if (ext === 'pdf') return 'pdf';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'office';
  return 'editor';
}

module.exports = {
  ROOT,
  DEFAULT_WORKSPACE_FOLDERS,
  DOCUMENT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  ensureWorkspaceStructure,
  extensionOf,
  inferOutputKind,
  normalizeRelativePath,
  pickAppForFile,
  routeGeneratedPath,
  safeWorkspacePath,
};