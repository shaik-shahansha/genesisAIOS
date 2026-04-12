import tokens from './tokens';

export const windowVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 20 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { ...tokens.animation.spring, duration: tokens.animation.normal },
  },
  exit: {
    opacity: 0, scale: 0.94, y: 10,
    transition: { duration: tokens.animation.fast },
  },
};

export const panelSlideRight = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { ...tokens.animation.spring } },
  exit: { opacity: 0, x: 40, transition: { duration: tokens.animation.fast } },
};

export const panelSlideUp = {
  hidden: { opacity: 0, y: 60 },
  visible: { opacity: 1, y: 0, transition: { ...tokens.animation.spring } },
  exit: { opacity: 0, y: 60, transition: { duration: tokens.animation.fast } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: tokens.animation.normal } },
  exit: { opacity: 0, transition: { duration: tokens.animation.fast } },
};

export const orbIdle = {
  animate: {
    scale: [1, 1.07, 1],
    boxShadow: [
      '0 0 18px rgba(124,58,237,0.5)',
      '0 0 36px rgba(124,58,237,0.8)',
      '0 0 18px rgba(124,58,237,0.5)',
    ],
    transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const orbListening = {
  animate: {
    scale: [1, 1.15, 1],
    transition: { duration: 0.6, repeat: Infinity, ease: 'easeInOut' },
  },
};

export const orbThinking = {
  animate: {
    rotate: 360,
    transition: { duration: 1.5, repeat: Infinity, ease: 'linear' },
  },
};

export const dockIconHover = {
  rest: { y: 0, scale: 1 },
  hover: { y: -8, scale: 1.2, transition: tokens.animation.spring },
};

export const stagger = {
  visible: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};
