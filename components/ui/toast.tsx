'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'
import { Toast as ToastType, ToastType as ToastVariant } from '@/lib/types'
import { useApp } from '@/lib/context/app-context'

interface ToastProps {
  toast: ToastType
  onDismiss: (id: string) => void
}

const icons: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
}

const colors: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  success: {
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: 'text-green-500',
  },
  error: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    icon: 'text-red-500',
  },
  warning: {
    bg: 'bg-skinny-yellow/10',
    border: 'border-skinny-yellow/30',
    icon: 'text-skinny-yellow',
  },
  info: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: 'text-blue-500',
  },
}

function ToastItem({ toast, onDismiss }: ToastProps) {
  const Icon = icons[toast.type]
  const color = colors[toast.type]

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm',
        'w-full sm:min-w-[300px] sm:max-w-[400px]',
        color.bg,
        color.border
      )}
    >
      <Icon size={20} className={cn('flex-shrink-0 mt-0.5', color.icon)} />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{toast.message}</p>

        {toast.action && (
          <button
            onClick={toast.action.onClick}
            className="mt-2 text-xs font-bold text-skinny-yellow hover:text-skinny-green transition-colors uppercase tracking-wide"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 w-8 h-8 min-w-[44px] min-h-[44px] -m-2 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
      >
        <X size={16} className="text-zinc-400" />
      </button>
    </motion.div>
  )
}

// Version that uses context internally
export function ToastContainer() {
  const { toasts, removeToast } = useApp()

  return (
    <div className="fixed left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2 pb-safe" style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={removeToast}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}

// Version with props for external control
interface ToastContainerWithPropsProps {
  toasts: ToastType[]
  onDismiss: (id: string) => void
}

export function ToastContainerWithProps({ toasts, onDismiss }: ToastContainerWithPropsProps) {
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-[100] flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map(toast => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
