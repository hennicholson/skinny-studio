'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useMotion } from '@/lib/context/motion-context';
import { useUser } from '@/lib/context/user-context';
import {
  VIDEO_TYPES,
  EFFECTS,
  COLOR_THEMES,
  SPEED_OPTIONS,
  EASING_STYLES,
  formatCost,
  formatTokens,
} from '@/lib/motion';
import { toast } from 'sonner';

// ============================================
// Effect Preview Component - Live Mini Animations
// ============================================
function EffectPreview({ effectId, accentColor }: { effectId: string; accentColor: string }) {
  const previews: Record<string, React.ReactNode> = {
    // Text effects
    textReveal: (
      <motion.div className="flex gap-0.5">
        {['S', 'K', 'N'].map((letter, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, repeat: Infinity, repeatDelay: 1.5, duration: 0.3 }}
            style={{ color: accentColor }}
            className="text-xs font-bold"
          >
            {letter}
          </motion.span>
        ))}
      </motion.div>
    ),
    wordReveal: (
      <motion.div className="text-[8px] font-medium" style={{ color: accentColor }}>
        <motion.span animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          HELLO
        </motion.span>
      </motion.div>
    ),
    typewriter: (
      <motion.div className="flex items-center gap-0.5">
        <span className="text-[8px]" style={{ color: accentColor }}>AI</span>
        <motion.span animate={{ opacity: [1, 0] }} transition={{ duration: 0.5, repeat: Infinity }} className="w-0.5 h-2" style={{ backgroundColor: accentColor }} />
      </motion.div>
    ),
    textSplit: (
      <motion.div className="flex gap-1">
        {['A', 'B'].map((l, i) => (
          <motion.span key={i} style={{ color: accentColor }} className="text-xs font-bold"
            animate={{ x: i === 0 ? [-4, 0] : [4, 0], opacity: [0, 1] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
          >{l}</motion.span>
        ))}
      </motion.div>
    ),
    textWave: (
      <div className="flex">
        {['W', 'V'].map((l, i) => (
          <motion.span key={i} style={{ color: accentColor }} className="text-xs font-bold"
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }}
          >{l}</motion.span>
        ))}
      </div>
    ),
    textBounce: (
      <motion.span style={{ color: accentColor }} className="text-xs font-bold"
        animate={{ y: [10, 0], scale: [0.8, 1] }}
        transition={{ type: 'spring', stiffness: 300, damping: 10, repeat: Infinity, repeatDelay: 1 }}
      >B</motion.span>
    ),
    textGlitch: (
      <motion.span style={{ color: accentColor }} className="text-xs font-bold"
        animate={{ x: [-1, 1, 0], opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.1, repeat: Infinity, repeatDelay: 0.5 }}
      >GL</motion.span>
    ),
    textMorph: (
      <motion.span style={{ color: accentColor }} className="text-xs font-bold"
        animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >M</motion.span>
    ),
    textScale: (
      <motion.span style={{ color: accentColor }} className="text-xs font-bold"
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
      >Z</motion.span>
    ),
    textSlide: (
      <motion.span style={{ color: accentColor }} className="text-xs font-bold"
        animate={{ x: [-12, 0], opacity: [0, 1] }}
        transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 1.2 }}
      >SL</motion.span>
    ),
    // Particles
    floatingParticles: (
      <div className="relative w-6 h-6">
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 rounded-full"
            style={{ backgroundColor: accentColor, left: `${25 + i * 15}%`, top: '50%' }}
            animate={{ y: [-3, 3], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.5, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    burstParticles: (
      <div className="relative w-6 h-6 flex items-center justify-center">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
          <motion.div
            key={i}
            className="absolute w-0.5 h-0.5 rounded-full"
            style={{ backgroundColor: accentColor }}
            animate={{
              x: [0, Math.cos(angle * Math.PI / 180) * 8],
              y: [0, Math.sin(angle * Math.PI / 180) * 8],
              opacity: [1, 0],
            }}
            transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.5 }}
          />
        ))}
      </div>
    ),
    sparkles: (
      <div className="relative w-6 h-6">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="absolute w-1 h-1"
            style={{ left: `${20 + i * 25}%`, top: `${30 + i * 15}%` }}
            animate={{ scale: [0, 1, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 1, delay: i * 0.3, repeat: Infinity }}
          >
            <svg width={6} height={6} viewBox="0 0 24 24" fill={accentColor}><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4" stroke={accentColor} /><circle cx="12" cy="12" r="3" /></svg>
          </motion.div>
        ))}
      </div>
    ),
    orbitingParticles: (
      <div className="relative w-6 h-6 flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <motion.div className="absolute w-1 h-1 rounded-full"
          style={{ backgroundColor: accentColor, transformOrigin: '3px 3px', x: 6 }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    ),
    confetti: (
      <div className="relative w-6 h-6">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="absolute w-1 h-1.5 rounded-sm"
            style={{ backgroundColor: i % 2 ? accentColor : `${accentColor}80`, left: '50%', top: '50%' }}
            animate={{ y: [0, -8, 12], x: [(i - 1.5) * 2, (i - 1.5) * 6], rotate: [0, 180], opacity: [1, 1, 0] }}
            transition={{ duration: 1, repeat: Infinity, repeatDelay: 0.5 }}
          />
        ))}
      </div>
    ),
    dataFlow: (
      <div className="flex items-center gap-0.5">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="w-0.5 h-0.5 rounded-full" style={{ backgroundColor: accentColor }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    snowfall: (
      <div className="relative w-6 h-6 overflow-hidden">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="absolute w-1 h-1 rounded-full"
            style={{ backgroundColor: accentColor, left: `${20 + i * 30}%` }}
            animate={{ y: [-2, 10], opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, delay: i * 0.3, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    fireflies: (
      <div className="relative w-6 h-6">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="absolute w-1 h-1 rounded-full"
            style={{ backgroundColor: accentColor, left: `${20 + i * 25}%`, top: `${30 + i * 20}%` }}
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 2, delay: i * 0.5, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    particleTrail: (
      <div className="relative w-6 h-3">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="absolute w-0.5 h-0.5 rounded-full top-1/2"
            style={{ backgroundColor: accentColor }}
            animate={{ x: [0, 20], opacity: [1, 0] }}
            transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    particleGrid: (
      <div className="grid grid-cols-3 gap-0.5">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <motion.div key={i} className="w-0.5 h-0.5 rounded-full"
            style={{ backgroundColor: accentColor }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, delay: i * 0.1, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    // Glows
    glowPulse: (
      <motion.div
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: `${accentColor}40` }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    glowRing: (
      <div className="relative w-6 h-6 flex items-center justify-center">
        <motion.div
          className="absolute w-2 h-2 rounded-full border"
          style={{ borderColor: accentColor }}
          animate={{ scale: [1, 3], opacity: [1, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
    ),
    ambientGlow: (
      <div className="relative w-5 h-5">
        <motion.div className="absolute inset-0 rounded-full" style={{ backgroundColor: accentColor }}
          animate={{ opacity: [0.2, 0.5, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.div className="absolute inset-1 rounded-full" style={{ backgroundColor: `${accentColor}60` }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, delay: 0.5, repeat: Infinity }}
        />
      </div>
    ),
    colorShiftGlow: (
      <motion.div className="w-4 h-4 rounded-full"
        animate={{ backgroundColor: [accentColor, `${accentColor}80`, accentColor] }}
        transition={{ duration: 2, repeat: Infinity }}
        style={{ backgroundColor: accentColor }}
      />
    ),
    neonGlow: (
      <motion.div className="w-4 h-1 rounded-full"
        style={{ backgroundColor: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.3, repeat: Infinity }}
      />
    ),
    spotlightGlow: (
      <motion.div className="w-4 h-4 rounded-full"
        style={{ background: `radial-gradient(circle, ${accentColor} 0%, transparent 70%)` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    auraGlow: (
      <div className="relative w-5 h-5 flex items-center justify-center">
        <motion.div className="absolute w-5 h-5 rounded-full" style={{ backgroundColor: `${accentColor}20` }}
          animate={{ scale: [1, 1.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
      </div>
    ),
    laserGlow: (
      <motion.div className="w-6 h-0.5 rounded-full"
        style={{ backgroundColor: accentColor, boxShadow: `0 0 4px ${accentColor}` }}
        animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    ),
    // Cards
    card3DFlip: (
      <motion.div
        className="w-4 h-5 rounded-sm"
        style={{ backgroundColor: `${accentColor}40`, border: `1px solid ${accentColor}` }}
        animate={{ rotateY: [0, 180, 360] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    staggeredCards: (
      <div className="flex gap-0.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="w-2 h-3 rounded-sm"
            style={{ backgroundColor: `${accentColor}${60 + i * 20}` }}
            animate={{ y: [8, 0], opacity: [0, 1] }}
            transition={{ delay: i * 0.15, duration: 0.4, repeat: Infinity, repeatDelay: 1.5 }}
          />
        ))}
      </div>
    ),
    card3DEntrance: (
      <motion.div className="w-4 h-5 rounded-sm"
        style={{ backgroundColor: `${accentColor}40`, border: `1px solid ${accentColor}` }}
        animate={{ rotateX: [-30, 0], y: [5, 0], opacity: [0, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1 }}
      />
    ),
    depthStack: (
      <div className="relative">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="absolute w-3 h-4 rounded-sm"
            style={{ backgroundColor: `${accentColor}${30 + i * 25}`, left: i * 2, top: i * 2, border: `1px solid ${accentColor}40` }}
            animate={{ y: [0, -2, 0] }}
            transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    cardFan: (
      <div className="relative w-6 h-4">
        {[-15, 0, 15].map((angle, i) => (
          <motion.div key={i} className="absolute w-2 h-3 rounded-sm left-2"
            style={{ backgroundColor: `${accentColor}${50 + i * 20}`, transformOrigin: 'bottom center' }}
            animate={{ rotate: [0, angle] }}
            transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 1.5 }}
          />
        ))}
      </div>
    ),
    cardShuffle: (
      <div className="relative w-4 h-4">
        {[0, 1].map(i => (
          <motion.div key={i} className="absolute w-3 h-4 rounded-sm"
            style={{ backgroundColor: `${accentColor}${60 + i * 30}` }}
            animate={{ x: i === 0 ? [0, 4, 0] : [4, 0, 4] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    parallaxCard: (
      <motion.div className="w-4 h-5 rounded-sm"
        style={{ backgroundColor: `${accentColor}40`, border: `1px solid ${accentColor}` }}
        animate={{ rotateX: [-5, 5, -5], rotateY: [-5, 5, -5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    floatingCard: (
      <motion.div className="w-4 h-5 rounded-sm"
        style={{ backgroundColor: `${accentColor}30`, border: `1px solid ${accentColor}` }}
        animate={{ y: [-2, 2, -2] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    ),
    // Motion
    motionBlur: (
      <motion.div
        className="w-4 h-1 rounded-full"
        style={{ backgroundColor: accentColor }}
        animate={{ x: [-8, 8], scaleX: [1, 1.5, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
      />
    ),
    speedLines: (
      <div className="flex flex-col gap-0.5">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="h-0.5 rounded-full"
            style={{ backgroundColor: accentColor, width: `${8 + i * 4}px` }}
            animate={{ x: [-4, 4], opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.4, delay: i * 0.1, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    zoomBlur: (
      <motion.div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }}
        animate={{ scale: [0.5, 1.5], opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    ),
    liquidMotion: (
      <motion.div className="w-4 h-4"
        style={{ backgroundColor: accentColor, borderRadius: '30% 70% 70% 30% / 30% 30% 70% 70%' }}
        animate={{ borderRadius: ['30% 70% 70% 30% / 30% 30% 70% 70%', '70% 30% 30% 70% / 70% 70% 30% 30%'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    elasticMotion: (
      <motion.div className="w-3 h-3 rounded" style={{ backgroundColor: accentColor }}
        animate={{ scaleX: [1, 1.5, 1], scaleY: [1, 0.7, 1] }}
        transition={{ duration: 0.6, repeat: Infinity }}
      />
    ),
    smoothFollow: (
      <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }}
        animate={{ x: [0, 10, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      />
    ),
    wobble: (
      <motion.div className="w-3 h-3 rounded" style={{ backgroundColor: accentColor }}
        animate={{ rotate: [-5, 5, -5] }}
        transition={{ duration: 0.3, repeat: Infinity }}
      />
    ),
    shake: (
      <motion.div className="w-3 h-3 rounded" style={{ backgroundColor: accentColor }}
        animate={{ x: [-2, 2, -2, 2, 0] }}
        transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 1 }}
      />
    ),
    bounce: (
      <motion.div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
      />
    ),
    swipe: (
      <motion.div className="w-4 h-3 rounded" style={{ backgroundColor: accentColor }}
        animate={{ x: [-10, 10], opacity: [0, 1, 0] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    ),
    // Borders
    gradientBorder: (
      <motion.div
        className="w-5 h-5 rounded"
        style={{
          background: `conic-gradient(from 0deg, ${accentColor}, transparent, ${accentColor})`,
          padding: '1px',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <div className="w-full h-full rounded bg-zinc-950" />
      </motion.div>
    ),
    drawingBorder: (
      <motion.div
        className="w-5 h-5 rounded"
        style={{ border: `1px solid ${accentColor}` }}
        initial={{ pathLength: 0 }}
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    shimmerBorder: (
      <motion.div className="w-5 h-5 rounded relative overflow-hidden"
        style={{ border: `1px solid ${accentColor}40` }}
      >
        <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
          animate={{ x: [-20, 20] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </motion.div>
    ),
    pulseBorder: (
      <motion.div className="w-5 h-5 rounded"
        style={{ border: `1px solid ${accentColor}` }}
        animate={{ borderColor: [`${accentColor}`, `${accentColor}40`, `${accentColor}`] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    ),
    scanlineBorder: (
      <div className="w-5 h-5 rounded relative overflow-hidden" style={{ border: `1px solid ${accentColor}40` }}>
        <motion.div className="absolute inset-x-0 h-0.5" style={{ backgroundColor: accentColor }}
          animate={{ y: [0, 20] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    ),
    dashBorder: (
      <motion.div className="w-5 h-5 rounded"
        style={{ border: `1px dashed ${accentColor}` }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />
    ),
    electricBorder: (
      <motion.div className="w-5 h-5 rounded"
        style={{ border: `1px solid ${accentColor}`, boxShadow: `0 0 4px ${accentColor}` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 0.2, repeat: Infinity }}
      />
    ),
    // Transitions
    fadeTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    slideTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ x: [-8, 0, 0, 8], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    wipeTransition: (
      <div className="relative w-5 h-4 overflow-hidden">
        <motion.div className="absolute inset-0" style={{ backgroundColor: accentColor }}
          animate={{ x: ['-100%', '0%', '0%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    ),
    zoomTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ scale: [0, 1, 1, 2], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    flipTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ rotateY: [0, 180, 360] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    morphTransition: (
      <motion.div className="w-4 h-4" style={{ backgroundColor: accentColor }}
        animate={{ borderRadius: ['0%', '50%', '0%'] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    pixelTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ opacity: [1, 0.5, 0, 0.5, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    ),
    curtainTransition: (
      <div className="relative w-5 h-4 overflow-hidden">
        <motion.div className="absolute inset-0"
          style={{ backgroundColor: accentColor, transformOrigin: 'top' }}
          animate={{ scaleY: [0, 1, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    ),
    circleTransition: (
      <motion.div className="w-4 h-4 rounded-full" style={{ backgroundColor: accentColor }}
        animate={{ scale: [0, 1, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    glitchTransition: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ x: [-2, 2, 0], opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.2, repeat: Infinity }}
      />
    ),
    // UI Elements
    cursorClick: (
      <div className="relative w-6 h-6">
        <motion.div className="absolute" style={{ left: 3, top: 3 }}>
          <svg width={8} height={10} viewBox="0 0 12 16" fill={accentColor}><path d="M0 0v16l4-4h8L0 0z" /></svg>
        </motion.div>
        <motion.div className="absolute w-2 h-2 rounded-full" style={{ backgroundColor: accentColor, left: 4, top: 8 }}
          animate={{ scale: [0, 1, 0], opacity: [1, 0.5, 0] }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
      </div>
    ),
    loadingSpinner: (
      <motion.div className="w-4 h-4 rounded-full border-2"
        style={{ borderColor: `${accentColor}30`, borderTopColor: accentColor }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
    ),
    progressBar: (
      <div className="w-6 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${accentColor}30` }}>
        <motion.div className="h-full rounded-full" style={{ backgroundColor: accentColor }}
          animate={{ width: ['0%', '100%'] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>
    ),
    toggleSwitch: (
      <div className="w-5 h-2.5 rounded-full relative" style={{ backgroundColor: `${accentColor}40` }}>
        <motion.div className="absolute w-2 h-2 rounded-full top-0.5" style={{ backgroundColor: accentColor }}
          animate={{ x: [1, 10, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </div>
    ),
    mockupFloat: (
      <motion.div className="w-4 h-6 rounded-sm" style={{ backgroundColor: `${accentColor}40`, border: `1px solid ${accentColor}` }}
        animate={{ y: [-2, 2, -2] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    screenScroll: (
      <div className="w-4 h-5 rounded-sm overflow-hidden" style={{ border: `1px solid ${accentColor}` }}>
        <motion.div className="w-full" style={{ backgroundColor: `${accentColor}40` }}
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="h-3" />
          <div className="h-3" style={{ backgroundColor: `${accentColor}60` }} />
          <div className="h-3" />
        </motion.div>
      </div>
    ),
    tooltipReveal: (
      <motion.div className="px-1 py-0.5 rounded text-[6px] font-bold"
        style={{ backgroundColor: accentColor, color: '#000' }}
        animate={{ opacity: [0, 1, 1, 0], y: [5, 0, 0, -5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >tip</motion.div>
    ),
    notificationPop: (
      <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
      />
    ),
    dropdown: (
      <div className="w-5">
        <div className="w-full h-1.5 rounded-sm mb-0.5" style={{ backgroundColor: `${accentColor}60` }} />
        <motion.div style={{ backgroundColor: `${accentColor}40` }}
          animate={{ height: [0, 8], opacity: [0, 1] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
          className="w-full rounded-sm"
        />
      </div>
    ),
    accordion: (
      <div className="w-5 space-y-0.5">
        <div className="h-1 rounded-sm" style={{ backgroundColor: `${accentColor}60` }} />
        <motion.div className="rounded-sm" style={{ backgroundColor: `${accentColor}30` }}
          animate={{ height: [0, 4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <div className="h-1 rounded-sm" style={{ backgroundColor: `${accentColor}60` }} />
      </div>
    ),
    // Shapes
    blobMorph: (
      <motion.div className="w-4 h-4" style={{ backgroundColor: accentColor }}
        animate={{ borderRadius: ['30% 70% 70% 30%', '70% 30% 30% 70%', '30% 70% 70% 30%'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    circleExpand: (
      <motion.div className="w-3 h-3 rounded-full" style={{ border: `1px solid ${accentColor}` }}
        animate={{ scale: [0.5, 1.5], opacity: [1, 0] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
    ),
    gradientFlow: (
      <motion.div className="w-5 h-5 rounded"
        style={{ background: `linear-gradient(45deg, ${accentColor}, ${accentColor}40)` }}
        animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    geometricShapes: (
      <div className="flex gap-0.5">
        <motion.div className="w-2 h-2" style={{ backgroundColor: accentColor }}
          animate={{ rotate: 45 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: 'reverse' }}
        />
        <motion.div className="w-2 h-2 rounded-full" style={{ backgroundColor: `${accentColor}80` }}
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>
    ),
    linesDraw: (
      <div className="w-5 h-4">
        <motion.div className="h-0.5 mb-1 rounded-full" style={{ backgroundColor: accentColor }}
          animate={{ scaleX: [0, 1] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1 }}
        />
        <motion.div className="h-0.5 rounded-full" style={{ backgroundColor: `${accentColor}60` }}
          animate={{ scaleX: [0, 1] }}
          transition={{ duration: 0.5, delay: 0.2, repeat: Infinity, repeatDelay: 1 }}
        />
      </div>
    ),
    gridReveal: (
      <div className="grid grid-cols-2 gap-0.5">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="w-2 h-2 rounded-sm" style={{ backgroundColor: accentColor }}
            animate={{ opacity: [0, 1] }}
            transition={{ duration: 0.3, delay: i * 0.1, repeat: Infinity, repeatDelay: 1 }}
          />
        ))}
      </div>
    ),
    wavyBackground: (
      <motion.div className="w-6 h-3"
        style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}40, ${accentColor})` }}
        animate={{ backgroundPosition: ['0% 0%', '100% 0%'] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    meshGradient: (
      <motion.div className="w-5 h-5 rounded"
        style={{ background: `radial-gradient(circle at 30% 30%, ${accentColor}, transparent 70%)` }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    noiseTexture: (
      <motion.div className="w-5 h-5 rounded" style={{ backgroundColor: `${accentColor}40` }}
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      />
    ),
    patternTile: (
      <div className="grid grid-cols-3 gap-px">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <motion.div key={i} className="w-1 h-1" style={{ backgroundColor: i % 2 === 0 ? accentColor : `${accentColor}40` }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, delay: i * 0.05, repeat: Infinity }}
          />
        ))}
      </div>
    ),
    // Data
    chartGrow: (
      <div className="flex items-end gap-0.5 h-5">
        {[3, 5, 4, 6].map((h, i) => (
          <motion.div key={i} className="w-1 rounded-t" style={{ backgroundColor: accentColor }}
            animate={{ height: [0, h * 1.5] }}
            transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity, repeatDelay: 1.5 }}
          />
        ))}
      </div>
    ),
    counterUp: (
      <motion.span className="text-xs font-bold" style={{ color: accentColor }}>
        <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 0.3 }}>
          42
        </motion.span>
      </motion.span>
    ),
    percentageRing: (
      <div className="relative w-5 h-5">
        <svg className="w-5 h-5 -rotate-90">
          <circle cx="10" cy="10" r="8" fill="none" stroke={`${accentColor}30`} strokeWidth="2" />
          <motion.circle cx="10" cy="10" r="8" fill="none" stroke={accentColor} strokeWidth="2"
            strokeDasharray="50"
            animate={{ strokeDashoffset: [50, 12] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 0.5 }}
          />
        </svg>
      </div>
    ),
    pieReveal: (
      <motion.div className="w-5 h-5 rounded-full"
        style={{ background: `conic-gradient(${accentColor} 0%, transparent 0%)` }}
        animate={{ background: [`conic-gradient(${accentColor} 0%, transparent 0%)`, `conic-gradient(${accentColor} 75%, transparent 75%)`] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
    ),
    statReveal: (
      <motion.div className="text-[8px] font-bold" style={{ color: accentColor }}
        animate={{ scale: [0.8, 1.1, 1], opacity: [0, 1, 1] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.5 }}
      >+99%</motion.div>
    ),
    graphDraw: (
      <svg className="w-6 h-4">
        <motion.path d="M0 4 L3 2 L6 3 L9 1" fill="none" stroke={accentColor} strokeWidth="1"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatDelay: 0.5 }}
        />
      </svg>
    ),
    metricPulse: (
      <motion.div className="text-[8px] font-bold" style={{ color: accentColor }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >5K</motion.div>
    ),
    timelineProgress: (
      <div className="w-6 h-1 rounded-full overflow-hidden" style={{ backgroundColor: `${accentColor}30` }}>
        <motion.div className="h-full rounded-full" style={{ backgroundColor: accentColor }}
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </div>
    ),
    // Branding
    logoReveal: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ scale: [0, 1.2, 1], rotate: [0, 10, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.5 }}
      />
    ),
    logoPulse: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 0.8, repeat: Infinity }}
      />
    ),
    logoSpin: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ rotateY: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      />
    ),
    logoShatter: (
      <div className="grid grid-cols-2 gap-px">
        {[0, 1, 2, 3].map(i => (
          <motion.div key={i} className="w-1.5 h-1.5" style={{ backgroundColor: accentColor }}
            animate={{ x: [(i % 2) * 2 - 1, 0], y: [Math.floor(i / 2) * 2 - 1, 0], opacity: [0, 1] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
          />
        ))}
      </div>
    ),
    logoTrace: (
      <motion.div className="w-4 h-4 rounded" style={{ border: `1px solid ${accentColor}` }}
        initial={{ pathLength: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    ),
    logoGlitch: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ x: [-1, 1, 0], opacity: [1, 0.7, 1] }}
        transition={{ duration: 0.15, repeat: Infinity, repeatDelay: 0.8 }}
      />
    ),
    logoStamp: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: accentColor }}
        animate={{ scale: [2, 1], opacity: [0, 1] }}
        transition={{ duration: 0.3, repeat: Infinity, repeatDelay: 2 }}
      />
    ),
    watermark: (
      <motion.div className="w-4 h-4 rounded" style={{ backgroundColor: `${accentColor}40` }}
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 3, repeat: Infinity }}
      />
    ),
  };

  const defaultPreview = (
    <motion.div
      className="w-4 h-4 rounded"
      style={{ backgroundColor: `${accentColor}30`, border: `1px solid ${accentColor}50` }}
      animate={{ scale: [0.9, 1.1, 0.9] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  );

  return (
    <div className="w-8 h-8 flex items-center justify-center">
      {previews[effectId] || defaultPreview}
    </div>
  );
}

// ============================================
// Glass Card Component
// ============================================
function GlassCard({ children, className = '', hover = true }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <motion.div
      className={`relative rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/[0.08] overflow-hidden ${className}`}
      whileHover={hover ? { borderColor: 'rgba(255,255,255,0.15)' } : undefined}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

// ============================================
// Effect Chip Component
// ============================================
function EffectChip({
  effect,
  selected,
  onClick,
  accentColor,
}: {
  effect: { id: string; name: string; description: string };
  selected: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
        selected
          ? 'text-black'
          : 'bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white/80 border border-white/[0.05]'
      }`}
      style={selected ? { backgroundColor: accentColor } : undefined}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      title={effect.description}
    >
      <EffectPreview effectId={effect.id} accentColor={selected ? '#000' : accentColor} />
      <span className="truncate">{effect.name}</span>
      {selected && (
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="ml-auto flex-shrink-0">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </motion.button>
  );
}

// ============================================
// Main Page Component
// ============================================
export default function MotionPage() {
  const router = useRouter();
  const {
    builderState,
    updateBuilderField,
    tokenEstimate,
    refreshEstimate,
    isValid,
    validationErrors,
    brandProfiles,
    selectedBrandProfile,
    selectBrandProfile,
    loadBrandProfiles,
    isGenerating,
    setIsGenerating,
    setGenerationProgress,
    saveProject,
    reloadCurrentProject,
    currentProject,
  } = useMotion();

  const { balanceCents, balanceDollars } = useUser();

  const [activeCategory, setActiveCategory] = useState<string>('text');
  const [showCodeViewer, setShowCodeViewer] = useState(false);
  const [generatedCodeFromApi, setGeneratedCodeFromApi] = useState<string | null>(null);
  const [showAppBanner, setShowAppBanner] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('skinny-renderer-banner-dismissed') !== 'true';
    }
    return true;
  });

  // TEST MODE: Press Ctrl+Shift+T to show code modal with mock data
  useEffect(() => {
    const handleTestMode = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        const mockCode = `import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

const GeneratedVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const titleY = spring({ frame, fps, config: { damping: 200 } }) * -50 + 50;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0D0D0D', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{
        fontSize: 72,
        fontWeight: 'bold',
        color: '#D6FC51',
        opacity: titleOpacity,
        transform: \`translateY(\${titleY}px)\`
      }}>
        Welcome to Skinny Studio
      </h1>
    </AbsoluteFill>
  );
};

export default GeneratedVideo;`;
        setGeneratedCodeFromApi(mockCode);
        setShowCodeViewer(true);
      }
    };
    window.addEventListener('keydown', handleTestMode);
    return () => window.removeEventListener('keydown', handleTestMode);
  }, []);

  // OS Detection for download links
  const [userOS, setUserOS] = useState<'mac' | 'windows' | 'unknown'>('unknown');

  // Detect user's operating system
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const platform = navigator.platform.toLowerCase();
      const userAgent = navigator.userAgent.toLowerCase();

      if (platform.includes('mac') || userAgent.includes('mac')) {
        setUserOS('mac');
      } else if (platform.includes('win') || userAgent.includes('win')) {
        setUserOS('windows');
      }
    }
  }, []);

  // Download URLs for Skinny Renderer (served from our server)
  const DOWNLOAD_URLS = {
    'mac-arm': '/downloads/Skinny-Renderer-macOS-ARM64.zip',
    'mac-intel': '/downloads/Skinny-Renderer-macOS-Intel.zip',
    'windows': '/downloads/Skinny-Renderer-Windows.zip',
  };

  // Get the appropriate download URL based on detected OS
  const getDownloadUrl = () => {
    if (userOS === 'mac') {
      // Default to ARM64 for Mac (Apple Silicon is more common now)
      return DOWNLOAD_URLS['mac-arm'];
    } else if (userOS === 'windows') {
      return DOWNLOAD_URLS['windows'];
    }
    // Default to Mac ARM for unknown OS
    return DOWNLOAD_URLS['mac-arm'];
  };

  const getDownloadLabel = () => {
    if (userOS === 'mac') return 'Download for Mac';
    if (userOS === 'windows') return 'Download for Windows';
    return 'Download';
  };

  // Auth headers helper for API calls
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (typeof window !== 'undefined') {
      const devToken = localStorage.getItem('whop-dev-token');
      const devUserId = localStorage.getItem('whop-dev-user-id');

      if (devToken) headers['x-whop-user-token'] = devToken;
      if (devUserId) headers['x-whop-user-id'] = devUserId;
    }

    return headers;
  };

  // Get current theme
  const currentTheme = useMemo(() => {
    return COLOR_THEMES.find(t => t.id === builderState.colorTheme) || COLOR_THEMES[0];
  }, [builderState.colorTheme]);

  // Load brand profiles on mount
  useEffect(() => {
    loadBrandProfiles();
  }, [loadBrandProfiles]);

  // Refresh estimate when builder state changes
  useEffect(() => {
    refreshEstimate();
  }, [builderState, selectedBrandProfile, refreshEstimate]);

  // Toggle effect selection
  const toggleEffect = (effectId: string) => {
    const current = builderState.effects;
    if (current.includes(effectId)) {
      updateBuilderField('effects', current.filter(id => id !== effectId));
    } else {
      updateBuilderField('effects', [...current, effectId]);
    }
  };

  // Handle generation
  const handleGenerate = async () => {
    if (!isValid) {
      toast.error(validationErrors[0] || 'Please fill in required fields');
      return;
    }

    if (tokenEstimate && balanceCents < tokenEstimate.totalCents) {
      toast.error('Insufficient balance');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Saving project...');

    try {
      const project = await saveProject();
      if (!project) {
        throw new Error('Failed to save project');
      }

      setGenerationProgress('Generating motion code...');

      const response = await fetch('/api/motion/generate', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      // Store the generated code from API response immediately
      if (data.code) {
        setGeneratedCodeFromApi(data.code);
      }

      // Reload project to sync state
      setGenerationProgress('Loading generated code...');
      await reloadCurrentProject();

      toast.success('Motion video generated successfully!');
      setGenerationProgress('');

      // Auto-open code viewer
      setShowCodeViewer(true);
    } catch (error) {
      console.error('Generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const effectCategories = Object.keys(EFFECTS) as (keyof typeof EFFECTS)[];

  // Video type icons
  const videoTypeIcons: Record<string, React.ReactNode> = {
    megaphone: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 11-5.8-1.6"/></svg>,
    rocket: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/></svg>,
    zap: <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
    phone: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
    lightbulb: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18h6M10 22h4M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>,
    message: <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-1/4 -left-1/4 w-[800px] h-[800px] rounded-full opacity-20 blur-[150px]"
          style={{ background: currentTheme.primary }}
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        />
        <motion.div
          className="absolute -bottom-1/4 -right-1/4 w-[600px] h-[600px] rounded-full opacity-15 blur-[120px]"
          style={{ background: currentTheme.secondary }}
          animate={{
            x: [0, -30, 0],
            y: [0, -50, 0],
            scale: [1, 1.15, 1]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Renderer App Banner */}
      <AnimatePresence>
        {showAppBanner && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-50 overflow-hidden"
          >
            <div className="bg-gradient-to-r from-[#D6FC51]/10 via-[#B8E040]/10 to-[#D6FC51]/10 border-b border-[#D6FC51]/20">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[#D6FC51]/20 flex items-center justify-center flex-shrink-0">
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#D6FC51" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
                      <line x1="8" y1="21" x2="16" y2="21"/>
                      <line x1="12" y1="17" x2="12" y2="21"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      <span className="text-[#D6FC51]">Skinny Renderer</span> required for video export
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      Download our free desktop app to render your motion graphics
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a
                    href={getDownloadUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-black bg-[#D6FC51] hover:bg-[#B8E040] transition-colors"
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    {getDownloadLabel()}
                  </a>
                  <button
                    onClick={() => {
                      setShowAppBanner(false);
                      localStorage.setItem('skinny-renderer-banner-dismissed', 'true');
                    }}
                    className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-black/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <motion.button
              onClick={() => router.push('/')}
              className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/60 hover:text-white hover:bg-white/[0.06] transition-all"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </motion.button>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Skinny Motion</h1>
              <p className="text-xs text-white/40">AI Motion Graphics</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Balance */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
              </svg>
              <span className="text-sm font-medium">${balanceDollars}</span>
            </div>

            {/* Cost Estimate */}
            {tokenEstimate && (
              <div className="hidden md:block text-right">
                <div className="text-[10px] text-white/40">
                  ~{formatTokens(tokenEstimate.inputTokens + tokenEstimate.outputTokens)} tokens
                </div>
                <div className="text-xs font-medium" style={{ color: currentTheme.primary }}>
                  Est. {formatCost(tokenEstimate.totalCents)}
                </div>
              </div>
            )}

            {/* Generate Button */}
            <motion.button
              onClick={handleGenerate}
              disabled={!isValid || isGenerating}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`
                flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all
                ${isValid && !isGenerating
                  ? 'text-black shadow-lg'
                  : 'bg-white/10 text-white/40 cursor-not-allowed'
                }
              `}
              style={isValid && !isGenerating ? {
                backgroundColor: currentTheme.primary,
                boxShadow: `0 0 30px ${currentTheme.primary}40`
              } : undefined}
            >
              {isGenerating ? (
                <>
                  <motion.div
                    className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/>
                    <path d="M19 15L20 17.5L22.5 18.5L20 19.5L19 22L18 19.5L15.5 18.5L18 17.5L19 15Z" opacity="0.7"/>
                  </svg>
                  <span>Generate</span>
                </>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24">
        <div className="grid grid-cols-12 gap-4">

          {/* Natural Language Input - Full Width */}
          <GlassCard className="col-span-12 p-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${currentTheme.primary}15` }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={currentTheme.primary} strokeWidth="1.5">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  value={builderState.naturalLanguage || ''}
                  onChange={(e) => updateBuilderField('naturalLanguage', e.target.value)}
                  placeholder="Describe what you want... e.g. 'Make it feel futuristic with lots of energy'"
                  rows={2}
                  className="w-full bg-transparent text-white placeholder-white/30 focus:outline-none resize-none text-sm leading-relaxed"
                />
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.05]">
                  <p className="text-[10px] text-white/30">Natural language enhances your preset selections</p>
                  {builderState.naturalLanguage && (
                    <button
                      onClick={() => updateBuilderField('naturalLanguage', '')}
                      className="text-[10px] text-white/40 hover:text-white/60 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Video Type Selection */}
          <GlassCard className="col-span-12 md:col-span-4 p-4">
            <div className="flex items-center gap-2 mb-4">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 4v16M18 4v16M2 9h4M18 9h4M2 15h4M18 15h4" />
              </svg>
              <h3 className="text-xs font-medium text-white/70">Video Type</h3>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {VIDEO_TYPES.map((type) => (
                <motion.button
                  key={type.id}
                  onClick={() => updateBuilderField('videoType', type.id as any)}
                  className={`relative p-3 rounded-xl text-left transition-all overflow-hidden ${
                    builderState.videoType === type.id
                      ? 'bg-white/[0.08]'
                      : 'bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {builderState.videoType === type.id && (
                    <motion.div
                      layoutId="video-type-bg"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${currentTheme.primary}15, ${currentTheme.secondary}08)`,
                        border: `1px solid ${currentTheme.primary}30`
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <div className="relative">
                    <div style={{ color: builderState.videoType === type.id ? currentTheme.primary : 'inherit' }}>
                      {videoTypeIcons[type.icon]}
                    </div>
                    <p className="text-xs font-medium mt-1.5">{type.name}</p>
                  </div>
                </motion.button>
              ))}
            </div>
          </GlassCard>

          {/* Content Input */}
          <GlassCard className="col-span-12 md:col-span-5 p-4">
            <div className="flex items-center gap-2 mb-4">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              </svg>
              <h3 className="text-xs font-medium text-white/70">Content</h3>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={builderState.title}
                onChange={(e) => updateBuilderField('title', e.target.value)}
                placeholder="Your headline..."
                className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-base font-medium placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
                style={{ caretColor: currentTheme.primary }}
              />
              <input
                type="text"
                value={builderState.subtitle || ''}
                onChange={(e) => updateBuilderField('subtitle', e.target.value)}
                placeholder="Subtitle (optional)"
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/80 text-sm placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors"
              />
              <textarea
                value={builderState.details || ''}
                onChange={(e) => updateBuilderField('details', e.target.value)}
                placeholder="Additional details..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/70 text-sm placeholder-white/25 focus:outline-none focus:border-white/20 transition-colors resize-none"
              />
            </div>
          </GlassCard>

          {/* Preview Area */}
          <GlassCard className="col-span-12 md:col-span-3 p-0 overflow-hidden" hover={false}>
            <div
              className="h-full min-h-[200px] md:min-h-[280px] w-full flex items-center justify-center relative"
              style={{ background: `linear-gradient(180deg, ${currentTheme.bg}, ${currentTheme.primary}08)` }}
            >
              <AnimatePresence mode="wait">
                {currentProject?.generated_code ? (
                  <motion.div
                    key="generated"
                    className="text-center p-4"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <motion.div
                      className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${currentTheme.primary}40, ${currentTheme.secondary}30)` }}
                    >
                      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: currentTheme.primary }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </motion.div>
                    <p className="text-white/70 text-xs font-medium mb-1">Code Generated</p>
                    <p className="text-white/40 text-[10px] mb-3">
                      {currentProject.generated_code.split('\n').length} lines of Remotion code
                    </p>
                    <motion.button
                      onClick={() => setShowCodeViewer(true)}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-black"
                      style={{ backgroundColor: currentTheme.primary }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      View Code
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    className="text-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.div
                      className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${currentTheme.primary}25, ${currentTheme.secondary}15)` }}
                      animate={{
                        boxShadow: [
                          `0 0 20px ${currentTheme.primary}15`,
                          `0 0 40px ${currentTheme.primary}30`,
                          `0 0 20px ${currentTheme.primary}15`
                        ]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      {videoTypeIcons[VIDEO_TYPES.find(t => t.id === builderState.videoType)?.icon || 'megaphone']}
                    </motion.div>
                    <p className="text-white/50 text-xs font-medium truncate max-w-[120px] mx-auto">
                      {builderState.title || 'Your video'}
                    </p>
                    {builderState.subtitle && (
                      <p className="text-white/30 text-[10px] mt-0.5 truncate max-w-[100px] mx-auto">{builderState.subtitle}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>

          {/* Color Theme */}
          <GlassCard className="col-span-6 md:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                <circle cx="12" cy="12" r="10" />
                <circle cx="8" cy="9" r="1.5" fill="currentColor" />
                <circle cx="16" cy="9" r="1.5" fill="currentColor" />
              </svg>
              <h3 className="text-[10px] font-medium text-white/70">Theme</h3>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {COLOR_THEMES.slice(0, 8).map((theme) => (
                <motion.button
                  key={theme.id}
                  onClick={() => updateBuilderField('colorTheme', theme.id)}
                  className={`aspect-square rounded-lg overflow-hidden ${
                    builderState.colorTheme === theme.id ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''
                  }`}
                  style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  title={theme.name}
                />
              ))}
            </div>
          </GlassCard>

          {/* Speed & Easing */}
          <GlassCard className="col-span-6 md:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor" className="text-white/50">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
              <h3 className="text-[10px] font-medium text-white/70">Motion</h3>
            </div>
            <div className="space-y-2">
              <div className="flex gap-1">
                {SPEED_OPTIONS.map((opt) => (
                  <motion.button
                    key={opt.id}
                    onClick={() => updateBuilderField('speed', opt.id as any)}
                    className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
                      builderState.speed === opt.id
                        ? 'text-black'
                        : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
                    }`}
                    style={builderState.speed === opt.id ? { backgroundColor: currentTheme.primary } : undefined}
                    whileTap={{ scale: 0.95 }}
                  >
                    {opt.name}
                  </motion.button>
                ))}
              </div>
              <select
                value={builderState.easing}
                onChange={(e) => updateBuilderField('easing', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-white/70 focus:outline-none focus:border-white/20 cursor-pointer appearance-none"
              >
                {EASING_STYLES.map((easing) => (
                  <option key={easing.id} value={easing.id} className="bg-zinc-900">
                    {easing.name}
                  </option>
                ))}
              </select>
            </div>
          </GlassCard>

          {/* Duration & Intensity */}
          <GlassCard className="col-span-12 md:col-span-3 p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <h3 className="text-[10px] font-medium text-white/70">Timing</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-white/40">Duration</span>
                  <span className="text-[10px] font-medium" style={{ color: currentTheme.primary }}>{builderState.duration}s</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="30"
                  step="1"
                  value={builderState.duration}
                  onChange={(e) => updateBuilderField('duration', parseInt(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${currentTheme.primary} 0%, ${currentTheme.primary} ${((builderState.duration - 3) / 27) * 100}%, rgba(255,255,255,0.1) ${((builderState.duration - 3) / 27) * 100}%, rgba(255,255,255,0.1) 100%)`
                  }}
                />
              </div>
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-white/40">Intensity</span>
                  <span className="text-[10px] font-medium" style={{ color: currentTheme.primary }}>{Math.round(builderState.intensity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={builderState.intensity}
                  onChange={(e) => updateBuilderField('intensity', parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, ${currentTheme.primary} 0%, ${currentTheme.primary} ${builderState.intensity * 100}%, rgba(255,255,255,0.1) ${builderState.intensity * 100}%, rgba(255,255,255,0.1) 100%)`
                  }}
                />
              </div>
            </div>
          </GlassCard>

          {/* Brand Profile (if available) */}
          {brandProfiles.length > 0 && (
            <GlassCard className="col-span-12 md:col-span-3 p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/50">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 9h6M9 15h6"/>
                </svg>
                <h3 className="text-[10px] font-medium text-white/70">Brand</h3>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                <button
                  onClick={() => selectBrandProfile(null)}
                  className={`w-full p-2 rounded-lg text-left text-xs transition-all ${
                    !selectedBrandProfile
                      ? 'bg-white/[0.08] border border-white/20'
                      : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'
                  }`}
                >
                  No Brand
                </button>
                {brandProfiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => selectBrandProfile(profile)}
                    className={`w-full p-2 rounded-lg text-left text-xs transition-all flex items-center gap-2 ${
                      selectedBrandProfile?.id === profile.id
                        ? 'bg-white/[0.08] border border-white/20'
                        : 'bg-white/[0.02] border border-transparent hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="w-4 h-4 rounded" style={{ background: profile.primary_color }} />
                    <span className="truncate">{profile.name}</span>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Effects Section - Full Width */}
          <GlassCard className="col-span-12 p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={currentTheme.primary} strokeWidth="1.5">
                  <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m9.9 9.9l1.4 1.4M5.6 18.4l1.4-1.4m9.9-9.9l1.4-1.4" />
                  <circle cx="12" cy="12" r="3" fill={currentTheme.primary} />
                </svg>
                <h3 className="text-xs font-medium text-white/70">Effects</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/50">
                  {builderState.effects.length} selected
                </span>
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              {effectCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-all ${
                    activeCategory === category
                      ? 'text-black'
                      : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] hover:text-white/70'
                  }`}
                  style={activeCategory === category ? { backgroundColor: currentTheme.primary } : undefined}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>

            {/* Effects Grid */}
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2"
            >
              {EFFECTS[activeCategory as keyof typeof EFFECTS]?.map((effect) => (
                <EffectChip
                  key={effect.id}
                  effect={effect}
                  selected={builderState.effects.includes(effect.id)}
                  onClick={() => toggleEffect(effect.id)}
                  accentColor={currentTheme.primary}
                />
              ))}
            </motion.div>

            {/* Selected Effects Summary */}
            <AnimatePresence>
              {builderState.effects.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pt-4 border-t border-white/[0.05]"
                >
                  <div className="flex flex-wrap gap-1.5">
                    {builderState.effects.map((id) => {
                      const effect = Object.values(EFFECTS).flat().find(e => e.id === id);
                      return effect ? (
                        <motion.span
                          key={id}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium text-black cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: currentTheme.primary }}
                          onClick={() => toggleEffect(id)}
                        >
                          {effect.name}
                          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </motion.span>
                      ) : null;
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Cost Breakdown */}
          {tokenEstimate && (
            <GlassCard className="col-span-12 md:col-span-6 lg:col-span-4 p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/50">
                  <line x1="12" y1="1" x2="12" y2="23"/>
                  <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
                </svg>
                <h3 className="text-xs font-medium text-white/70">Cost Breakdown</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Input tokens</span>
                  <span className="text-white/70">{formatTokens(tokenEstimate.inputTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Output tokens</span>
                  <span className="text-white/70">~{formatTokens(tokenEstimate.outputTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">API cost</span>
                  <span className="text-white/70">{formatCost(tokenEstimate.inputCostCents + tokenEstimate.outputCostCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Render ({builderState.duration}s)</span>
                  <span className="text-white/70">{formatCost(tokenEstimate.renderCostCents)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Platform fee (10%)</span>
                  <span className="text-white/70">{formatCost(tokenEstimate.markupCents)}</span>
                </div>
                <div className="border-t border-white/[0.05] pt-2 mt-2 flex justify-between font-medium">
                  <span className="text-white/70">Total</span>
                  <span style={{ color: currentTheme.primary }}>{formatCost(tokenEstimate.totalCents)}</span>
                </div>
              </div>
            </GlassCard>
          )}

        </div>
      </main>

      {/* Code Viewer Modal - Clean & Simple */}
      <AnimatePresence>
        {showCodeViewer && (currentProject?.generated_code || generatedCodeFromApi) && (() => {
          const effectiveCode = currentProject?.generated_code || generatedCodeFromApi || '';
          const projectTitle = currentProject?.title || builderState.title || 'Untitled';

          return (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowCodeViewer(false)}
            />

            {/* Modal */}
            <motion.div
              className="relative w-full max-w-3xl max-h-[80vh] bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden flex flex-col"
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#D6FC51]/20 flex items-center justify-center">
                    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#D6FC51" strokeWidth="2">
                      <path d="M9 12l2 2 4-4"/>
                      <circle cx="12" cy="12" r="10"/>
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Code Generated!</h2>
                    <p className="text-xs text-white/50">
                      {effectiveCode.split('\n').length} lines • {projectTitle}
                    </p>
                  </div>
                </div>
                <motion.button
                  onClick={() => setShowCodeViewer(false)}
                  className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </motion.button>
              </div>

              {/* Code Preview */}
              <div className="flex-1 overflow-auto max-h-[300px] border-b border-white/10">
                <div className="p-4">
                  <pre className="text-xs font-mono text-white/70 whitespace-pre-wrap break-words">
                    <code>
                      {effectiveCode.split('\n').slice(0, 50).map((line, i) => (
                        <div key={i} className="flex hover:bg-white/5 -mx-2 px-2 rounded">
                          <span className="w-8 text-right pr-3 text-white/30 select-none text-[10px]">{i + 1}</span>
                          <span className="flex-1">{line || ' '}</span>
                        </div>
                      ))}
                      {effectiveCode.split('\n').length > 50 && (
                        <div className="text-white/30 text-center py-2">
                          ... {effectiveCode.split('\n').length - 50} more lines
                        </div>
                      )}
                    </code>
                  </pre>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="p-6 space-y-4">
                {/* Code Actions */}
                <div className="flex gap-3">
                  <motion.button
                    onClick={() => {
                      navigator.clipboard.writeText(effectiveCode);
                      toast.success('Code copied to clipboard');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    Copy Code
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      const blob = new Blob([effectiveCode], { type: 'text/tsx' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${projectTitle.toLowerCase().replace(/\s+/g, '-')}.tsx`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Code downloaded');
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                    Download .tsx
                  </motion.button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-white/30 font-medium">RENDER WITH</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* Primary: Download Desktop App */}
                <a
                  href={getDownloadUrl()}
                  className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl text-base font-semibold text-black bg-[#D6FC51] hover:bg-[#B8E040] transition-colors"
                >
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {getDownloadLabel()} - Skinny Renderer
                </a>

                {/* Other platform links */}
                <div className="flex items-center justify-center gap-4">
                  {userOS === 'mac' && (
                    <a href={DOWNLOAD_URLS['mac-intel']} className="text-xs text-white/40 hover:text-white/60 underline">
                      Intel Mac
                    </a>
                  )}
                  {userOS !== 'windows' && (
                    <a href={DOWNLOAD_URLS['windows']} className="text-xs text-white/40 hover:text-white/60 underline">
                      Windows
                    </a>
                  )}
                  {userOS !== 'mac' && (
                    <a href={DOWNLOAD_URLS['mac-arm']} className="text-xs text-white/40 hover:text-white/60 underline">
                      Mac (Apple Silicon)
                    </a>
                  )}
                </div>

                {/* Helper Text */}
                <div className="p-3 rounded-lg bg-white/[0.02] border border-white/10">
                  {userOS === 'mac' ? (
                    <>
                      <p className="text-xs text-white/50 text-center">
                        <span className="font-medium text-white/70">How to install:</span> Extract the zip → Double-click <span className="text-[#D6FC51] font-mono">install-skinny-renderer.command</span>
                      </p>
                      <p className="text-[10px] text-white/30 text-center mt-1">
                        The script installs to Applications and launches the app automatically
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-white/50 text-center">
                        <span className="font-medium text-white/70">How to install:</span> Extract the zip → Run <span className="text-[#D6FC51] font-mono">Skinny Renderer.exe</span>
                      </p>
                      <p className="text-[10px] text-white/30 text-center mt-1">
                        Open the .tsx file in the app to render your video
                      </p>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        }
      `}</style>
    </div>
  );
}
