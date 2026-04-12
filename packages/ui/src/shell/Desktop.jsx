import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOS } from '../App';
import { APP_REGISTRY } from '../apps/registry';

const DESKTOP_ICONS = APP_REGISTRY.slice(0, 6); // show first 6 built-in apps on desktop

export default function Desktop() {
  const { openApp, userApps } = useOS();
  const [contextMenu, setContextMenu] = useState(null);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeMenu = () => setContextMenu(null);

  return (
    <div
      className="absolute inset-0"
      onContextMenu={handleContextMenu}
      onClick={closeMenu}
    >
      {/* Desktop icon grid */}
      <div className="absolute top-8 right-8 flex flex-col gap-3">
        {DESKTOP_ICONS.map((app) => (
          <DesktopIcon key={app.id} app={app} onOpen={() => openApp(app.id)} />
        ))}
        {/* User-created app tiles */}
        {(userApps || []).map((app) => (
          <DesktopIcon
            key={`userapp_${app.id}`}
            app={{ id: `userapp_${app.id}`, name: app.name, icon: app.icon }}
            emoji
            onOpen={() => openApp(`userapp_${app.id}`, { appId: app.id, appName: app.name, appIcon: app.icon })}
          />
        ))}
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={closeMenu}
            onOpenApp={openApp}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DesktopIcon({ app, onOpen, emoji }) {
  const color = app.color || {};
  const iconBg = color.bg || 'rgba(255,255,255,0.07)';
  const iconBorder = color.border || 'rgba(255,255,255,0.12)';
  const iconColor = color.icon || 'rgba(200,198,220,0.8)';

  return (
    <motion.button
      whileHover={{ scale: 1.1, y: -3 }}
      whileTap={{ scale: 0.95 }}
      onDoubleClick={onOpen}
      onClick={onOpen}
      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-white/4 transition-colors group"
      title={app.name}
    >
      <div
        className="w-13 h-13 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105"
        style={{
          background: iconBg,
          border: `1px solid ${iconBorder}`,
          boxShadow: `0 4px 16px ${iconBg}, inset 0 1px 0 rgba(255,255,255,0.12)`,
          color: iconColor,
          width: 52,
          height: 52,
        }}
      >
        {emoji ? (
          <span className="text-2xl leading-none">{app.icon}</span>
        ) : (
          <span className="w-5 h-5 block [&>svg]:w-full [&>svg]:h-full">{app.icon}</span>
        )}
      </div>
      <span className="text-white/75 text-[11px] font-medium tracking-wide drop-shadow max-w-[60px] truncate">{app.name}</span>
    </motion.button>
  );
}

function ContextMenu({ x, y, onClose, onOpenApp }) {
  const items = [
    { label: 'Open App Launcher', action: () => onOpenApp('launcher') },
    null,
    ...APP_REGISTRY.map((a) => ({ label: `Open ${a.name}`, action: () => onOpenApp(a.id) })),
  ];

  // Keep menu in viewport
  const left = Math.min(x, window.innerWidth - 220);
  const top = Math.min(y, window.innerHeight - items.length * 36 - 60);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[1000] glass-dark rounded-xl overflow-hidden py-1 min-w-[200px]"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={i} className="h-px bg-white/10 mx-3 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            className="w-full text-left px-4 py-2 text-sm text-white/85 hover:bg-white/10 transition-colors"
          >
            {item.label}
          </button>
        )
      )}
    </motion.div>
  );
}
