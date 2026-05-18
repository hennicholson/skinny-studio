'use client'

import { useState, useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Gift, Sparkles, X, Coins } from 'lucide-react'
import confetti from 'canvas-confetti'

interface GiftNotificationProps {
  gift: {
    id: string
    amount_cents: number
    message?: string | null
  }
  onClose: () => void
}

// Floating coin/credit component. Decorative only — hidden from AT.
function FloatingCredit({ delay, startX }: { delay: number; startX: number }) {
  return (
    <motion.div
      aria-hidden
      initial={{ y: -20, x: startX, opacity: 0, scale: 0 }}
      animate={{
        y: [0, 100, 200],
        x: [startX, startX + Math.random() * 40 - 20, startX + Math.random() * 60 - 30],
        opacity: [0, 1, 0],
        scale: [0.5, 1, 0.8],
        rotate: [0, 180, 360],
      }}
      transition={{
        duration: 2,
        delay,
        ease: 'easeOut',
      }}
      className="absolute top-0 pointer-events-none"
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-skinny-yellow to-yellow-500 shadow-lg shadow-skinny-yellow/30 flex items-center justify-center">
        <span className="text-black font-bold text-sm">$</span>
      </div>
    </motion.div>
  )
}

export function GiftNotification({ gift, onClose }: GiftNotificationProps) {
  const [showContent, setShowContent] = useState(false)
  const amount = (gift.amount_cents / 100).toFixed(2)
  const titleId = useId()
  const descId = useId()
  const prefersReducedMotion = useReducedMotion()

  const dialogRef = useRef<HTMLDivElement>(null)
  const claimBtnRef = useRef<HTMLButtonElement>(null)
  const topCloseBtnRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  // Capture / restore focus.
  useEffect(() => {
    previousFocus.current = (document.activeElement as HTMLElement) || null
    return () => {
      previousFocus.current?.focus?.()
    }
  }, [])

  // Body scroll lock.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Esc to close (== claim, since closing claims the gift).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Move focus to the primary claim button once the dialog has entered
  // so keyboard users can press Enter immediately to claim.
  useEffect(() => {
    if (!showContent) return
    const raf = requestAnimationFrame(() => {
      claimBtnRef.current?.focus() ?? topCloseBtnRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [showContent])

  useEffect(() => {
    // Delay content reveal for dramatic effect — but respect reduced
    // motion: show immediately and skip the confetti burst.
    const revealDelay = prefersReducedMotion ? 0 : 400
    const timer = setTimeout(() => setShowContent(true), revealDelay)

    if (prefersReducedMotion) {
      return () => clearTimeout(timer)
    }

    // Trigger confetti
    const triggerConfetti = () => {
      // Golden confetti burst
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#eab308', '#22c55e', '#fbbf24', '#facc15', '#a3e635'],
      })

      // Side bursts
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#eab308', '#22c55e', '#fbbf24'],
      })
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#eab308', '#22c55e', '#fbbf24'],
      })
    }

    const confettiTimer = setTimeout(triggerConfetti, 500)

    return () => {
      clearTimeout(timer)
      clearTimeout(confettiTimer)
    }
  }, [prefersReducedMotion])

  // Generate floating credits — skip entirely under reduced-motion.
  const floatingCredits = prefersReducedMotion
    ? []
    : Array.from({ length: 12 }, (_, i) => ({
        delay: 0.3 + i * 0.1,
        startX: -100 + i * 20,
      }))

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      ref={dialogRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
    >
      {/* Live region for screen readers — announces the gift politely
          without stealing focus. */}
      <div role="status" aria-live="polite" className="sr-only">
        You received a gift of ${amount} in Skinny Studio credits.
        {gift.message ? ` Message: ${gift.message}` : ''}
      </div>

      {/* Backdrop */}
      <motion.button
        type="button"
        aria-label="Close and claim gift"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/90 cursor-default"
        style={{
          background:
            'radial-gradient(circle at center, rgba(214,252,81,0.15) 0%, rgba(0,0,0,0.95) 70%)',
        }}
        onClick={onClose}
      />

      {/* Floating credits animation */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
          {floatingCredits.map((credit, i) => (
            <FloatingCredit key={i} {...credit} />
          ))}
        </div>
      )}

      {/* Main content */}
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0, y: 50 }}
        animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1, y: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { scale: 0.8, opacity: 0, y: 20 }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : { type: 'spring', stiffness: 300, damping: 25, delay: 0.1 }
        }
        className="relative w-full max-w-sm"
      >
        {/* Close button */}
        <button
          ref={topCloseBtnRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-14 right-0 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-colors z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
        >
          <X size={20} aria-hidden />
        </button>

        {/* Gift box */}
        <div className="relative">
          {/* Glow effect */}
          <div
            className="absolute inset-0 blur-3xl bg-gradient-to-br from-skinny-yellow/40 to-skinny-green/40 rounded-full transform scale-150"
            aria-hidden
          />

          {/* Card */}
          <motion.div
            className="relative bg-gradient-to-br from-zinc-900 to-zinc-950 border border-skinny-yellow/20 rounded-3xl overflow-hidden shadow-2xl"
            animate={
              prefersReducedMotion
                ? undefined
                : {
                    boxShadow: [
                      '0 0 60px rgba(214,252,81,0.2)',
                      '0 0 80px rgba(214,252,81,0.4)',
                      '0 0 60px rgba(214,252,81,0.2)',
                    ],
                  }
            }
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* Top decoration */}
            <div
              className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-skinny-yellow via-skinny-green to-skinny-yellow"
              aria-hidden
            />

            {/* Content */}
            <div className="p-6 sm:p-8 text-center">
              {/* Gift icon with animation */}
              <motion.div
                initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0, rotate: -180 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, rotate: 0 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.15 }
                    : { type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }
                }
                className="relative w-24 h-24 mx-auto mb-6"
              >
                {/* Sparkle ring — decorative, hidden from AT */}
                {!prefersReducedMotion && (
                  <motion.div
                    aria-hidden
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0"
                  >
                    {[0, 60, 120, 180, 240, 300].map((deg) => (
                      <motion.div
                        key={deg}
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.5, 1, 0.5],
                        }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: deg / 360,
                        }}
                        className="absolute w-2 h-2 rounded-full bg-skinny-yellow"
                        style={{
                          top: '50%',
                          left: '50%',
                          transform: `rotate(${deg}deg) translateY(-40px)`,
                        }}
                      />
                    ))}
                  </motion.div>
                )}

                {/* Gift box icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center shadow-lg shadow-skinny-yellow/30">
                    <Gift size={40} className="text-black" aria-hidden />
                  </div>
                </div>
              </motion.div>

              {/* Title */}
              <AnimatePresence>
                {showContent && (
                  <motion.div
                    initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 20 }}
                    animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    transition={{ delay: prefersReducedMotion ? 0 : 0.1 }}
                  >
                    <h2 id={titleId} className="text-2xl font-bold text-white mb-2">
                      You got a gift!
                    </h2>
                    <p id={descId} className="text-white/60 text-sm mb-6">
                      From the Skinny Studio team
                    </p>

                    {/* Amount */}
                    <motion.div
                      initial={prefersReducedMotion ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { scale: 1, opacity: 1 }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0.15 }
                          : { type: 'spring', stiffness: 300, delay: 0.3 }
                      }
                      className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-skinny-yellow/10 to-skinny-green/10 border border-skinny-yellow/20 mb-6"
                    >
                      <Coins className="text-skinny-yellow" size={28} aria-hidden />
                      <span className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-skinny-yellow to-skinny-green tabular-nums">
                        ${amount}
                      </span>
                    </motion.div>

                    {/* Message */}
                    {gift.message && (
                      <motion.p
                        initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: prefersReducedMotion ? 0 : 0.5 }}
                        className="text-white/80 text-sm italic mb-6 px-2"
                      >
                        &ldquo;{gift.message}&rdquo;
                      </motion.p>
                    )}

                    {/* Claim button */}
                    <motion.button
                      ref={claimBtnRef}
                      type="button"
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: prefersReducedMotion ? 0 : 0.6 }}
                      onClick={onClose}
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                      className="w-full min-h-[52px] py-3.5 rounded-xl bg-gradient-to-r from-skinny-yellow to-skinny-green text-black font-semibold text-lg flex items-center justify-center gap-2 shadow-lg shadow-skinny-yellow/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                    >
                      <Sparkles size={20} aria-hidden />
                      Claim ${amount}
                    </motion.button>

                    {/* Credits added note */}
                    <motion.p
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: prefersReducedMotion ? 0 : 0.8 }}
                      className="text-white/40 text-xs mt-4"
                    >
                      Credits have been added to your balance
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}
