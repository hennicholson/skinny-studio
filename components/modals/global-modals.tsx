'use client'

import { useApp } from '@/lib/context/app-context'
import { InsufficientBalanceModal } from './insufficient-balance-modal'

export function GlobalModals() {
  const { insufficientBalanceModal, hideInsufficientBalance } = useApp()

  const handleAddCredits = () => {
    // Navigate to Whop checkout or credits page
    // For now, open the Whop dashboard in a new tab
    window.open('https://whop.com/skinny-studio/', '_blank')
  }

  return (
    <>
      <InsufficientBalanceModal
        isOpen={insufficientBalanceModal.isOpen}
        onClose={hideInsufficientBalance}
        required={insufficientBalanceModal.required}
        available={insufficientBalanceModal.available}
        modelName={insufficientBalanceModal.modelName}
        onAddCredits={handleAddCredits}
      />
    </>
  )
}
