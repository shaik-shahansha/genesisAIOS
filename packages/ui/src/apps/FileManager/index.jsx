import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { stagger, staggerItem } from '../../design/animations';
import { createOfficeTemplate } from './officeTemplates';
import { useOS } from '../../App';

const OFFICE_EXTENSIONS = new Set(['doc', 'docx', 'xlsx', 'xls', 'ppt', 'pptx', 'md', 'markdown', 'html', 'htm', 'txt', 'rtf', 'csv']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif']);

function getIcon(item) {
  const tone = item.type === 'dir'
    ? 'rgba(99,102,241,0.95)'
    : ['pdf', 'docx', 'txt', 'md'].includes(item.ext)
      ? 'rgba(244,114,182,0.9)'
      : ['xlsx', 'csv'].includes(item.ext)
        ? 'rgba(16,185,129,0.9)'
        : ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(item.ext)
          ? 'rgba(14,165,233,0.9)'
          : 'rgba(200,198,220,0.8)';

  if (item.type === 'dir') {
    return (
      <svg viewBox="0 0 20 20" fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3l1.2 1.4H16A1.5 1.5 0 0 1 17.5 7.9v6.6A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5v-8Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 2.5h6l4 4V16A1.5 1.5 0 0 1 13.5 17h-8A1.5 1.5 0 0 1 4 15.5v-11A2 2 0 0 1 6 2.5Z" />
      <path d="M11 2.5V7h4" />
    </svg>
  );
}

export default function FileManager({ winId }) {
  const { demoMode } = useOS();
  const [cwd, setCwd] = useState('');
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(['']);
  const [histIdx, setHistIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [entryName, setEntryName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const uploadInputRef = useRef(null);

  const load = useCallback(async (path) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(data.items || []);
      setCwd(data.cwd || path);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);

  const navigate = (path) => {
    const newHistory = [...history.slice(0, histIdx + 1), path];
    setHistory(newHistory);
    setHistIdx(newHistory.length - 1);
    load(path);
    setSelected(null);
  };

  const goBack = () => {
    if (histIdx > 0) { const prev = history[histIdx - 1]; setHistIdx(histIdx - 1); load(prev); setSelected(null); }
  };
  const goForward = () => {
    if (histIdx < history.length - 1) { const next = history[histIdx + 1]; setHistIdx(histIdx + 1); load(next); setSelected(null); }
  };

  const handleOpen = (item) => {
    if (item.type === 'dir') { navigate(item.path); return; }
    // Open in appropriate app
    const ext = item.ext;
    if (ext === 'pdf') {
      window._genesisOpenApp?.('pdf', { filePath: item.path });
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      window._genesisOpenApp?.('office', { filePath: item.path });
    } else if (OFFICE_EXTENSIONS.has(ext)) {
      window._genesisOpenApp?.('office', { filePath: item.path });
    } else {
      window._genesisOpenApp?.('editor', { filePath: item.path });
    }
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Reset input so the same file can be re-uploaded
    e.target.value = '';
    setUploading(true);
    setError(null);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Uploading ${file.name} (${i + 1}/${files.length})…`);
      try {
        const destPath = cwd && cwd !== '.' ? `${cwd}/${file.name}` : file.name;
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        // Build base64 in chunks to avoid call-stack limits on large files
        let binary = '';
        const CHUNK = 8192;
        for (let j = 0; j < uint8.length; j += CHUNK) {
          binary += String.fromCharCode(...uint8.subarray(j, j + CHUNK));
        }
        const base64 = btoa(binary);
        const res = await fetch('/api/fs/write-binary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: destPath, base64 }),
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({}));
          throw new Error(msg || `HTTP ${res.status}`);
        }
      } catch (err) {
        setError(`Upload failed for ${file.name}: ${err.message}`);
      }
    }
    setUploading(false);
    setUploadProgress('');
    load(cwd);
  };

  const handleDownload = (item) => {
    const url = `/api/fs/raw?path=${encodeURIComponent(item.path)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const createEntry = async (kind) => {
    const trimmed = entryName.trim();
    if (!trimmed) return;

    const fullPath = cwd && cwd !== '.' ? `${cwd}/${trimmed}` : trimmed;
    try {
      if (kind === 'folder') {
        const res = await fetch('/api/fs/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: fullPath }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const ext = trimmed.split('.').pop().toLowerCase();
        const officeBlob = await createOfficeTemplate(ext);

        if (officeBlob) {
          // Office files must be written as binary to be valid ZIP archives
          const arrayBuffer = await officeBlob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const base64 = btoa(binary);
          const res = await fetch('/api/fs/write-binary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath, base64 }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          const res = await fetch('/api/fs/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath, content: '' }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
      }

      setPendingAction(null);
      setEntryName('');
      load(cwd);
    } catch (e) {
      setError(e.message);
    }
  };

  const breadcrumbs = cwd ? ['Home', ...cwd.split('/')].filter(Boolean) : ['Home'];

  return (
    <div className="flex flex-col h-full text-white">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
        <button onClick={goBack} disabled={histIdx === 0} className="text-white/50 hover:text-white disabled:opacity-20 text-lg px-1">‹</button>
        <button onClick={goForward} disabled={histIdx === history.length - 1} className="text-white/50 hover:text-white disabled:opacity-20 text-lg px-1">›</button>
        <button onClick={() => load(cwd)} className="text-white/50 hover:text-white text-sm px-1" title="Refresh">↻</button>
        <button onClick={() => { setPendingAction('file'); setEntryName(''); }} className="text-white/60 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-white/6">New File</button>
        <button onClick={() => { setPendingAction('folder'); setEntryName(''); }} className="text-white/60 hover:text-white text-xs px-2 py-1 rounded-md hover:bg-white/6">New Folder</button>

        {/* Upload */}
        {demoMode === false && (
          <>
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              title="Upload files from your PC"
              className="flex items-center gap-1 text-white/60 hover:text-white disabled:opacity-40 text-xs px-2 py-1 rounded-md hover:bg-white/6 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 14V4M6 8l4-4 4 4"/>
                <path d="M3 16h14"/>
              </svg>
              {uploading ? uploadProgress : 'Upload'}
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </>
        )}

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-white/30 text-xs">/</span>}
              <button
                className="text-white/70 hover:text-white text-xs transition-colors whitespace-nowrap"
                onClick={() => {
                  const path = breadcrumbs.slice(1, i + 1).join('/');
                  navigate(path);
                }}
              >
                {crumb}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {pendingAction && (
        <div className="px-3 py-2 border-b border-white/8 bg-white/3 flex items-center gap-2">
          <input
            autoFocus
            value={entryName}
            onChange={(event) => setEntryName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') createEntry(pendingAction);
              if (event.key === 'Escape') { setPendingAction(null); setEntryName(''); }
            }}
            placeholder={pendingAction === 'folder' ? 'Folder name' : 'File name'}
            className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 border border-white/10 focus:border-accent"
          />
          <button onClick={() => createEntry(pendingAction)} className="px-3 py-1.5 bg-accent rounded-lg text-white text-xs">Create</button>
          <button onClick={() => { setPendingAction(null); setEntryName(''); }} className="px-2 py-1.5 text-white/50 hover:text-white text-xs">Cancel</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && <div className="text-white/30 text-sm p-4">Loading…</div>}
        {error && <div className="text-red-400 text-sm p-4">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="text-white/30 text-sm p-4">Empty folder</div>
        )}
        {!loading && !error && (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="grid gap-1"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}
          >
            {items
              .sort((a, b) => {
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name);
              })
              .map((item) => (
                <motion.button
                  key={item.path}
                  variants={staggerItem}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setSelected(item)}
                  onDoubleClick={() => handleOpen(item)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors text-left ${
                    selected?.path === item.path ? 'bg-accent/30 glow-border' : 'hover:bg-white/5'
                  }`}
                >
                  <span className="w-8 h-8 block [&>svg]:w-full [&>svg]:h-full">{getIcon(item)}</span>
                  <span className="text-white/80 text-xs text-center leading-tight break-all line-clamp-2 w-full">
                    {item.name}
                  </span>
                  {item.type === 'file' && item.size > 0 && (
                    <span className="text-white/30 text-xs">{formatSize(item.size)}</span>
                  )}
                </motion.button>
              ))}
          </motion.div>
        )}
      </div>

      {/* Status bar */}
      {selected && (
        <div className="px-3 py-2 border-t border-white/8 text-white/40 text-xs flex items-center gap-3">
          {/* Inline rename input */}
          {pendingAction === 'rename' ? (
            <form
              className="flex items-center gap-2 flex-1"
              onSubmit={async (e) => {
                e.preventDefault();
                const newName = entryName.trim();
                if (!newName || newName === selected.name) { setPendingAction(null); return; }
                try {
                  const r = await fetch('/api/fs/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath: selected.path, newName }) });
                  const d = await r.json();
                  if (!r.ok) throw new Error(d.error);
                  await load(cwd);
                  setSelected(null);
                } catch (err) {
                  alert(err.message);
                } finally {
                  setPendingAction(null);
                }
              }}
            >
              <span className="text-white/50">Rename to:</span>
              <input
                autoFocus
                value={entryName}
                onChange={(e) => setEntryName(e.target.value)}
                className="flex-1 bg-white/8 rounded px-2 py-0.5 text-white/80 outline-none border border-white/15 focus:border-indigo-400/60 text-xs"
              />
              <button type="submit" className="text-indigo-300 hover:text-indigo-200 transition-colors">OK</button>
              <button type="button" onClick={() => setPendingAction(null)} className="text-white/30 hover:text-white/60 transition-colors">Cancel</button>
            </form>
          ) : (
            <>
              <span>{getIcon(selected)} {selected.name}</span>
              {selected.type === 'file' && <span>{formatSize(selected.size)}</span>}
              <div className="ml-auto flex items-center gap-2">
                {/* Rename */}
                <button
                  onClick={() => { setEntryName(selected.name); setPendingAction('rename'); }}
                  title="Rename"
                  className="flex items-center gap-1 text-white/50 hover:text-amber-300 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 16h3l7-7-3-3-7 7v3zM14.5 4.5l1 1a1 1 0 0 1 0 1.4l-1 1-2.4-2.4 1-1a1 1 0 0 1 1.4 0z"/>
                  </svg>
                  Rename
                </button>
                {/* Pin to Desktop */}
                {selected.type === 'file' && (
                  <button
                    onClick={async () => {
                      try {
                        const nameNoExt = selected.name.replace(/\.[^.]+$/, '');
                        const r = await fetch('/api/apps/shortcut', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath: selected.path, name: nameNoExt }) });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.error);
                        window._genesisRefreshApps?.();
                        alert(`"${nameNoExt}" pinned to desktop!`);
                      } catch (err) {
                        alert(err.message);
                      }
                    }}
                    title="Add shortcut to desktop"
                    className="flex items-center gap-1 text-white/50 hover:text-emerald-300 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="7" height="7" rx="1.5"/>
                      <rect x="11" y="2" width="7" height="7" rx="1.5"/>
                      <rect x="2" y="11" width="7" height="7" rx="1.5"/>
                      <path d="M14.5 11v6M11.5 14h6"/>
                    </svg>
                    Pin to Desktop
                  </button>
                )}
                {/* Download */}
                {selected.type === 'file' && (
                  <button
                    onClick={() => handleDownload(selected)}
                    title="Download to your PC"
                    className="flex items-center gap-1 text-white/50 hover:text-sky-400 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 4v10M6 10l4 4 4-4"/>
                      <path d="M3 16h14"/>
                    </svg>
                    Download
                  </button>
                )}
                <button onClick={() => handleOpen(selected)} className="text-accent hover:text-accent-light transition-colors">
                  Open →
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
