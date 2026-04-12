import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Modern minimal splash screen.
 * Phase 0 — instant: deep background + ambient glow fade in
 * Phase 1 — wordmark "GENESIS" fades in with backdrop
 * Phase 2 — sub-text "OPERATING SYSTEM" appears below
 * Phase 3 — everything fades out
 * Phase 4 — done
 */
export default function SplashScreen({ onDone }) {
  const [phase, setPhase] = useState(0);

  const playChime = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const play = (freq, time, duration, gainValue) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(gainValue, time + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.start(time);
        osc.stop(time + duration);
      };

      const time = ctx.currentTime + 0.05;
      play(261.6, time, 1.8, 0.10);
      play(329.6, time + 0.12, 1.6, 0.08);
      play(392.0, time + 0.24, 2.2, 0.07);
      play(523.2, time + 0.36, 2.5, 0.06);
    } catch {
      // Audio can be blocked by autoplay policy; ignore gracefully.
    }
  };

  useEffect(() => {
    const timers = [];
    timers.push(setTimeout(() => {
      setPhase(1);
      playChime();
    }, 200));
    timers.push(setTimeout(() => setPhase(2), 1100));
    timers.push(setTimeout(() => setPhase(3), 3000));
    timers.push(setTimeout(() => {
      setPhase(4);
      onDone?.();
    }, 3800));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  if (phase === 4) return null;

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: phase === 3 ? 0 : 1 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none"
      style={{ background: '#050508' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.8 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
        className="absolute pointer-events-none"
        style={{
          width: '70vw',
          height: '70vw',
          maxWidth: 800,
          maxHeight: 800,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, rgba(99,102,241,0.04) 45%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 75%)',
        }}
      />

      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            key="wordmark"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center gap-3"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="mb-2"
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
                  boxShadow: '0 0 32px rgba(99,102,241,0.5), 0 0 64px rgba(99,102,241,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="rgba(255,255,255,0.95)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M2 17l10 5 10-5" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M2 12l10 5 10-5" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
            </motion.div>

            <div
              style={{
                fontFamily: "'Inter var', 'Inter', -apple-system, sans-serif",
                fontSize: 'clamp(2.8rem, 8vw, 5.5rem)',
                fontWeight: 300,
                letterSpacing: '0.22em',
                color: 'rgba(240,240,255,0.95)',
                lineHeight: 1,
              }}
            >
              GENESIS
            </div>

            <AnimatePresence>
              {phase >= 2 && (
                <motion.div
                  key="sub"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    fontFamily: "'Inter var', 'Inter', -apple-system, sans-serif",
                    fontSize: 'clamp(0.6rem, 1.5vw, 0.75rem)',
                    fontWeight: 500,
                    letterSpacing: '0.4em',
                    color: 'rgba(99,102,241,0.9)',
                    textTransform: 'uppercase',
                  }}
                >
                  AI NATIVE OPERATING SYSTEM
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {phase >= 2 && phase < 3 && (
          <motion.div
            key="bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute bottom-16"
            style={{ width: 120 }}
          >
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 1, overflow: 'hidden' }}>
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
                style={{ height: '100%', background: 'linear-gradient(90deg, #6366F1, #818cf8)', borderRadius: 1 }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
