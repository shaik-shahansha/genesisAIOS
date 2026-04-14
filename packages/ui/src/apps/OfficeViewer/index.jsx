import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import Editor from '@monaco-editor/react';
import FilePicker from '../../components/FilePicker';

const OFFICE_EXTS = new Set(['docx', 'pptx', 'xlsx', 'pdf']);
const TEXT_EXTS   = new Set(['txt', 'md', 'markdown', 'html', 'htm']);
const IMAGE_EXTS  = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);
const EDITABLE_EXTS = new Set([...OFFICE_EXTS, ...TEXT_EXTS]);

export default function OfficeViewer({ filePath: initialPath }) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [sourceText, setSourceText] = useState('');
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  const openFile = async (p) => {
    if (!p) return;
    const ext = p.split('.').pop().toLowerCase();
    setError(null);
    setLoading(true);
    setCurrentPath(p);
    setEditMode(false);
    setSourceText('');

    try {
      const res = await fetch(`/api/fs/raw?path=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      if (ext === 'md' || ext === 'markdown') {
        const text = await blob.text();
        const html = text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/^- (.+)$/gm, '<li>$1</li>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br/>');
        containerRef.current.innerHTML = `<div class="md-body"><p>${html}</p></div>`;

      } else if (ext === 'html' || ext === 'htm') {
        const text = await blob.text();
        containerRef.current.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%;height:100%;border:none;';
        iframe.sandbox = 'allow-scripts allow-same-origin';
        containerRef.current.appendChild(iframe);
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open(); doc.write(text); doc.close();

      } else if (ext === 'txt') {
        const text = await blob.text();
        containerRef.current.innerHTML = `<pre class="plaintext">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

      } else if (ext === 'docx') {
        let rendered = false;
        try {
          const { renderAsync } = await import('docx-preview');
          containerRef.current.innerHTML = '';
          await renderAsync(blob, containerRef.current, null, {
            className: 'genesis-docx', inWrapper: true,
            ignoreWidth: false, ignoreHeight: false,
            renderHeaders: true, renderFooters: true,
          });
          rendered = true;
        } catch (docxErr) {
          try {
            const text = await blob.text();
            if (text.trim().length > 0) {
              const isMarkdown = /^#{1,3} |^\*\*|^- /m.test(text);
              if (isMarkdown) {
                const html = text
                  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/^# (.+)$/gm, '<h1>$1</h1>')
                  .replace(/^## (.+)$/gm, '<h2>$1</h2>')
                  .replace(/^### (.+)$/gm, '<h3>$1</h3>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/^- (.+)$/gm, '<li>$1</li>')
                  .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');
                containerRef.current.innerHTML = `<div class="md-body"><p>${html}</p></div>`;
              } else {
                containerRef.current.innerHTML = `<div class="p-4"><div class="mb-2 text-xs text-orange-400">Warning: Not a valid DOCX binary - showing as plain text</div><pre class="plaintext">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`;
              }
              rendered = true;
            }
          } catch {}
          if (!rendered) throw new Error(`Not a valid DOCX file: ${docxErr.message}`);
        }

      } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
        const XLSX = await import('xlsx');
        const workbook = ext === 'csv'
          ? XLSX.read(await blob.text(), { type: 'string' })
          : XLSX.read(await blob.arrayBuffer(), { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const html = XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]);
        containerRef.current.innerHTML = `<div class="p-4 overflow-auto">${html}</div>`;

      } else if (ext === 'pptx' || ext === 'ppt') {
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const slideFiles = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

        const slides = [];
        for (let idx = 0; idx < slideFiles.length; idx++) {
          const xml = await zip.file(slideFiles[idx])?.async('string');
          if (!xml) continue;

          const shapes = [];
          const spRegex = /<p:sp[\s\S]*?<\/p:sp>/g;
          let spMatch;
          while ((spMatch = spRegex.exec(xml)) !== null) {
            const texts = [...spMatch[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
              m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            ).join('');
            if (texts.trim()) shapes.push(texts.trim());
          }

          if (!shapes.length) {
            const flat = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
              .map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
              .join('\n').trim();
            if (flat) shapes.push(flat);
          }

          const [titleText, ...bodyShapes] = shapes;
          const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const titleHtml = `<div class="slide-title">${e(titleText || `Slide ${idx + 1}`)}</div>`;
          const bodyHtml = bodyShapes.map((s) => {
            const lines = s.split('\n').filter(Boolean);
            return lines.length ? `<ul class="slide-bullets">${lines.map((l) => `<li>${e(l)}</li>`).join('')}</ul>` : '';
          }).join('');

          slides.push(`<section class="slide-card"><div class="slide-num">Slide ${idx + 1}</div>${titleHtml}${bodyHtml}</section>`);
        }

        if (!slides.length) throw new Error('No readable slide content found in PPTX file');
        containerRef.current.innerHTML = `<div class="pptx-view">${slides.join('')}</div>`;

      } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'].includes(ext)) {
        const url = `/api/fs/raw?path=${encodeURIComponent(p)}`;
        containerRef.current.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);padding:12px;box-sizing:border-box;';
        const img = document.createElement('img');
        img.src = url;
        img.alt = p.split('/').pop();
        img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;box-shadow:0 4px 32px rgba(0,0,0,0.5);';
        img.onerror = () => { wrapper.innerHTML = `<p style="color:rgba(255,255,255,0.4);font-size:13px;">Failed to load image</p>`; };
        wrapper.appendChild(img);
        containerRef.current.appendChild(wrapper);

      } else {
        try {
          const text = await blob.text();
          containerRef.current.innerHTML = `<pre class="plaintext">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
        } catch {
          throw new Error(`Unsupported format: .${ext}`);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const enterEditMode = async () => {
    if (!currentPath) return;
    setError(null);
    setLoading(true);
    try {
      const fileExt = currentPath.split('.').pop().toLowerCase();
      if (TEXT_EXTS.has(fileExt)) {
        // Plain text — read raw bytes directly
        const res = await fetch(`/api/fs/raw?path=${encodeURIComponent(currentPath)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        setSourceText(text);
      } else {
        // Office/PDF — extract editable source text via office extractor
        const res = await fetch(`/api/fs/source?path=${encodeURIComponent(currentPath)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { content } = await res.json();
        setSourceText(content || '');
      }
      setEditMode(true);
    } catch (e) {
      setError(`Could not get source: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!currentPath || saving) return;
    setSaving(true);
    setError(null);
    try {
      const fileExt = currentPath.split('.').pop().toLowerCase();
      const isTextFile = TEXT_EXTS.has(fileExt);

      if (isTextFile) {
        // Plain-text save — write directly without regeneration
        const res = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentPath, content: sourceText }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({}));
          throw new Error(msg || `HTTP ${res.status}`);
        }
      } else {
        // Office / PDF — regenerate binary via office endpoint
        const res = await fetch('/api/fs/office', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentPath, content: sourceText }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({}));
          throw new Error(msg || `HTTP ${res.status}`);
        }
      }
      setEditMode(false);
      await openFile(currentPath);
    } catch (e) {
      setError(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (initialPath) openFile(initialPath);
  }, [initialPath]);

  const fileName = currentPath ? currentPath.split('/').pop() : null;
  const ext = currentPath ? currentPath.split('.').pop().toLowerCase() : '';
  const isEditable = EDITABLE_EXTS.has(ext);
  const isTextFile = TEXT_EXTS.has(ext);
  const isImage = IMAGE_EXTS.has(ext);
  const monacoLang = ext === 'md' || ext === 'markdown' ? 'markdown'
    : ext === 'html' || ext === 'htm' ? 'html'
    : ext === 'txt' ? 'plaintext'
    : 'markdown'; // default for office source editing

  return (
    <div className="flex flex-col h-full text-white">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 flex-shrink-0 bg-white/2">
        {!editMode ? (
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-white/12 rounded-lg text-white/80 text-xs font-medium transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="rgba(234,179,8,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6.5A1.5 1.5 0 013.5 5H7.8a1.5 1.5 0 011.1.48L10.1 6.5H16.5A1.5 1.5 0 0118 8v6.5A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5V6.5z" />
              <path d="M2 8.5h16" />
            </svg>
            Browse
          </button>
        ) : (
          <>
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-lg text-white text-xs font-medium transition-colors"
            >
              {saving ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5a2 2 0 012-2h8.586a2 2 0 011.414.586l2.414 2.414A2 2 0 0118 7.414V15a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"/><path d="M7 3v4h6V3M7 13h6"/></svg>
              )}
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditMode(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-white/12 rounded-lg text-white/70 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </>
        )}

        {fileName ? (
          <span className="text-white/60 text-xs truncate flex-1" title={currentPath}>{fileName}</span>
        ) : (
          <span className="text-white/30 text-xs flex-1">No file open - click Browse to open a document</span>
        )}

        {isEditable && !editMode && currentPath && (
          <button
            onClick={enterEditMode}
            title="Edit source and regenerate"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-white/12 rounded-lg text-white/70 text-xs font-medium transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 3l4 4-9 9H4v-4l9-9z"/>
            </svg>
            Edit
          </button>
        )}

        {isImage && !editMode && currentPath && (
          <a
            href={`/api/fs/raw?path=${encodeURIComponent(currentPath)}`}
            download={fileName}
            title="Download image"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/8 hover:bg-white/12 rounded-lg text-white/70 text-xs font-medium transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="rgba(14,165,233,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4v10M6 10l4 4 4-4"/><path d="M3 16h14"/>
            </svg>
            Download
          </a>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
          <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
          Loading document...
        </div>
      )}

      {error && <div className="p-4 text-red-400 text-sm">{error}</div>}

      {!loading && !error && !currentPath && (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm flex-col gap-3">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="none" stroke="rgba(59,130,246,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
            <path d="M2.5 7.5h15M2.5 12.5h15M8 2.5v15" />
          </svg>
          <p>Click <strong className="text-white/50">Browse</strong> to open a .docx, .xlsx, .pptx, .pdf, .md, .html, .txt or image file</p>
        </div>
      )}

      {editMode && !loading && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-3 py-1.5 bg-violet-900/30 border-b border-violet-500/20 text-violet-300 text-xs">
            {isTextFile
            ? `Editing ${ext.toUpperCase()} — Save to write changes to disk`
            : `Editing source — Save to regenerate the ${ext.toUpperCase()} file`}
          </div>
          <div className="flex-1 min-h-0">
            <Editor
              height="100%"
              defaultLanguage={monacoLang}
              language={monacoLang}
              value={sourceText}
              onChange={(v) => setSourceText(v ?? '')}
              theme="vs-dark"
              options={{
                fontSize: 13,
                wordWrap: 'on',
                minimap: { enabled: false },
                lineNumbers: 'on',
                padding: { top: 12 },
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{
          background: 'rgba(255,255,255,0.97)',
          color: '#1a1a1a',
          display: loading || editMode ? 'none' : 'block',
        }}
      />

      <style>{`
        .genesis-docx { padding: 24px; }
        table { border-collapse: collapse; width: 100%; }
        td, th { border: 1px solid #ddd; padding: 6px 12px; }
        th { background: #f0f0f0; font-weight: 600; }
        .md-body { padding: 24px; font-family: Georgia, serif; font-size: 15px; line-height: 1.7; color: #1a1a1a; }
        .md-body h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.3em; border-bottom: 2px solid #eee; }
        .md-body h2 { font-size: 1.5em; font-weight: 600; margin: 1em 0 0.3em; }
        .md-body h3 { font-size: 1.2em; font-weight: 600; margin: 0.8em 0 0.2em; }
        .md-body code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
        .md-body li { margin: 4px 0 4px 20px; list-style: disc; }
        .plaintext { padding: 24px; font-family: monospace; font-size: 13px; white-space: pre-wrap; word-break: break-word; color: #1a1a1a; }
        .pptx-view { padding: 24px; display: grid; gap: 18px; background: #f3f4f6; }
        .slide-card { background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 22px 24px; box-shadow: 0 8px 24px rgba(15,23,42,0.08); }
        .slide-num { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #6366f1; margin-bottom: 10px; }
        .slide-title { font-size: 22px; font-weight: 700; color: #1e293b; line-height: 1.3; margin-bottom: 14px; }
        .slide-bullets { margin: 0; padding: 0 0 0 4px; list-style: none; }
        .slide-bullets li { font-size: 14px; line-height: 1.6; color: #374151; padding: 3px 0 3px 18px; position: relative; }
        .slide-bullets li::before { content: '\u2022'; position: absolute; left: 0; color: #6366f1; font-weight: 700; }
      `}</style>

      <AnimatePresence>
        {showPicker && (
          <FilePicker
            accept={['docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'md', 'markdown', 'html', 'htm', 'txt', 'rtf', 'pdf']}
            onSelect={(p) => { openFile(p); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
