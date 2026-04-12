import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const EXT_ICONS = {
  pdf: '📄', docx: '📝', doc: '📝', xlsx: '📊', xls: '📊', pptx: '📋', ppt: '📋',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
  mp3: '🎵', wav: '🎵', ogg: '🎵', mp4: '🎬', webm: '🎬', mov: '🎬',
  js: '🟨', ts: '🔷', jsx: '⚛️', tsx: '⚛️', html: '🌐', css: '🎨',
  py: '🐍', json: '📋', md: '📖', txt: '📃',
};

export default function FilePicker({ onSelect, onClose, accept }) {
  const [dirPath, setDirPath] = useState('');
  const [items, setItems] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([{ name: 'Workspace', path: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async (dir) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dir)}`);
      if (!res.ok) throw new Error('Failed to list directory');
      const data = await res.json();
      setItems(data.items || []);
      setDirPath(dir);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(''); }, []);

  const navigate = (item) => {
    if (item.type === 'dir') {
      setBreadcrumbs((prev) => [...prev, { name: item.name, path: item.path }]);
      load(item.path);
    } else {
      onSelect(item.path);
    }
  };

  const navigateCrumb = (crumb, idx) => {
    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
    load(crumb.path);
  };

  const filtered = accept
    ? items.filter((i) => i.type === 'dir' || (i.ext && accept.includes(i.ext)))
    : items;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="glass-dark rounded-2xl overflow-hidden shadow-glass-lg flex flex-col"
        style={{ width: 540, height: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="rgba(234,179,8,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6.5A1.5 1.5 0 013.5 5H7.8a1.5 1.5 0 011.1.48L10.1 6.5H16.5A1.5 1.5 0 0118 8v6.5A1.5 1.5 0 0116.5 16h-13A1.5 1.5 0 012 14.5V6.5z" />
              <path d="M2 8.5h16" />
            </svg>
            <span className="text-white/90 font-semibold text-sm">Open File</span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-white/40 hover:text-white/80 hover:bg-white/8 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 text-xs text-white/50 flex-shrink-0 bg-white/2">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && <span className="text-white/20 mx-0.5">/</span>}
              <button
                onClick={() => navigateCrumb(crumb, idx)}
                className={`hover:text-white/80 transition-colors px-1 py-0.5 rounded ${idx === breadcrumbs.length - 1 ? 'text-white/80' : 'hover:bg-white/5'}`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              <svg className="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
              </svg>
              Loading…
            </div>
          )}
          {error && <div className="p-4 text-red-400 text-sm">{error}</div>}
          {!loading && filtered.length === 0 && (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">No files here</div>
          )}
          {!loading && filtered.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/6 transition-colors text-left group"
            >
              <span className="text-lg flex-shrink-0">
                {item.type === 'dir' ? '📁' : (EXT_ICONS[item.ext] || '📃')}
              </span>
              <span className="text-white/85 text-sm truncate flex-1">{item.name}</span>
              {item.type === 'dir' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" className="flex-shrink-0">
                  <path d="M4 2l4 4-4 4" />
                </svg>
              ) : (
                <span className="text-white/30 text-xs flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">Open</span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        {accept && (
          <div className="px-4 py-2 border-t border-white/5 text-xs text-white/30 flex-shrink-0">
            Supported: {accept.map((e) => `.${e}`).join(', ')}
          </div>
        )}
      </motion.div>
    </div>
  );
}
