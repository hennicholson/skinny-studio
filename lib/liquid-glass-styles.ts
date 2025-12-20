// Apple-inspired Liquid Glass Design System
// Ported from ULTRA reference project for Skinny Studio Storyboard Mode

import { CSSProperties } from 'react'

// Primary accent color (matches skinny-yellow)
export const ACCENT_COLOR = '#D6FC51'
export const ACCENT_RGB = '214, 252, 81'

// Base glass effect with enhanced blur and gradient
export const glassBase: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.01)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: `
    0 8px 32px 0 rgba(0, 0, 0, 0.37),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.2),
    inset 0 2px 4px 0 rgba(255, 255, 255, 0.1)
  `.trim().replace(/\s+/g, ' '),
  position: 'relative',
  overflow: 'hidden',
}

// Enhanced glass card with gradient border
export const glassCard: CSSProperties = {
  background: `
    linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.05) 0%,
      rgba(255, 255, 255, 0.01) 100%
    )
  `.trim().replace(/\s+/g, ' '),
  backdropFilter: 'blur(40px) saturate(200%)',
  WebkitBackdropFilter: 'blur(40px) saturate(200%)',
  borderRadius: '20px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: `
    0 20px 80px -20px rgba(0, 0, 0, 0.5),
    0 10px 40px -10px rgba(0, 0, 0, 0.3),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)
  `.trim().replace(/\s+/g, ' '),
  position: 'relative',
  overflow: 'hidden',
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
}

// Liquid button with animated gradient
export const liquidButton: CSSProperties = {
  background: `
    linear-gradient(
      135deg,
      rgba(${ACCENT_RGB}, 0.9) 0%,
      rgba(${ACCENT_RGB}, 0.7) 100%
    )
  `.trim().replace(/\s+/g, ' '),
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: '16px',
  border: 'none',
  padding: '12px 24px',
  color: '#000000',
  fontWeight: 600,
  fontSize: '0.9rem',
  letterSpacing: '0.02em',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: `
    0 4px 20px 0 rgba(${ACCENT_RGB}, 0.4),
    inset 0 0 20px rgba(255, 255, 255, 0.2),
    inset 0 2px 4px rgba(255, 255, 255, 0.3)
  `.trim().replace(/\s+/g, ' '),
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  transform: 'translateZ(0)',
}

// Subtle glass button
export const glassButton: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.05)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  padding: '10px 20px',
  color: '#FFFFFF',
  fontWeight: 500,
  fontSize: '0.875rem',
  cursor: 'pointer',
  position: 'relative',
  overflow: 'hidden',
  boxShadow: `
    0 2px 8px 0 rgba(0, 0, 0, 0.2),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)
  `.trim().replace(/\s+/g, ' '),
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
}

// Input field with glass effect
export const glassInput: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.03)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  borderRadius: '12px',
  padding: '14px 18px',
  color: '#FFFFFF',
  fontSize: '0.925rem',
  outline: 'none',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  boxShadow: `
    inset 0 2px 4px 0 rgba(0, 0, 0, 0.2),
    inset 0 0 0 0.5px rgba(255, 255, 255, 0.1)
  `.trim().replace(/\s+/g, ' '),
}

// Modal overlay with enhanced blur
export const modalOverlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

// Panel styles for collapsible sidebars
export const glassPanel: CSSProperties = {
  background: 'rgba(18, 18, 18, 0.8)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.3)',
}

// Hover state styles
export const hoverEffects = {
  glassCard: {
    transform: 'translateY(-2px) scale(1.01)',
    boxShadow: `
      0 30px 100px -30px rgba(0, 0, 0, 0.6),
      0 15px 50px -15px rgba(0, 0, 0, 0.4),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.3)
    `.trim().replace(/\s+/g, ' '),
  },
  liquidButton: {
    transform: 'translateY(-2px) scale(1.05)',
    background: `
      linear-gradient(
        135deg,
        rgba(${ACCENT_RGB}, 1) 0%,
        rgba(${ACCENT_RGB}, 0.8) 100%
      )
    `.trim().replace(/\s+/g, ' '),
    boxShadow: `
      0 8px 30px 0 rgba(${ACCENT_RGB}, 0.6),
      inset 0 0 30px rgba(255, 255, 255, 0.3),
      inset 0 2px 6px rgba(255, 255, 255, 0.4)
    `.trim().replace(/\s+/g, ' '),
  },
  glassButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    transform: 'translateY(-1px)',
  },
  glassInput: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid rgba(${ACCENT_RGB}, 0.3)`,
    boxShadow: `
      0 0 20px 0 rgba(${ACCENT_RGB}, 0.2),
      inset 0 2px 4px 0 rgba(0, 0, 0, 0.2),
      inset 0 0 0 0.5px rgba(255, 255, 255, 0.2)
    `.trim().replace(/\s+/g, ' '),
  },
}

