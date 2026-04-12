import React from 'react';
import { motion } from 'framer-motion';
import tokens from './tokens';

/**
 * Reusable glassmorphism panel component.
 * Accepts className, style, and all standard div props.
 */
export const Glass = React.forwardRef(function Glass(
  { children, className = '', style = {}, glow = false, dark = false, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={`${dark ? 'glass-dark' : 'glass'} ${className}`}
      style={{
        borderRadius: tokens.radius.lg,
        ...(glow ? { boxShadow: tokens.shadow.glow } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
});

/**
 * Animated glass panel — wraps Glass with Framer Motion.
 */
export const AnimatedGlass = React.forwardRef(function AnimatedGlass(
  { children, className = '', style = {}, glow = false, dark = false, ...props },
  ref
) {
  return (
    <motion.div
      ref={ref}
      className={`${dark ? 'glass-dark' : 'glass'} ${className}`}
      style={{
        borderRadius: tokens.radius.lg,
        ...(glow ? { boxShadow: tokens.shadow.glow } : {}),
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.div>
  );
});

export default Glass;
