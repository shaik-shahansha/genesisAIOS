import React, { useState, useEffect, useRef, useCallback } from 'react';

const LEVEL_STYLES = {
  error: { badge: 'bg-red-500/20 text-red-400 border border-red-500/30', dot: 'bg-red-400' },
  warn:  { badge: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', dot: 'bg-yellow-400' },
  info:  { badge: 'bg-blue-500/20 text-blue-400 border border-blue-500/30', dot: 'bg-blue-400' },
  debug: { badge: 'bg-white/10 text-white/40 border border-white/10', dot: 'bg-white/30' },
};

function formatTs(ts) {
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return ts;
  }
}

export default function LogsApp() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef(null);
  const esRef = useRef(null);
  const containerRef = useRef(null);

  const connect = useCallback(() => {
    if (esRef.current) { esRef.current.close(); }

    const es = new EventSource('/api/logs/stream');
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        setLogs((prev) => {
          const next = [...prev, { ...entry, id: `${entry.ts}-${Math.random()}` }];
          return next.length > 2000 ? next.slice(-2000) : next;
        });
      } catch { /* ignore malformed */ }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    setAutoScroll(scrollTop + clientHeight >= scrollHeight - 60);
  };

  const clearLogs = () => setLogs([]);

  const filtered = logs.filter((l) => {
    if (filter !== 'all' && l.level !== filter) return false;
    if (search && !l.msg.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-black/20 text-sm font-mono">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/30 flex-shrink-0">
        {/* Connection indicator */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-400 shadow-[0_0_6px_#4ade80]' : 'bg-red-400'}`} />
        <span className="text-white/50 text-xs">{connected ? 'Live' : 'Disconnected'}</span>

        {/* Level filter */}
        <div className="flex gap-1 ml-2">
          {['all', 'info', 'warn', 'error'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                filter === lvl
                  ? 'bg-white/20 text-white'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/10'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="filter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto bg-white/5 border border-white/10 rounded px-2 py-0.5 text-white/70 text-xs w-36 focus:outline-none focus:border-white/30 placeholder:text-white/25"
        />

        {/* Auto-scroll toggle */}
        <button
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
            autoScroll ? 'bg-blue-500/20 text-blue-400' : 'text-white/40 hover:text-white/60'
          }`}
        >
          ↓ scroll
        </button>

        {/* Reconnect */}
        <button
          onClick={connect}
          className="px-2 py-0.5 rounded text-[11px] text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors"
          title="Reconnect"
        >
          ↺
        </button>

        {/* Clear */}
        <button
          onClick={clearLogs}
          className="px-2 py-0.5 rounded text-[11px] text-red-400/60 hover:text-red-400 hover:bg-red-400/10 transition-colors"
        >
          clear
        </button>

        <span className="text-white/25 text-[11px] ml-1">{filtered.length} entries</span>
      </div>

      {/* Log list */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-0 py-1 space-y-0"
        style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}
      >
        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-full text-white/20 text-xs">
            No log entries yet — start using the OS to see daemon activity
          </div>
        )}
        {filtered.map((entry) => {
          const style = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info;
          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 px-3 py-[3px] hover:bg-white/[0.03] border-b border-white/[0.04] group"
            >
              {/* Level dot */}
              <div className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
              {/* Timestamp */}
              <span className="text-white/25 text-[10px] flex-shrink-0 mt-px leading-5 tabular-nums">
                {formatTs(entry.ts)}
              </span>
              {/* Level badge */}
              <span className={`text-[9px] px-1 rounded flex-shrink-0 mt-[3px] leading-4 uppercase font-bold ${style.badge}`}>
                {entry.level}
              </span>
              {/* Message */}
              <span className="text-white/70 text-[11px] leading-5 break-all whitespace-pre-wrap flex-1 min-w-0">
                {entry.msg}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
