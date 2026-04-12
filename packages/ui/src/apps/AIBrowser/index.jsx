import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

export default function AIBrowser({ initialUrl = '', url: initialUrlAlias = '' }) {
  const startingUrl = initialUrl || initialUrlAlias || '';
  const [url, setUrl] = useState(startingUrl);
  const [currentUrl, setCurrentUrl] = useState(startingUrl);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [question, setQuestion] = useState('');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const iframeRef = useRef(null);

  const navigate = (target) => {
    let nav = target.trim();
    if (!nav) return;
    // If not a URL, treat as DuckDuckGo search
    if (!nav.startsWith('http://') && !nav.startsWith('https://') && nav.includes(' ')) {
      nav = `https://duckduckgo.com/?q=${encodeURIComponent(nav)}`;
    } else if (!nav.startsWith('http://') && !nav.startsWith('https://')) {
      nav = `https://${nav}`;
    }
    setCurrentUrl(nav);
    setUrl(nav);
    setSummary('');
    setIframeLoaded(false);
    setIframeBlocked(false);
  };

  useEffect(() => {
    if (startingUrl) {
      navigate(startingUrl);
    }
  }, [startingUrl]);

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
          className="text-white/50 hover:text-white text-lg px-1"
        >â€¹</button>
        <button
          onClick={() => iframeRef.current?.contentWindow?.history.forward()}
          className="text-white/50 hover:text-white text-lg px-1"
        >â€º</button>
        <button
          onClick={() => navigate(currentUrl)}
          className="text-white/50 hover:text-white text-sm px-1"
        >â†»</button>

        <form
          onSubmit={(e) => { e.preventDefault(); navigate(url); }}
          className="flex-1 flex"
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter URL or search termâ€¦"
            className="flex-1 bg-white/5 rounded-lg px-3 py-1.5 text-sm text-white outline-none placeholder:text-white/30 border border-white/10 focus:border-accent"
          />
        </form>

        <button
          onClick={() => summarize()}
          disabled={!currentUrl || loadingSummary}
          className="px-3 py-1.5 bg-accent/80 hover:bg-accent rounded-lg text-white text-xs transition-colors disabled:opacity-40 whitespace-nowrap"
          title="AI summarize this page"
        >
          {loadingSummary ? 'â€¦' : 'âœ¦ AI'}
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Browser frame */}
        <div className="flex-1 relative bg-base-200">
          {!currentUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-4">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 gap-4 p-8 text-center">
              <div className="text-4xl">ðŸš«</div>
              <p className="text-sm font-medium text-white/70">This site blocks embedded viewing</p>
              <p className="text-xs text-white/40 max-w-xs">
                {currentUrl.includes('google.com')
                  ? 'Google disables iframe embedding. Try DuckDuckGo instead, or use the AI summary button above.'
                  : 'This site uses X-Frame-Options to prevent embedding. You can still use the AI summary button above.'}
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
                  Open in new tab â†—
                </a>
              </div>
            </div>
          )}
          {currentUrl && !iframeBlocked && (
            <iframe
              ref={iframeRef}
              src={proxyUrl}
              title="AI Browser"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
              className="w-full h-full border-0 bg-white"
              onLoad={() => {
                setIframeLoaded(true);
                // Detect if the iframe loaded an error/blocked page
                try {
                  const doc = iframeRef.current?.contentDocument;
                  if (doc) {
                    const body = doc.body?.innerText || '';
                    if (body.includes('refused to connect') || body.includes('ERR_') ||
                        (doc.title && doc.title.includes('refused'))) {
                      setIframeBlocked(true);
                    }
                  }
                } catch {
                  // cross-origin: can't read â€” page loaded OK
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
              <span className="text-xs text-white/60 font-medium">âœ¦ AI Summary</span>
              <button onClick={() => setSummary('')} className="text-white/30 hover:text-white/60 text-sm">âœ•</button>
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
                  placeholder="Ask about this pageâ€¦"
                  className="flex-1 bg-white/5 rounded px-2 py-1 text-xs text-white outline-none placeholder:text-white/30 border border-white/8"
                />
                <button
                  onClick={() => { summarize(question); setQuestion(''); }}
                  className="px-2 py-1 bg-accent rounded text-xs text-white"
                >â†’</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
