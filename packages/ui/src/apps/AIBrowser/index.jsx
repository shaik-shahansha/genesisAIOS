import React, { useEffect, useState, useRef } from 'react';

export default function AIBrowser({ initialUrl = '', url: initialUrlAlias = '' }) {
  const startingUrl = initialUrl || initialUrlAlias || '';
  const [url, setUrl] = useState(startingUrl);
  const [currentUrl, setCurrentUrl] = useState(startingUrl);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [question, setQuestion] = useState('');
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef(null);

  const navigate = (target) => {
    let nav = target.trim();
    if (!nav) return;
    if (!nav.startsWith('http://') && !nav.startsWith('https://') && nav.includes(' ')) {
      nav = `https://duckduckgo.com/?q=${encodeURIComponent(nav)}`;
    } else if (!nav.startsWith('http://') && !nav.startsWith('https://')) {
      nav = `https://${nav}`;
    }
    setCurrentUrl(nav);
    setUrl(nav);
    setSummary('');
    setIframeBlocked(false);
  };

  useEffect(() => {
    if (startingUrl) {
      navigate(startingUrl);
    }
  }, [startingUrl]);

  // Sync URL bar when the iframe navigates via service worker redirects
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'genesis-nav' && e.data.url) {
        setUrl(e.data.url);
        setCurrentUrl(e.data.url);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const proxyUrl = currentUrl
    ? `/api/browse/proxy?url=${encodeURIComponent(currentUrl)}`
    : '';

  const summarize = async (q) => {
    if (!currentUrl) return;
    setLoadingSummary(true);
    setSummary('');
    try {
      const res = await fetch('/api/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: currentUrl, question: q || undefined }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSummary(data.summary);
    } catch (e) {
      setSummary(`Error: ${e.message}`);
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="flex flex-col h-full text-white">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
        <button
          onClick={() => iframeRef.current?.contentWindow?.history.back()}
          className="text-white/50 hover:text-white px-1"
          title="Back"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4"/>
          </svg>
        </button>
        <button
          onClick={() => iframeRef.current?.contentWindow?.history.forward()}
          className="text-white/50 hover:text-white px-1"
          title="Forward"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 12l4-4-4-4"/>
          </svg>
        </button>
        <button
          onClick={() => navigate(currentUrl)}
          className="text-white/50 hover:text-white px-1"
          title="Reload"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.5 6A6 6 0 1 0 12 11"/>
            <path d="M13.5 2v4h-4"/>
          </svg>
        </button>

        <form
          onSubmit={(e) => { e.preventDefault(); navigate(url); }}
          className="flex-1 flex"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL or search term..."
            className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 border border-white/10 focus:border-accent"
          />
        </form>

        <button
          onClick={() => summarize()}
          disabled={!currentUrl || loadingSummary}
          className="px-3 py-1.5 bg-accent/80 hover:bg-accent rounded-lg text-white text-xs transition-colors disabled:opacity-40 whitespace-nowrap flex items-center gap-1"
          title="AI summarize this page"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0l1.2 4.8L12 6l-4.8 1.2L6 12 4.8 7.2 0 6l4.8-1.2z"/></svg>
          {loadingSummary ? 'AI...' : 'AI'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Browser frame */}
        <div className="flex-1 relative bg-white">
          {!currentUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-4 bg-[#12121f]">
              <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center text-white/70">
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="7.5" />
                  <path d="M2.5 10h15M10 2.5c-2 2-3 4.5-3 7.5s1 5.5 3 7.5M10 2.5c2 2 3 4.5 3 7.5s-1 5.5-3 7.5" />
                </svg>
              </div>
              <p className="text-sm">Browse the web or search with DuckDuckGo</p>
              <div className="flex flex-col gap-2 w-56">
                {['https://duckduckgo.com', 'https://wikipedia.org', 'https://news.ycombinator.com'].map((u) => (
                  <button
                    key={u}
                    onClick={() => navigate(u)}
                    className="text-xs text-accent hover:text-accent-light transition-colors text-left truncate"
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
          {currentUrl && iframeBlocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-4 p-8 text-center bg-[#12121f]">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/30">
                <circle cx="24" cy="24" r="20"/>
                <path d="M8.5 8.5l31 31"/>
              </svg>
              <p className="text-sm font-medium text-white/70">This site blocks embedded viewing</p>
              <p className="text-xs text-white/40 max-w-xs">
                {currentUrl.includes('google.com')
                  ? 'Google disables iframe embedding. Try DuckDuckGo instead, or use the AI button above to summarize.'
                  : 'This site cannot be previewed here. Open it in a new tab or use the AI button to summarize.'}
              </p>
              <div className="flex gap-2 flex-wrap justify-center">
                <button
                  onClick={() => navigate(`https://duckduckgo.com/?q=${encodeURIComponent(currentUrl)}`)}
                  className="px-3 py-1.5 bg-accent/80 hover:bg-accent rounded-lg text-white text-xs"
                >
                  Search DuckDuckGo instead
                </button>
                <a
                  href={currentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs"
                >
                  Open in new tab &#8599;
                </a>
              </div>
            </div>
          )}
          {currentUrl && !iframeBlocked && (
            <iframe
              ref={iframeRef}
              src={proxyUrl}
              title="AI Browser"
              className="w-full h-full border-0"
              onLoad={() => {
                // Detect if the iframe loaded an error/blocked page
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc) {
                    const body = doc.body?.innerText || '';
                    if (body.startsWith('Proxy failed:') || body.includes('ERR_') || body.includes('refused to connect')) {
                      setIframeBlocked(true);
                    }
                  }
                } catch {
                  // cross-origin iframe — loaded OK from proxy
                }
              }}
              onError={() => setIframeBlocked(true)}
            />
          )}
        </div>

        {/* AI sidebar */}
        {summary && (
          <div className="w-72 border-l border-white/8 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-white/8 flex items-center justify-between">
              <span className="text-xs text-white/60 font-medium flex items-center gap-1">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" className="text-accent"><path d="M6 0l1.2 4.8L12 6l-4.8 1.2L6 12 4.8 7.2 0 6l4.8-1.2z"/></svg>
                AI Summary
              </span>
              <button onClick={() => setSummary('')} className="text-white/30 hover:text-white/60 text-sm leading-none">&#10005;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-white/80 text-xs leading-relaxed whitespace-pre-wrap">{summary}</p>
            </div>
            <div className="p-2 border-t border-white/8">
              <div className="flex gap-1">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { summarize(question); setQuestion(''); } }}
                  placeholder="Ask about this page..."
                  className="flex-1 bg-white/5 rounded px-2 py-1 text-xs text-white outline-none placeholder:text-white/30 border border-white/8"
                />
                <button
                  onClick={() => { summarize(question); setQuestion(''); }}
                  className="px-2 py-1 bg-accent rounded text-xs text-white"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 10V2M2 6l4-4 4 4"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
