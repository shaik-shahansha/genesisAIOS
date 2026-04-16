import React, { useEffect, useState } from 'react';

export default function AIBrowser({ initialUrl = '', url: initialUrlAlias = '' }) {
  const [browserConfig, setBrowserConfig] = useState(null);
  const [configError, setConfigError] = useState('');
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameNonce, setFrameNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/browser/config')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setBrowserConfig(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setConfigError(err.message || 'Failed to load browser configuration.');
      });

    return () => {
      cancelled = true;
    };
  }, [initialUrl, initialUrlAlias]);

  const sessionSrc = browserConfig?.enabled ? `${browserConfig.sessionUrl}?v=${frameNonce}` : '';

  return (
    <div className="relative h-full overflow-hidden bg-[#05070d] text-white">
      {!frameLoaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[linear-gradient(180deg,rgba(5,7,13,0.92),rgba(5,7,13,0.76))] text-center">
          <div className="h-12 w-12 animate-pulse rounded-2xl border border-white/10 bg-white/6" />
          <div>
            <p className="text-sm text-white/78">Starting browser</p>
            <p className="mt-1 text-xs text-white/40">Please wait a moment.</p>
          </div>
        </div>
      )}

      {configError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-red-400/20 bg-red-500/10 p-5 text-center backdrop-blur-xl">
            <p className="text-sm font-medium text-red-100">Browser configuration failed</p>
            <p className="mt-2 text-xs text-red-100/70">{configError}</p>
          </div>
        </div>
      )}

      {!configError && browserConfig && !browserConfig.enabled && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur-xl">
            <p className="text-sm font-medium text-white/88">Genesis Browser is disabled</p>
            <p className="mt-2 text-xs text-white/50">Enable Neko in Docker with GENESIS_BROWSER_ENABLED=true.</p>
          </div>
        </div>
      )}

      {browserConfig?.enabled && (
        <>
          <iframe
            key={sessionSrc}
            src={sessionSrc}
            title="Genesis Browser"
            className="h-full w-full border-0"
            allow="autoplay; clipboard-read; clipboard-write; fullscreen"
            allowFullScreen
            onLoad={() => setFrameLoaded(true)}
          />

          <button
            onClick={() => {
              setFrameLoaded(false);
              setFrameNonce((prev) => prev + 1);
            }}
            className="absolute right-4 top-4 z-20 rounded-lg border border-white/10 bg-[#11161fcc] px-3 py-1.5 text-xs text-white/75 shadow-[0_12px_32px_rgba(0,0,0,0.34)] backdrop-blur-xl transition hover:bg-[#1a202bcc] hover:text-white"
          >
            Reconnect
          </button>

          <div
            className="pointer-events-none absolute bottom-3 right-3 z-20 h-14 w-14 rounded-2xl bg-[#05070d] shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
            aria-hidden="true"
          />
        </>
      )}
    </div>
  );
}
