// Design tokens — single source of truth for colours, blur, spacing, animations
export const tokens = {
  colors: {
    accent: '#6366F1',
    accentLight: '#818CF8',
    accentDark: '#4338CA',
    accentGlow: 'rgba(99,102,241,0.35)',
    base: '#08080f',
    base100: '#0d0d16',
    base200: '#111119',
    base300: '#16161f',
    text: 'rgba(240,239,248,0.95)',
    textMuted: 'rgba(200,198,220,0.55)',
    textDim: 'rgba(200,198,220,0.3)',
    glassBg: 'rgba(255,255,255,0.042)',
    glassBorder: 'rgba(255,255,255,0.075)',
    glassBorderAccent: 'rgba(99,102,241,0.4)',
  },
  blur: {
    sm: 'blur(8px)',
    md: 'blur(20px)',
    lg: 'blur(32px)',
    xl: 'blur(48px)',
  },
  shadow: {
    glass: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
    glassLg: '0 24px 64px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)',
    glow: '0 0 20px rgba(124,58,237,0.5)',
    glowLg: '0 0 40px rgba(124,58,237,0.6)',
    window: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08)',
  },
  animation: {
    fast: 0.15,
    normal: 0.25,
    slow: 0.4,
    spring: { type: 'spring', stiffness: 400, damping: 30 },
    springSmooth: { type: 'spring', stiffness: 200, damping: 25 },
    easeOut: [0.0, 0.0, 0.2, 1],
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    window: '16px',
  },
};

export default tokens;
