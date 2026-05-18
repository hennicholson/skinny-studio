'use client'

import { useEffect, useId, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { X, AlertTriangle, CreditCard, Wallet, Loader2, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUser } from '@/lib/context/user-context'
import { createSdk } from '@whop/iframe'
import { toast } from 'sonner'

interface InsufficientBalanceModalProps {
  isOpen: boolean
  onClose: () => void
  required: number  // in cents
  available: number  // in cents
  modelName?: string
  onAddCredits?: () => void
}

interface TopupPlan {
  plan_id: number
  name: string
  description: string
  credits: string
  price: string
  currency: string
  slug: string
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

// Focus-trap helper — keeps Tab inside the modal so keyboard users can't
// land on backdrop elements while the dialog is open.
function useFocusTrap(active: boolean, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active || !ref.current) return
    const node = ref.current

    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('aria-hidden'))

    // Defer focus by a frame so framer-motion's enter animation doesn't
    // steal it and so we don't race the ref mount.
    const raf = requestAnimationFrame(() => {
      const first = focusables()[0]
      first?.focus()
    })

    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(raf)
      node.removeEventListener('keydown', handleKey)
    }
  }, [active, ref])
}

// Lock body scroll while modal is open — prevents iOS "rubber-band" and
// keeps focus on the dialog content on mobile.
function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [active])
}

