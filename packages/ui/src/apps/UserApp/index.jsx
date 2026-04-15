import React, { useState, useEffect, useCallback } from 'react';
import { useOS } from '../../App';

export default function UserApp({ appId, appName, appIcon, winId }) {
  const { closeWindow, fetchUserApps } = useOS();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!appId) return;
    fetch(`/api/apps/${appId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`App not found (${r.status})`);
        return r.json();
      })
      .then((d) => { setHtml(d.html_content || ''); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [appId]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete app "${appName}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/apps/${appId}`, { method: 'DELETE' });
      await fetchUserApps?.(); // refresh desktop icons
      closeWindow?.(winId);    // close this window
    } catch {
      setDeleting(false);
    }
  }, [appId, appName, winId, closeWindow, fetchUserApps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-white/40 text-sm">
        Loading {appIcon} {appName}…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400/80 text-sm">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-white/8 flex-shrink-0">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="flex items-center gap-1 text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1 rounded-md hover:bg-red-500/10 disabled:opacity-40"
          title="Delete this app"
        >
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h12M8 6V4h4v2M7 6l1 10h4l1-10"/>
          </svg>
          {deleting ? 'Deleting…' : 'Delete App'}
        </button>
      </div>
      <iframe
        srcDoc={html}
        title={appName || 'App'}
        className="flex-1 border-0 rounded-b-xl w-full"
        sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
        style={{ background: '#1a1625' }}
      />
    </div>
  );
}
