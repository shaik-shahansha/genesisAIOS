/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  safelist: ['text-9xl'],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: '#6366F1',
          light: '#818CF8',
          dark: '#4338CA',
          glow: 'rgba(99,102,241,0.35)',
        },
        surface: {
          DEFAULT: 'rgba(255,255,255,0.042)',
          hover: 'rgba(255,255,255,0.07)',
          active: 'rgba(255,255,255,0.1)',
          border: 'rgba(255,255,255,0.075)',
          border2: 'rgba(99,102,241,0.4)',
        },
        base: {
          DEFAULT: '#08080f',
          100: '#0d0d16',
          200: '#111119',
          300: '#16161f',
          400: '#1c1c28',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      fontFamily: {
        sans: ['Inter', 'Inter var', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glass: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)',
        'glass-lg': '0 16px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        glow: '0 0 20px rgba(99,102,241,0.45)',
        'glow-sm': '0 0 10px rgba(99,102,241,0.35)',
        'glow-lg': '0 0 40px rgba(99,102,241,0.55)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-gentle': 'bounce 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
