import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOS } from '../App';
import { orbIdle, orbListening, orbThinking } from '../design/animations';
import ChatPanel from '../components/ChatPanel';

// ---  AIOrb —— the animated AI assistant icon
export default function AIOrb() {
  const { orbState, setOrbState } = useOS();
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      {/* Orb button */}
      <motion.button
        className="pointer-events-auto fixed bottom-4 right-4 z-[300] w-12 h-12 rounded-full flex items-center justify-center outline-none focus:outline-none"
        style={{
          background: 'radial-gradient(circle at 35% 35%, #9F67FF, #7C3AED 60%, #4C1D95)',
        }}
        whileHover={{ scale: 1.12 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setChatOpen((v) => !v)}
        title="Genesis AI (click to chat)"
        animate={
          orbState === 'thinking'
            ? {}
            : orbState === 'listening'
            ? {}
            : {
                boxShadow: [
                  '0 0 18px rgba(124,58,237,0.6)',
                  '0 0 36px rgba(124,58,237,0.9)',
                  '0 0 18px rgba(124,58,237,0.6)',
                ],
              }
        }
        transition={
          orbState === 'idle'
            ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
            : {}
        }
      >
        <OrbInner state={orbState} />
      </motion.button>

      {/* Chat panel  */}
      <AnimatePresence>
        {chatOpen && (
          <ChatPanel
            onClose={() => setChatOpen(false)}
            onStateChange={setOrbState}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function OrbInner({ state }) {
  if (state === 'thinking') {
    return (
      <motion.div
        className="w-6 h-6 rounded-full border-2 border-white border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
      />
    );
  }
  if (state === 'listening') {
    return (
      <div className="flex items-end gap-0.5 h-5">
        {[1,2,3,4,3,2,1].map((h, i) => (
          <motion.div
            key={i}
            className="w-0.5 rounded-full bg-white"
            animate={{ height: [h * 3, h * 7, h * 3] }}
            transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.06, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }
  if (state === 'speaking') {
    return (
      <div className="flex items-end gap-0.5 h-5">
        {[2,4,6,4,2,4,6].map((h, i) => (
          <motion.div
            key={i}
            className="w-0.5 rounded-full bg-white"
            animate={{ height: [h, h * 2.5, h] }}
            transition={{ duration: 0.35, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
          />
        ))}
      </div>
    );
  }
  // idle
  return (
    <span className="text-white text-lg select-none">✦</span>
  );
}
