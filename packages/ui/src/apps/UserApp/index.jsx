import React, { useState, useEffect } from 'react';

export default function UserApp({ appId, appName, appIcon }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    <iframe
      srcDoc={html}
      title={appName || 'App'}
      className="w-full h-full border-0 rounded-b-xl"
      sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
      style={{ background: '#1a1625' }}
    />
  );
}
