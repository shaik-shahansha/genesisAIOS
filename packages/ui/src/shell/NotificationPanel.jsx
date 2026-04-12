import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOS } from '../App';
import { panelSlideRight } from '../design/animations';

export default function NotificationPanel() {
  const { notifications, setNotifOpen } = useOS();

  return (
    <motion.div
      variants={panelSlideRight}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="absolute right-4 bottom-20 z-[150] glass-dark rounded-2xl overflow-hidden shadow-glass-lg"
      style={{ width: 340, maxHeight: 'calc(100vh - 120px)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
        <span className="text-white/90 font-semibold text-sm">Notifications</span>
        <button
          onClick={() => setNotifOpen(false)}
          className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {notifications.length === 0 ? (
          <div className="p-6 text-white/30 text-sm text-center">No notifications</div>
        ) : (
          <div className="p-2 flex flex-col gap-1">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="p-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <p className="text-white/85 text-sm leading-relaxed">{n.text}</p>
                <p className="text-white/30 text-xs mt-1">
                  {n.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