// Glow effects
export const glowEffects = {
  accent: {
    boxShadow: `
      0 0 20px rgba(${ACCENT_RGB}, 0.5),
      0 0 40px rgba(${ACCENT_RGB}, 0.3),
      0 0 60px rgba(${ACCENT_RGB}, 0.1)
    `.trim().replace(/\s+/g, ' '),
  },
  white: {
    boxShadow: `
      0 0 20px rgba(255, 255, 255, 0.3),
      0 0 40px rgba(255, 255, 255, 0.2),
      0 0 60px rgba(255, 255, 255, 0.1)
    `.trim().replace(/\s+/g, ' '),
  },
  subtle: {
    boxShadow: `0 0 15px rgba(${ACCENT_RGB}, 0.3)`,
  },
}

// Status indicator colors
export const statusColors = {
  pending: {
    bg: 'rgba(255, 255, 255, 0.05)',
    border: 'rgba(255, 255, 255, 0.1)',
    text: '#9ca3af',
  },
  generating: {
    bg: `rgba(${ACCENT_RGB}, 0.1)`,
    border: `rgba(${ACCENT_RGB}, 0.3)`,
    text: ACCENT_COLOR,
  },
  completed: {
    bg: 'rgba(34, 197, 94, 0.1)',
    border: 'rgba(34, 197, 94, 0.3)',
    text: '#22c55e',
  },
  error: {
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#ef4444',
  },
}

// Tailwind class strings for common patterns
export const glassClasses = {
  // Base glass panel
  panel: 'bg-zinc-900/80 backdrop-blur-xl border border-white/5 shadow-lg',

  // Glass card with hover
  card: 'bg-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-300 hover:scale-[1.01] hover:shadow-3xl',

  // Subtle card
  cardSubtle: 'bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-xl',

  // Primary button
  buttonPrimary: 'bg-gradient-to-br from-skinny-yellow/90 to-skinny-yellow/70 text-black font-semibold rounded-xl shadow-lg shadow-skinny-yellow/30 hover:shadow-skinny-yellow/50 hover:scale-105 transition-all duration-300',

  // Ghost button
  buttonGhost: 'bg-white/5 backdrop-blur-sm border border-white/10 text-white rounded-xl hover:bg-white/10 hover:border-white/20 transition-all duration-300',

  // Input field
  input: 'bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:border-skinny-yellow/30 focus:ring-1 focus:ring-skinny-yellow/20 transition-all duration-300',

  // Modal overlay
  overlay: 'bg-black/40 backdrop-blur-xl',

  // Active/selected state
  active: 'bg-skinny-yellow/10 border-skinny-yellow/30',

  // Segmented control
  segmentedControl: 'bg-zinc-800/80 backdrop-blur-md border border-white/10 rounded-xl p-1',
  segmentedItem: 'rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
  segmentedItemActive: 'bg-skinny-yellow text-black shadow-lg shadow-skinny-yellow/30',
  segmentedItemInactive: 'text-zinc-400 hover:text-white hover:bg-white/5',
}

// CSS animations as a string (can be injected into global styles)
export const glassAnimations = `
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes gradientShift {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%) rotate(45deg);
    }
    100% {
      transform: translateX(100%) rotate(45deg);
    }
  }

  @keyframes pulse-glow {
    0%, 100% {
      box-shadow: 0 0 20px rgba(214, 252, 81, 0.3);
    }
    50% {
      box-shadow: 0 0 30px rgba(214, 252, 81, 0.5);
    }
  }

  @keyframes liquidFlow {
    0% {
      transform: translateY(0) rotateX(0) rotateY(0);
    }
    33% {
      transform: translateY(-2px) rotateX(1deg) rotateY(1deg);
    }
    66% {
      transform: translateY(1px) rotateX(-1deg) rotateY(-1deg);
    }
    100% {
      transform: translateY(0) rotateX(0) rotateY(0);
    }
  }

  .glass-shimmer::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      45deg,
      transparent 30%,
      rgba(255, 255, 255, 0.05) 50%,
      transparent 70%
    );
    transform: rotate(45deg);
    animation: shimmer 4s infinite;
    pointer-events: none;
  }

  .animate-fadeIn {
    animation: fadeIn 0.3s ease-out;
  }

  .animate-slideUp {
    animation: slideUp 0.3s ease-out;
  }

  .animate-slideIn {
    animation: slideIn 0.3s ease-out;
  }

  .animate-pulse-glow {
    animation: pulse-glow 2s ease-in-out infinite;
  }
`

// Helper to merge CSS properties
export function mergeStyles(...styles: (CSSProperties | undefined)[]): CSSProperties {
  return styles.reduce<CSSProperties>((acc, style) => ({ ...acc, ...style }), {})
}

// Helper to create inline glass card style
export function createGlassCardStyle(options?: {
  glow?: boolean
  hover?: boolean
  borderRadius?: string
}): CSSProperties {
  const { glow = false, borderRadius = '20px' } = options || {}

  return mergeStyles(
    glassCard,
    { borderRadius },
    glow ? glowEffects.accent : undefined
  )
}

// Helper for shot card styling based on status
export function getShotCardStyle(status: 'pending' | 'generating' | 'completed' | 'error'): CSSProperties {
  const colors = statusColors[status]

  return {
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: '16px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  }
}
