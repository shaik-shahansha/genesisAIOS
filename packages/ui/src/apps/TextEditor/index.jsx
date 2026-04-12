import React, { useState, useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';

export default function TextEditor({ filePath }) {
  const [path, setPath] = useState(filePath || '');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const getLanguage = (p) => {
    const ext = (p || '').split('.').pop().toLowerCase();
    const map = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      py: 'python', json: 'json', md: 'markdown', html: 'html', css: 'css',
      txt: 'plaintext', sh: 'shell', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    };
    return map[ext] || 'plaintext';
  };

  const openFile = async (p) => {
    if (!p) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setContent(data.content);
      setOriginalContent(data.content);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!path) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOriginalContent(content);
      setMessage('Saved ✓');
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (filePath) openFile(filePath);
  }, [filePath]);

  const isDirty = content !== originalContent;

  return (
    <div className="flex flex-col h-full text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
        {!filePath && (
          <>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="File path…"
              className="flex-1 bg-white/5 rounded-lg px-3 py-1 text-sm text-white outline-none placeholder:text-white/30 border border-white/10 focus:border-accent"
            />
            <button onClick={() => openFile(path)} className="px-3 py-1 bg-accent/80 hover:bg-accent rounded-lg text-white text-xs transition-colors">
              Open
            </button>
          </>
        )}
        {filePath && <span className="text-white/50 text-xs truncate flex-1">{path}</span>}
        {isDirty && <span className="text-yellow-400 text-xs">●</span>}
        {message && <span className="text-green-400 text-xs">{message}</span>}
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="px-3 py-1 bg-accent/80 hover:bg-accent rounded-lg text-white text-xs transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Keyboard shortcut */}
      {/* Ctrl+S to save */}
      <div
        className="flex-1 overflow-hidden"
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } }}
      >
        {loading && (
          <div className="flex items-center justify-center h-full text-white/30 text-sm">
            Loading…
          </div>
        )}
        {error && <div className="p-4 text-red-400 text-sm">{error}</div>}


        {!loading && (
          <MonacoEditor
            height="100%"
            language={getLanguage(path)}
            value={content}
            onChange={(v) => setContent(v || '')}
            theme="vs-dark"
            options={{
              fontSize: 13,
              fontFamily: 'JetBrains Mono, Fira Code, Consolas, monospace',
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              padding: { top: 8, bottom: 8 },
              smoothScrolling: true,
              cursorSmoothCaretAnimation: 'on',
            }}
          />
        )}
      </div>
    </div>
  );
}
