import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import FilePicker from '../../components/FilePicker';

export default function OfficeViewer({ filePath: initialPath }) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const containerRef = useRef(null);

  const openFile = async (p) => {
    if (!p) return;
    const ext = p.split('.').pop().toLowerCase();
    setError(null);
    setLoading(true);
    setCurrentPath(p);

    try {
      const res = await fetch(`/api/fs/raw?path=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();

      if (ext === 'md' || ext === 'markdown') {
        // Render Markdown as styled HTML
        const text = await blob.text();
        const html = text
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/^# (.+)$/gm, '<h1>$1</h1>')
          .replace(/^## (.+)$/gm, '<h2>$1</h2>')
          .replace(/^### (.+)$/gm, '<h3>$1</h3>')
          .replace(/^\*\*(.+)\*\*$/gm, '<strong>$1</strong>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/^- (.+)$/gm, '<li>$1</li>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br/>');
        containerRef.current.innerHTML = `<div class="md-body"><p>${html}</p></div>`;

      } else if (ext === 'html' || ext === 'htm') {
        // Render HTML in a sandboxed iframe-like div
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
            className: 'genesis-docx',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            renderHeaders: true,
            renderFooters: true,
          });
          rendered = true;
        } catch (docxErr) {
          // Not a real DOCX zip — try rendering as plain text
          try {
            const text = await blob.text();
            if (text.trim().length > 0) {
              const isMarkdown = /^#{1,3} |^\*\*|^\- /m.test(text);
              if (isMarkdown) {
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
              } else {
                containerRef.current.innerHTML = `<div class="p-4"><div class="mb-2 text-xs text-orange-400">⚠ Not a valid DOCX binary — showing as plain text</div><pre class="plaintext">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre></div>`;
              }
              rendered = true;
            }
          } catch {}
          if (!rendered) throw new Error(`Not a valid DOCX file: ${docxErr.message}`);
        }

      } else if (ext === 'xlsx' || ext === 'xls') {
        const XLSX = await import('xlsx');
        const arrayBuffer = await blob.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const html = XLSX.utils.sheet_to_html(workbook.Sheets[sheetName]);
        containerRef.current.innerHTML = `<div class="p-4 overflow-auto">${html}</div>`;

      } else {
        // Unknown format: try plain text
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

  useEffect(() => {
    if (initialPath) openFile(initialPath);
  }, [initialPath]);

  const fileName = currentPath ? currentPath.split('/').pop() : null;
  const hasContent = containerRef.current?.innerHTML?.length > 0;

  return (
    <div className="flex flex-col h-full text-white">
      {/* Persistent toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8 flex-shrink-0 bg-white/2">
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
        {fileName ? (
          <span className="text-white/60 text-xs truncate flex-1" title={currentPath}>{fileName}</span>
        ) : (
          <span className="text-white/30 text-xs flex-1">No file open — click Browse to open a document</span>
        )}
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
          <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
          </svg>
          Loading document…
        </div>
      )}

      {error && <div className="p-4 text-red-400 text-sm">{error}</div>}

      {!loading && !error && !currentPath && (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm flex-col gap-3">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="none" stroke="rgba(59,130,246,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2.5" y="2.5" width="15" height="15" rx="1.5" />
            <path d="M2.5 7.5h15M2.5 12.5h15M8 2.5v15" />
          </svg>
          <p>Click <strong className="text-white/50">Browse</strong> to open a .docx, .xlsx, .md or .txt file</p>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{
          background: 'rgba(255,255,255,0.97)',
          color: '#1a1a1a',
          display: loading ? 'none' : 'block',
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
      `}</style>

      <AnimatePresence>
        {showPicker && (
          <FilePicker
            accept={['docx', 'doc', 'xlsx', 'xls', 'pptx']}
            onSelect={(p) => { openFile(p); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