export function InsufficientBalanceModal({
  isOpen,
  onClose,
  required,
  available,
  modelName,
  onAddCredits,
}: InsufficientBalanceModalProps) {
  const shortfall = Math.max(0, required - available)
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const prefersReducedMotion = useReducedMotion()

  const { user, profile, refreshUser } = useUser()
  const [plans, setPlans] = useState<TopupPlan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [purchaseLoading, setPurchaseLoading] = useState<number | null>(null)

  useFocusTrap(isOpen, dialogRef)
  useBodyScrollLock(isOpen)

  // Capture previous focus on open, restore on close — required for
  // proper keyboard / screen-reader experience (WAI-ARIA APG).
  useEffect(() => {
    if (isOpen) {
      previousFocus.current = (document.activeElement as HTMLElement) || null
    } else if (previousFocus.current) {
      previousFocus.current.focus?.()
      previousFocus.current = null
    }
  }, [isOpen])

  // Esc closes.
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  // Fetch top-up plans when the modal opens. This is the revenue path —
  // we want them right here so the user never has to navigate away.
  useEffect(() => {
    if (!isOpen || plans.length > 0) return
    let cancelled = false
    setLoadingPlans(true)
    fetch('/api/topup-plans')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return
        setPlans(data?.plans || [])
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch topup plans:', err)
      })
      .finally(() => {
        if (!cancelled) setLoadingPlans(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, plans.length])

  // Lazy Whop iframe SDK init.
  const iframeSdkRef = useRef<ReturnType<typeof createSdk> | null>(null)
  const getIframeSdk = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (!iframeSdkRef.current) {
      iframeSdkRef.current = createSdk({
        appId: process.env.NEXT_PUBLIC_WHOP_APP_ID,
      })
    }
    return iframeSdkRef.current
  }, [])

  const handlePurchase = useCallback(
    async (plan: TopupPlan) => {
      const userId = profile?.id || user?.id
      if (!userId) {
        toast.error('Unable to load account info. Try refreshing the page.')
        return
      }
      setPurchaseLoading(plan.plan_id)
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (typeof window !== 'undefined') {
          const devToken = localStorage.getItem('whop-dev-token')
          const devUserId = localStorage.getItem('whop-dev-user-id')
          if (devToken) headers['x-whop-user-token'] = devToken
          if (devUserId) headers['x-whop-user-id'] = devUserId
        }

        const res = await fetch('/api/charge', {
          method: 'POST',
          headers,
          body: JSON.stringify({ planId: plan.plan_id, userId }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Failed to create checkout')
        }
        const { id, planId } = await res.json()

        const sdk = getIframeSdk()
        if (!sdk) {
          throw new Error(
            'Top-ups are only available when the app runs inside Whop. Open Skinny Studio from your Whop dashboard to add credits.'
          )
        }
        const result: any = await sdk.inAppPurchase({ planId, id })
        if (result?.status === 'ok') {
          toast.success('Credits added — you can continue generating.')
          setTimeout(() => refreshUser(), 800)
          onClose()
        } else if (result?.status === 'error') {
          throw new Error(result?.error || 'Purchase failed')
        }
      } catch (err: any) {
        console.error('Purchase error:', err)
        toast.error(err?.message || 'Purchase failed. Please try again.')
      } finally {
        setPurchaseLoading(null)
      }
    },
    [user?.id, profile?.id, refreshUser, onClose, getIframeSdk]
  )

  // Sort plans so the cheapest tier appears first — smoother for the
  // "$X more to continue" mental model. Falls back to source order if
  // the API ever returns junk.
  const sortedPlans = [...plans].sort((a, b) => {
    const ap = parseFloat(a.price)
    const bp = parseFloat(b.price)
    if (Number.isNaN(ap) || Number.isNaN(bp)) return 0
    return ap - bp
  })

  // Choose a "recommended" tier — smallest plan that covers the shortfall,
  // otherwise the largest plan (still gets them topped up).
  const recommendedPlanId = (() => {
    const covering = sortedPlans.find((p) => {
      const dollars = parseFloat(p.price)
      return !Number.isNaN(dollars) && dollars * 100 >= shortfall
    })
    return covering?.plan_id ?? sortedPlans[sortedPlans.length - 1]?.plan_id
  })()

  const enterAnim = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 12 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.96, y: 12 },
      }

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          // Outer wrapper handles centering + safe-area padding. We do
          // NOT put `aria-modal` here — only on the dialog itself.
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md cursor-default"
          />

          {/* Dialog */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            {...enterAnim}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.22,
              ease: [0.4, 0, 0.2, 1],
            }}
            className={cn(
              'relative w-full sm:max-w-md',
              // Mobile: bottom sheet up to 90vh. Tablet+: floating card.
              'max-h-[92dvh] sm:max-h-[88vh]',
              'rounded-t-2xl sm:rounded-2xl',
              'bg-zinc-900 border border-white/[0.06] shadow-2xl',
              'flex flex-col overflow-hidden'
            )}
          >
            {/* Drag handle (mobile bottom-sheet visual cue, decorative) */}
            <div className="sm:hidden flex justify-center pt-2 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="relative px-5 sm:px-6 pt-4 pb-4 bg-red-500/10 border-b border-red-500/20">
              <div className="flex items-start gap-3 pr-10">
                <div className="p-2 rounded-full bg-red-500/20 flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden />
                </div>
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base sm:text-lg font-semibold text-white">
                    Not enough credits
                  </h2>
                  <p id={descId} className="text-xs sm:text-sm text-red-300/90 mt-0.5">
                    Top up to continue
                    {modelName ? (
                      <>
                        {' '}generating with{' '}
                        <span className="font-medium text-red-200">{modelName}</span>
                      </>
                    ) : (
                      <> generating</>
                    )}
                    .
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-11 h-11 rounded-lg text-zinc-300 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* Cost summary */}
              <div className="px-5 sm:px-6 pt-5 pb-2 space-y-2">
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <span className="text-sm text-zinc-400 truncate">
                    {modelName ? `${modelName}` : 'Generation cost'}
                  </span>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    ${formatCents(required)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wallet size={14} className="text-zinc-500 flex-shrink-0" aria-hidden />
                    <span className="text-sm text-zinc-400 truncate">Your balance</span>
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums">
                    ${formatCents(available)}
                  </span>
                </div>

                <div
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25"
                  aria-live="polite"
                >
                  <span className="text-sm text-red-300">You need</span>
                  <span className="text-sm font-bold text-red-300 tabular-nums">
                    ${formatCents(shortfall)} more
                  </span>
                </div>
              </div>

              {/* Top-up plans */}
              <div className="px-5 sm:px-6 pt-5 pb-2">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Top up
                  </h3>
                  <span className="text-[10px] text-zinc-600">
                    Charged via Whop
                  </span>
                </div>

                {loadingPlans ? (
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="status"
                    aria-label="Loading top-up plans"
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[78px] rounded-xl bg-white/[0.03] border border-white/[0.04] animate-pulse"
                      />
                    ))}
                  </div>
                ) : sortedPlans.length === 0 ? (
                  <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-5 text-center">
                    <p className="text-sm text-zinc-400">
                      Top-up plans aren&apos;t available right now.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onAddCredits?.()
                        onClose()
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-skinny-yellow text-black text-xs font-semibold hover:bg-skinny-green transition-colors min-h-[36px]"
                    >
                      <CreditCard size={14} aria-hidden />
                      Open Whop
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sortedPlans.map((plan) => {
                      const isLoading = purchaseLoading === plan.plan_id
                      const isRecommended = plan.plan_id === recommendedPlanId
                      const disabled = purchaseLoading !== null
                      const price = parseFloat(plan.price)
                      const dollars = Number.isFinite(price) ? price.toFixed(0) : plan.price

                      return (
                        <button
                          key={plan.plan_id}
                          type="button"
                          onClick={() => handlePurchase(plan)}
                          disabled={disabled}
                          aria-label={`Top up $${dollars} — ${plan.description || plan.name}`}
                          className={cn(
                            'relative text-left rounded-xl border p-3 transition-all min-h-[78px]',
                            'focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60',
                            isRecommended
                              ? 'bg-skinny-yellow/[0.08] border-skinny-yellow/40 hover:bg-skinny-yellow/[0.12]'
                              : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.05]',
                            disabled && !isLoading && 'opacity-40 pointer-events-none',
                            isLoading && 'opacity-80'
                          )}
                        >
                          {isRecommended && (
                            <span className="absolute -top-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-skinny-yellow text-black text-[9px] font-bold uppercase tracking-wide">
                              <Sparkles size={9} aria-hidden />
                              Best
                            </span>
                          )}
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-2xl font-bold text-white tabular-nums">
                              ${dollars}
                            </span>
                            {isLoading && (
                              <Loader2 size={14} className="animate-spin text-skinny-yellow" aria-hidden />
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">
                            {plan.description || plan.name}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                )}

                <p className="text-[10px] text-zinc-600 text-center mt-3 leading-relaxed">
                  Balance is checked before each generation so you&apos;re never overcharged.
                </p>
              </div>
            </div>

            {/* Footer — single secondary action; primary CTA is the plan card above */}
            <div className="px-5 sm:px-6 py-3.5 border-t border-white/[0.05] flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-white/[0.04] border border-white/[0.06] text-zinc-300 text-sm font-medium hover:bg-white/[0.08] active:bg-white/[0.1] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-skinny-yellow/60"
              >
                Maybe later
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
