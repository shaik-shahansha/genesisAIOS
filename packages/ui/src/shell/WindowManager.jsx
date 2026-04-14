import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOS } from '../App';
import { APP_REGISTRY, resolveApp } from '../apps/registry';
import { windowVariants } from '../design/animations';
import tokens from '../design/tokens';

const MIN_W = 320;
const MIN_H = 240;
const DEFAULT_W = 720;
const DEFAULT_H = 500;

// Stagger initial positions so windows don't overlap
function getInitialPos(index) {
  return { x: 80 + index * 30, y: 60 + index * 30 };
}

export default function WindowManager() {
  const { windows, activeId, focusWindow, closeWindow, minimizeWindow, openApp } = useOS();
  const [positions, setPositions] = useState({});
  const [sizes, setSizes] = useState({});
  const [maximized, setMaximized] = useState({});

  const updatePos = useCallback((id, pos) => {
    setPositions((prev) => ({ ...prev, [id]: pos }));
  }, []);

  const updateSize = useCallback((id, size) => {
    setSizes((prev) => ({ ...prev, [id]: size }));
  }, []);

  const toggleMaximize = useCallback((id) => {
    setMaximized((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <AnimatePresence>
        {windows.map((w, index) => {
            const pos = positions[w.id] || getInitialPos(index);
            const size = sizes[w.id] || { w: DEFAULT_W, h: DEFAULT_H };
            const isMax = maximized[w.id];

            return (
              <Window
                key={w.id}
                win={w}
                pos={isMax ? { x: 0, y: 0 } : pos}
                size={isMax ? { w: window.innerWidth, h: window.innerHeight - 68 } : size}
                isActive={w.id === activeId}
                isMaximized={isMax}
                isMinimized={!!w.minimized}
                onFocus={() => focusWindow(w.id)}
                onClose={() => closeWindow(w.id)}
                onMinimize={() => minimizeWindow(w.id)}
                onMaximize={() => toggleMaximize(w.id)}
                onMove={(p) => updatePos(w.id, p)}
                onResize={(s) => updateSize(w.id, s)}
                openApp={openApp}
              />
            );
          })}
      </AnimatePresence>
    </div>
  );
}

function Window({ win, pos, size, isActive, isMaximized, isMinimized, onFocus, onClose, onMinimize, onMaximize, onMove, onResize, openApp }) {
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);

  const appDef = resolveApp(win.appId);
  const AppComponent = React.lazy(() => {
    if (!appDef) return Promise.resolve({ default: () => <div className="p-4 text-white/50">App not found</div> });
    return appDef.component();
  });

  const handleMouseDown = (e) => {
    if (isMaximized) return;
    if (e.target.closest('[data-no-drag]')) return;
    setIsDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: pos.x, oy: pos.y };
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || !dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    onMove({
      x: Math.max(0, dragStart.current.ox + dx),
      y: Math.max(0, dragStart.current.oy + dy),
    });
  }, [isDragging, onMove]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <motion.div
      variants={windowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
        zIndex: isActive ? 100 : 50,
        pointerEvents: isMinimized ? 'none' : 'all',
        visibility: isMinimized ? 'hidden' : 'visible',
        borderRadius: isMaximized ? 0 : tokens.radius.window,
        overflow: 'hidden',
        boxShadow: isActive ? tokens.shadow.window : '0 18px 56px rgba(0,0,0,0.46)',
        border: `1px solid ${isActive ? tokens.colors.glassBorderAccent : tokens.colors.glassBorder}`,
        background: 'linear-gradient(180deg, rgba(20,20,28,0.92) 0%, rgba(10,10,16,0.9) 100%)',
        backdropFilter: 'blur(34px) saturate(180%)',
        WebkitBackdropFilter: 'blur(34px) saturate(180%)',
        transition: isMaximized ? 'all 0.25s ease' : undefined,
      }}
      onMouseDown={onFocus}
    >
      {/* Title bar */}
      <div
        className="window-drag flex items-center h-11 px-3 gap-2 border-b border-white/8 no-select"
        onMouseDown={handleMouseDown}
        onDoubleClick={onMaximize}
        style={{
          background: isActive
            ? 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.005) 100%)',
        }}
      >
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5" data-no-drag>
          <button
            onClick={onClose}
            className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors shadow-sm"
            title="Close"
          />
          <button
            onClick={onMinimize}
            className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors shadow-sm"
            title="Minimize"
          />
          <button
            onClick={onMaximize}
            className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors shadow-sm"
            title={isMaximized ? 'Restore' : 'Maximize'}
          />
        </div>

        {/* Title */}
        <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
          {win.icon && (
            <span style={{ width: 14, height: 14, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: 0.65 }}
              className="[&>svg]:w-full [&>svg]:h-full">
              {win.icon}
            </span>
          )}
          <span className="text-white/70 text-xs font-medium truncate">{win.title}</span>
        </div>
      </div>

      {/* App content */}
      <div className="w-full overflow-hidden" style={{ height: `calc(100% - 44px)` }}>
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              Loading…
            </div>
          }
        >
          <AppComponent {...win.props} winId={win.id} openApp={openApp} />
        </React.Suspense>
      </div>

      {/* Resize handle */}
      {!isMaximized && (
        <ResizeHandle size={size} pos={pos} onResize={onResize} />
      )}
    </motion.div>
  );
}

function ResizeHandle({ size, pos, onResize }) {
  const start = useRef(null);

  const onMouseDown = (e) => {
    e.stopPropagation();
    start.current = { mx: e.clientX, my: e.clientY, w: size.w, h: size.h };
    const onMove = (ev) => {
      if (!start.current) return;
      onResize({
        w: Math.max(MIN_W, start.current.w + ev.clientX - start.current.mx),
        h: Math.max(MIN_H, start.current.h + ev.clientY - start.current.my),
      });
    };
    const onUp = () => {
      start.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-40 hover:opacity-80 transition-opacity"
      onMouseDown={onMouseDown}
      data-no-drag
      style={{
        background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.3) 50%)',
        borderBottomRightRadius: tokens.radius.window,
      }}
    />
  );
}
