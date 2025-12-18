'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, CreditCard, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InsufficientBalanceModalProps {
  isOpen: boolean
  onClose: () => void
  required: number  // in cents
  available: number  // in cents
  modelName?: string
  onAddCredits?: () => void
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function InsufficientBalanceModal({
  isOpen,
  onClose,
  required,
  available,
  modelName,
  onAddCredits,
}: InsufficientBalanceModalProps) {
  const shortfall = required - available

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="relative px-6 py-5 bg-red-500/10 border-b border-red-500/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-red-500/20">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Insufficient Balance</h3>
                    <p className="text-sm text-red-400/80">Add credits to continue generating</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Cost Breakdown */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50">
                    <span className="text-sm text-zinc-400">
                      {modelName ? `${modelName} generation` : 'Generation cost'}
                    </span>
                    <span className="text-sm font-medium text-white">
                      ${formatCents(required)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <Wallet size={16} className="text-zinc-500" />
                      <span className="text-sm text-zinc-400">Your balance</span>
                    </div>
                    <span className={cn(
                      "text-sm font-medium",
                      available < required ? "text-red-400" : "text-green-400"
                    )}>
                      ${formatCents(available)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <span className="text-sm text-red-400">Amount needed</span>
                    <span className="text-sm font-bold text-red-400">
                      ${formatCents(shortfall)}
                    </span>
                  </div>
                </div>

                {/* Info text */}
                <p className="text-xs text-zinc-500 text-center">
                  Your balance is checked before generation starts to prevent overcharges.
                </p>
              </div>

              {/* Actions */}
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onAddCredits?.()
                    onClose()
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-skinny-yellow text-black text-sm font-medium hover:bg-skinny-green transition-colors"
                >
                  <CreditCard size={16} />
                  Add Credits
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
