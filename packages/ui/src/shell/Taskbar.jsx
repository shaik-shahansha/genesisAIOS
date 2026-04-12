import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOS } from '../App';
import { APP_REGISTRY } from '../apps/registry';
import AIOrb from './AIOrb';
import { dockIconHover } from '../design/animations';

export default function Taskbar() {
  const { windows, minimizeWindow, restoreWindow, activeId, focusWindow, openApp, setLauncherOpen, setNotifOpen } = useOS();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  const formatTime = (d) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formatDate = (d) =>
    d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="absolute bottom-0 left-0 right-0 h-16 flex items-end justify-center pb-2 z-50 pointer-events-none">
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 30 }}
        className="pointer-events-auto flex items-center gap-1 px-4 h-12 glass-dark rounded-2xl shadow-glass-lg"
        style={{ maxWidth: 'calc(100vw - 160px)' }}
      >
        {/* App dock */}
        <div className="flex items-center gap-1">
          {APP_REGISTRY.map((app) => {
            const openWins = windows.filter((w) => w.appId === app.id);
            const isActive = openWins.some((w) => w.id === activeId);
            const isOpen = openWins.length > 0;
            return (
              <DockIcon
                key={app.id}
                app={app}
                isOpen={isOpen}
                isActive={isActive}
                hasMinimized={openWins.some((w) => w.minimized)}
                onClick={() => {
                  if (!isOpen) {
                    openApp(app.id);
                  } else if (isActive) {
                    minimizeWindow(openWins[0].id);
                  } else {
                    openWins.forEach((w) => w.minimized ? restoreWindow(w.id) : focusWindow(w.id));
                  }
                }}
              />
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-white/15 mx-2" />

        {/* Launcher button */}
        <motion.button
          whileHover={{ scale: 1.15, y: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setLauncherOpen(true)}
          className="w-9 h-9 rounded-xl glass flex items-center justify-center hover:shadow-glow transition-shadow"
          style={{ color: 'rgba(200,198,220,0.7)' }}
          title="App Launcher (⌘Space)"
        >
          {/* Spotlight / search lens icon — distinct from My Apps grid */}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="4.5" />
            <path d="M10 10l3.5 3.5" />
          </svg>
        </motion.button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/15 mx-2" />

        {/* Clock + notifications */}
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="flex flex-col items-end justify-center px-2 hover:bg-white/5 rounded-lg transition-colors h-10"
        >
          <span className="text-white/90 text-[13px] font-semibold leading-tight tabular-nums tracking-tight">{formatTime(time)}</span>
          <span className="text-white/50 text-xs leading-tight">{formatDate(time)}</span>
        </button>
      </motion.div>

      {/* AIOrb — always bottom-right, outside dock */}
      <AIOrb />
    </div>
  );
}

function DockIcon({ app, isOpen, isActive, hasMinimized, onClick }) {
  return (
    <motion.button
      initial="rest"
      whileHover="hover"
      variants={dockIconHover}
      onClick={onClick}
      className="relative flex flex-col items-center"
      title={app.name}
    >
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
          isActive
            ? 'glass glow-border shadow-glow'
            : isOpen
            ? 'glass'
            : 'hover:glass'
        }`}
        style={{ color: isActive ? '#818CF8' : 'rgba(200,198,220,0.75)' }}
      >
        <span className="w-[18px] h-[18px] block [&>svg]:w-full [&>svg]:h-full">{app.icon}</span>
      </div>
      {/* Running indicator dot */}
      {isOpen && (
        <div
          className={`absolute -bottom-1 w-1 h-1 rounded-full ${
            isActive ? 'bg-accent' : 'bg-white/40'
          }`}
        />
      )}
    </motion.button>
  );
}
