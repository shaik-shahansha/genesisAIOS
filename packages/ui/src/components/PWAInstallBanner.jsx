import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * PWAInstallBanner
 *
 * Shows a polished install prompt when the browser fires `beforeinstallprompt`.
 * Also shows a persistent "installed" toast once the PWA is installed.
 *
 * On iOS (which doesn't fire beforeinstallprompt) we show a manual share-sheet guide.
 */

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function isInStandaloneMode() {
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow]                     = useState(false);
  const [iosGuide, setIosGuide]             = useState(false);
  const [installed, setInstalled]           = useState(false);
  const [dismissed, setDismissed]           = useState(false);

  useEffect(() => {
    // Don't show if already running as installed PWA
    if (isInStandaloneMode()) return;
    // Don't show if user dismissed this session
    if (sessionStorage.getItem('pwa_banner_dismissed')) return;

    if (isIOS()) {
      // Show iOS manual guide after a short delay
      const t = setTimeout(() => setIosGuide(true), 3000);
      return () => clearTimeout(t);
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setShow(false);
      setIosGuide(false);
      setInstalled(true);
      setTimeout(() => setInstalled(false), 4000);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShow(false);
    if (outcome === 'dismissed') {
      sessionStorage.setItem('pwa_banner_dismissed', '1');
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShow(false);
    setIosGuide(false);
    setDismissed(true);
    sessionStorage.setItem('pwa_banner_dismissed', '1');
  }, []);

  return (
    <>
      {/* ── Install prompt banner ── */}
      {/* Static centering wrapper — Framer Motion must not own the transform */}
      <AnimatePresence>
        {show && !dismissed && (
          <div
            style={{
              position: 'fixed',
              bottom: '90px',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
          <motion.div
            key="install-banner"
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              width: 'min(440px, calc(100vw - 32px))',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                background: 'rgba(15, 10, 30, 0.92)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(124, 58, 237, 0.45)',
                borderRadius: '20px',
                padding: '20px 22px',
                boxShadow: '0 8px 40px rgba(124, 58, 237, 0.3), 0 2px 12px rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              {/* Icon */}
              <img
                src="/icons/icon-96.png"
                alt="Genesis OS"
                style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0 }}
              />

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, marginBottom: 3 }}>
                  Install Genesis OS
                </div>
                <div style={{ color: 'rgba(200,185,255,0.75)', fontSize: 12.5, lineHeight: 1.4 }}>
                  Add to your home screen for a full-screen OS experience
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={handleInstall}
                  style={{
                    background: 'linear-gradient(135deg, #7C3AED, #6d28d9)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 18px',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 12px rgba(124,58,237,0.5)',
                  }}
                >
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  style={{
                    background: 'transparent',
                    color: 'rgba(180,160,255,0.6)',
                    border: 'none',
                    borderRadius: 10,
                    padding: '4px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Not now
                </button>
              </div>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── iOS manual guide ── */}
      <AnimatePresence>
        {iosGuide && !dismissed && (
          <div
            style={{
              position: 'fixed',
              bottom: '90px',
              left: 0,
              right: 0,
              display: 'flex',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 9999,
            }}
          >
          <motion.div
            key="ios-guide"
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              width: 'min(440px, calc(100vw - 32px))',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                background: 'rgba(15, 10, 30, 0.92)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(124, 58, 237, 0.45)',
                borderRadius: '20px',
                padding: '20px 22px',
                boxShadow: '0 8px 40px rgba(124, 58, 237, 0.3), 0 2px 12px rgba(0,0,0,0.6)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <img src="/icons/icon-96.png" alt="" style={{ width: 44, height: 44, borderRadius: 12 }} />
                <div>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Install Genesis OS</div>
                  <div style={{ color: 'rgba(200,185,255,0.65)', fontSize: 12 }}>Add to Home Screen</div>
                </div>
                <button
                  onClick={handleDismiss}
                  style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'rgba(180,160,255,0.5)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <ol style={{ paddingLeft: 18, color: 'rgba(220,210,255,0.8)', fontSize: 13, lineHeight: 1.9 }}>
                <li>Tap the <strong style={{ color: '#a78bfa' }}>Share</strong> button <span style={{ fontSize: 15 }}>⬆</span> in Safari</li>
                <li>Scroll down and tap <strong style={{ color: '#a78bfa' }}>Add to Home Screen</strong></li>
                <li>Tap <strong style={{ color: '#a78bfa' }}>Add</strong> — done!</li>
              </ol>
            </div>
          </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Installed success toast ── */}
      <AnimatePresence>
        {installed && (
          <motion.div
            key="installed-toast"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            style={{
              position: 'fixed',
              top: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'rgba(15, 10, 30, 0.92)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(124, 58, 237, 0.5)',
              borderRadius: 14,
              padding: '12px 22px',
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 4px 24px rgba(124,58,237,0.4)',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 18 }}>✓</span>
            Genesis OS installed — open from your home screen
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
