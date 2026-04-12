import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AppBuilder({ openApp }) {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchApps = useCallback(async () => {
    try {
      const r = await fetch('/api/apps/list');
      const d = await r.json();
      setApps(d.apps || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchApps();
    // Listen for new app creation events
    window._genesisRefreshApps = fetchApps;
    return () => { delete window._genesisRefreshApps; };
  }, [fetchApps]);

  const deleteApp = async (id) => {
    await fetch(`/api/apps/${id}`, { method: 'DELETE' });
    setDeleteConfirm(null);
    fetchApps();
  };

  const openCreatedApp = (app) => {
    openApp?.(`userapp_${app.id}`, { appId: app.id, appName: app.name, appIcon: app.icon });
  };

  return (
    <div className="flex flex-col h-full text-white">
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div>
          <h1 className="font-semibold text-white/90 text-base">My Apps</h1>
          <p className="text-white/40 text-xs mt-0.5">Apps created by Genesis AI</p>
        </div>
        <button
          onClick={fetchApps}
          className="w-8 h-8 rounded-lg glass flex items-center justify-center text-white/40 hover:text-white/80 transition-colors"
          title="Refresh"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-32 text-white/30 text-sm">
            Loading apps…
          </div>
        )}

        {!loading && apps.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
            <div className="text-4xl opacity-40">🧩</div>
            <p className="text-white/40 text-sm leading-relaxed">
              No apps yet.<br />
              Ask Genesis AI to create one for you!
            </p>
            <p className="text-white/25 text-xs">
              Try: "Create a todo list app" or "Build a habit tracker"
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <AnimatePresence>
            {apps.map((app) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="glass rounded-xl p-3 flex flex-col items-center gap-2 group relative cursor-pointer hover:bg-white/5 transition-colors"
                onDoubleClick={() => openCreatedApp(app)}
                onClick={() => openCreatedApp(app)}
              >
                <div className="text-3xl">{app.icon || '🧩'}</div>
                <div className="text-center">
                  <div className="text-white/85 text-xs font-medium leading-tight">{app.name}</div>
                  {app.description && (
                    <div className="text-white/35 text-[10px] mt-0.5 leading-tight line-clamp-2">
                      {app.description}
                    </div>
                  )}
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(app.id); }}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded bg-red-500/0 text-white/0 group-hover:bg-red-500/20 group-hover:text-white/50 hover:!bg-red-500/40 hover:!text-white/90 transition-all flex items-center justify-center text-xs"
                  title="Delete app"
                >
                  ✕
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="glass-dark rounded-2xl p-6 max-w-xs w-full mx-4 text-center"
            >
              <div className="text-2xl mb-2">🗑️</div>
              <p className="text-white/80 text-sm font-medium mb-1">Delete this app?</p>
              <p className="text-white/40 text-xs mb-4">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2 rounded-lg glass text-white/70 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteApp(deleteConfirm)}
                  className="flex-1 py-2 rounded-lg bg-red-500/30 border border-red-500/40 text-red-300 text-sm hover:bg-red-500/50 transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
