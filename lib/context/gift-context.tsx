'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { GiftNotification } from '@/components/ui/gift-notification'

interface Gift {
  id: string
  amount_cents: number
  message?: string | null
  created_at: string
}

interface GiftContextType {
  pendingGifts: Gift[]
  checkForGifts: () => Promise<void>
}

const GiftContext = createContext<GiftContextType | undefined>(undefined)

export function GiftProvider({ children }: { children: ReactNode }) {
  const [pendingGifts, setPendingGifts] = useState<Gift[]>([])
  const [currentGift, setCurrentGift] = useState<Gift | null>(null)

  const checkForGifts = useCallback(async () => {
    try {
      // Build headers with dev token if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')

        if (devToken) {
          headers['x-whop-user-token'] = devToken
        }
        if (devUserId) {
          headers['x-whop-user-id'] = devUserId
        }
      }

      const response = await fetch('/api/users/gifts', { headers })

      if (response.ok) {
        const data = await response.json()
        const gifts = data.gifts || []

        if (gifts.length > 0) {
          setPendingGifts(gifts)
          // Show the first gift immediately
          setCurrentGift(gifts[0])
        }
      }
    } catch (error) {
      console.error('Failed to check for gifts:', error)
    }
  }, [])

  const claimGift = useCallback(async (giftId: string) => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')

        if (devToken) {
          headers['x-whop-user-token'] = devToken
        }
        if (devUserId) {
          headers['x-whop-user-id'] = devUserId
        }
      }

      await fetch('/api/users/gifts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ gift_id: giftId }),
      })

      // Remove the claimed gift from pending
      setPendingGifts((prev) => prev.filter((g) => g.id !== giftId))

      // Show next gift if any
      const remaining = pendingGifts.filter((g) => g.id !== giftId)
      if (remaining.length > 0) {
        setTimeout(() => setCurrentGift(remaining[0]), 500)
      } else {
        setCurrentGift(null)
      }
    } catch (error) {
      console.error('Failed to claim gift:', error)
    }
  }, [pendingGifts])

  const handleClose = useCallback(() => {
    if (currentGift) {
      claimGift(currentGift.id)
    }
  }, [currentGift, claimGift])

  // Check for gifts on mount and periodically
  useEffect(() => {
    // Initial check after a short delay (wait for auth to be ready)
    const initialTimer = setTimeout(() => {
      checkForGifts()
    }, 2000)

    // Check every 60 seconds
    const interval = setInterval(checkForGifts, 60000)

    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [checkForGifts])

  return (
    <GiftContext.Provider value={{ pendingGifts, checkForGifts }}>
      {children}

      {/* Gift Notification Overlay */}
      <AnimatePresence>
        {currentGift && (
          <GiftNotification gift={currentGift} onClose={handleClose} />
        )}
      </AnimatePresence>
    </GiftContext.Provider>
  )
}

export function useGifts() {
  const context = useContext(GiftContext)
  if (context === undefined) {
    throw new Error('useGifts must be used within a GiftProvider')
  }
  return context
}
