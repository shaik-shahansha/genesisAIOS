import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import Desktop from './shell/Desktop';
import Taskbar from './shell/Taskbar';
import WindowManager from './shell/WindowManager';
import AppLauncher from './shell/AppLauncher';
import NotificationPanel from './shell/NotificationPanel';
import AIOrb from './shell/AIOrb';
import SplashScreen from './shell/SplashScreen';
import LockScreen from './components/LockScreen';
import { APP_REGISTRY, resolveApp } from './apps/registry';

// ─── OS Context ────────────────────────────────────────────────────────────────
export const OSContext = createContext(null);
export const useOS = () => useContext(OSContext);

let _windowId = 1;

export default function App() {
  const [windows, setWindows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [orbState, setOrbState] = useState('idle'); // idle | listening | thinking | speaking
  const [splashDone, setSplashDone] = useState(false);
  const [authState, setAuthState] = useState({ checked: false, passwordSet: false, authenticated: true });
  const [desktopFullscreen, setDesktopFullscreen] = useState(Boolean(document.fullscreenElement));
  // Created mini-apps loaded from API for Desktop tiles
  const [userApps, setUserApps] = useState([]);

  useEffect(() => {
    const accent = localStorage.getItem('genesis_accent');
    const wallpaper = localStorage.getItem('genesis_wallpaper_value');
    if (accent) {
      document.documentElement.style.setProperty('--accent', accent);
      document.documentElement.style.setProperty('--accent-glow', `${accent}66`);
    }
    if (wallpaper) {
      document.documentElement.style.setProperty('--wallpaper-bg', wallpaper);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setDesktopFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fetchUserApps = useCallback(async () => {
    try {
      const r = await fetch('/api/apps/list');
      const d = await r.json();
      setUserApps(d.apps || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUserApps();
    window._genesisRefreshApps = fetchUserApps;
    return () => { delete window._genesisRefreshApps; };
  }, [fetchUserApps]);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setAuthState({ checked: true, passwordSet: !!data.passwordSet, authenticated: !!data.authenticated });
    } catch {
      setAuthState({ checked: true, passwordSet: false, authenticated: true });
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const openApp = useCallback((appId, props = {}) => {
    // Support dynamic user-created apps
    const appDef = resolveApp(appId);
    if (!appDef) return;

    // Merge dynamic app metadata from props if available
    const windowTitle = props?.appName || appDef.name;
    const windowIcon = props?.appIcon || appDef.icon;

    // Reuse existing window of same type (unless multi allowed)
    const existing = windows.find((w) => w.appId === appId && !appDef.multi);
    if (existing) {
      setWindows((prev) => prev.map((windowItem) => (
        windowItem.id === existing.id
          ? {
              ...windowItem,
              props,
              title: windowTitle,
              icon: windowIcon,
              minimized: false,
            }
          : windowItem
      )));
      setActiveId(existing.id);
      return;
    }
    const id = _windowId++;
    setWindows((prev) => [...prev, { id, appId, props, title: windowTitle, icon: windowIcon }]);
    setActiveId(id);
    setLauncherOpen(false);
  }, [windows]);

  const closeWindow = useCallback((id) => {
    setWindows((prev) => prev.filter((w) => w.id !== id));
    setActiveId((prev) => (prev === id ? null : prev));
  }, []);

  const focusWindow = useCallback((id) => setActiveId(id), []);

  const minimizeWindow = useCallback((id) => {
    setWindows((prev) => prev.map((w) => w.id === id ? { ...w, minimized: true } : w));
    setActiveId(null);
  }, []);

  const restoreWindow = useCallback((id) => {
    setWindows((prev) => prev.map((w) => w.id === id ? { ...w, minimized: false } : w));
    setActiveId(id);
  }, []);

  const pushNotification = useCallback((msg) => {
    setNotifications((prev) => [{ id: Date.now(), text: msg, ts: new Date() }, ...prev.slice(0, 49)]);
    setNotifOpen(true);
  }, []);

  const toggleDesktopFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }, []);

  const osCtx = {
    windows, activeId, openApp, closeWindow, focusWindow, minimizeWindow, restoreWindow,
    launcherOpen, setLauncherOpen,
    notifOpen, setNotifOpen,
    notifications, pushNotification,
    orbState, setOrbState,
    desktopFullscreen,
    toggleDesktopFullscreen,
    authState,
    refreshAuth,
    userApps,
    fetchUserApps,
  };

  useEffect(() => {
    window._genesisOpenApp = openApp;
    return () => {
      delete window._genesisOpenApp;
    };
  }, [openApp]);

  return (
    <OSContext.Provider value={osCtx}>
      {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
      {authState.checked && authState.passwordSet && !authState.authenticated && (
        <LockScreen onAuthenticated={refreshAuth} />
      )}
      <div
        className="relative w-full h-full overflow-hidden wallpaper select-none"
        style={{ opacity: splashDone ? 1 : 0, transition: 'opacity 0.8s ease' }}
      >
        {/* Persistent G OS watermark — faint brand presence on wallpaper */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ zIndex: 0 }}
        >
          <span
            className="font-black"
            style={{
              fontSize: 'clamp(12rem, 40vw, 38rem)',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.048) 0%, rgba(67,56,202,0.028) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              letterSpacing: '0.08em',
              userSelect: 'none',
            }}
          >
            G OS
          </span>
        </div>

        {/* Background layer */}
        <Desktop />

        {/* Floating windows */}
        <WindowManager />

        {/* App launcher overlay */}
        {launcherOpen && <AppLauncher />}

        {/* Notification panel */}
        {notifOpen && <NotificationPanel />}

        {/* Bottom taskbar */}
        <Taskbar />

        {/* Bottom-left OS branding */}
        <div
          className="absolute bottom-0 left-0 pb-4 pl-4 pointer-events-none select-none z-40"
          style={{ lineHeight: 1 }}
        >
          <span
            className="text-white/22 font-semibold tracking-widest uppercase"
            style={{ fontSize: '10px', letterSpacing: '0.18em' }}
          >
            Genesis AI OS &middot; by Sha
          </span>
        </div>

        {desktopFullscreen && (
          <button
            onClick={toggleDesktopFullscreen}
            className="absolute top-4 right-4 z-[380] px-3 py-1.5 rounded-xl glass-dark text-white/80 text-xs border border-white/10 hover:bg-white/10 transition-colors"
            title="Exit distraction-free fullscreen"
          >
            Exit Full Screen
          </button>
        )}
      </div>
    </OSContext.Provider>
  );
}
