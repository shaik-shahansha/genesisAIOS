import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import FilePicker from '../../components/FilePicker';

export default function PDFViewer({ filePath: initialPath }) {
  const [url, setUrl] = useState(null);
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const openFile = (p) => {
    if (!p) return;
    setError(null);
    setLoaded(false);
    setCurrentPath(p);
    setUrl(`/api/fs/raw?path=${encodeURIComponent(p)}`);
  };

  useEffect(() => {
    if (initialPath) openFile(initialPath);
  }, [initialPath]);

  const fileName = currentPath ? currentPath.split('/').pop() : null;

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
          <span className="text-white/30 text-xs flex-1">No file open — click Browse to open a PDF</span>
        )}
        {url && (
          <a
            href={url}
            download={fileName}
            className="flex items-center gap-1 px-2 py-1 text-white/40 hover:text-white/70 text-xs transition-colors"
            title="Download"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 3v13M8 12l4 4 4-4M5 20h14" />
            </svg>
          </a>
        )}
      </div>

      {error && (
        <div className="p-4 text-red-400 text-sm">{error}</div>
      )}

      {!url && !error && (
        <div className="flex-1 flex items-center justify-center text-white/30 text-sm flex-col gap-3">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="none" stroke="rgba(239,68,68,0.35)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 2.5h6.5L15.5 6.5V17a1 1 0 01-1 1H5a1 1 0 01-1-1V3.5a1 1 0 011-1z" />
            <path d="M11.5 2.5V6.5h4" />
            <path d="M7 9.5h6M7 12h6M7 14.5h3.5" />
          </svg>
          <p>Click <strong className="text-white/50">Browse</strong> to open a PDF file</p>
        </div>
      )}

      {url && (
        <div className="flex-1 relative overflow-hidden bg-black/40">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
              <svg className="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
              </svg>
              Loading PDF…
            </div>
          )}
          <iframe
            src={url}
            title="PDF Viewer"
            className="w-full h-full border-0"
            onLoad={() => setLoaded(true)}
            onError={() => { setError('Failed to load PDF'); setLoaded(true); }}
            style={{ display: loaded ? 'block' : 'none' }}
          />
        </div>
      )}

      <AnimatePresence>
        {showPicker && (
          <FilePicker
            accept={['pdf']}
            onSelect={(p) => { openFile(p); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
