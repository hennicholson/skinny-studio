'use client'

import { useApp } from '@/lib/context/app-context'
import { InsufficientBalanceModal } from './insufficient-balance-modal'

/**
 * Global modal portal. Mounted once at the root (see `app/layout.tsx`)
 * so any context-bound modal can be opened from anywhere in the tree
 * without each surface re-implementing focus/escape/scroll-lock logic.
 *
 * Each modal here owns its own a11y wiring (role="dialog", aria-modal,
 * focus trap, body scroll lock, prefers-reduced-motion). Adding a new
 * global modal? Pattern: extend `app-context` with `isOpen` state +
 * show/hide actions, then render it here.
 */
export function GlobalModals() {
  const { insufficientBalanceModal, hideInsufficientBalance } = useApp()

  // Fallback for the rare case where the inline /api/topup-plans flow
  // fails — open the Whop product page in a new tab so users still have
  // a path to top up. The modal itself prefers in-app purchase.
  const handleAddCreditsFallback = () => {
    if (typeof window !== 'undefined') {
      window.open('https://whop.com/skinny-studio/', '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <>
      <InsufficientBalanceModal
        isOpen={insufficientBalanceModal.isOpen}
        onClose={hideInsufficientBalance}
        required={insufficientBalanceModal.required}
        available={insufficientBalanceModal.available}
        modelName={insufficientBalanceModal.modelName}
        onAddCredits={handleAddCreditsFallback}
      />
    </>
  )
}
