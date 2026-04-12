import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOS } from '../App';
import { APP_REGISTRY } from '../apps/registry';
import { panelSlideUp, stagger, staggerItem } from '../design/animations';

export default function AppLauncher() {
  const { setLauncherOpen, openApp } = useOS();
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setLauncherOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setLauncherOpen]);

  const filtered = query.trim()
    ? APP_REGISTRY.filter((a) =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        (a.tags || []).some((t) => t.toLowerCase().includes(query.toLowerCase()))
      )
    : APP_REGISTRY;

  return (
    <motion.div
      variants={panelSlideUp}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={() => setLauncherOpen(false)}
    >
      <motion.div
        className="glass-dark rounded-2xl overflow-hidden shadow-glass-lg"
        style={{ width: 640, maxHeight: '70vh' }}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
          <span className="text-2xl">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search apps…"
            className="flex-1 bg-transparent text-white text-lg outline-none placeholder:text-white/30"
          />
          <kbd className="text-white/30 text-xs border border-white/15 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* App grid */}
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 80px)' }}>
          {filtered.length === 0 ? (
            <p className="text-white/30 text-center py-8">No apps match "{query}"</p>
          ) : (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-4 gap-3"
            >
              {filtered.map((app) => (
                <motion.button
                  key={app.id}
                  variants={staggerItem}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => { openApp(app.id); setLauncherOpen(false); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl hover:bg-white/8 transition-colors group"
                >
                  <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center group-hover:shadow-glow-sm transition-shadow" style={{ color: 'rgba(200,198,220,0.8)' }}>
                    <span className="w-7 h-7 block [&>svg]:w-full [&>svg]:h-full">{app.icon}</span>
                  </div>
                  <span className="text-white/65 text-[11px] font-medium text-center leading-tight tracking-wide">{app.name}</span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
