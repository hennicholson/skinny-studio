'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface WhopUser {
  id: string
  email?: string | null
  username?: string | null
  unique_id?: string | null
}

interface UserProfile {
  id: string
  whop_user_id: string
  balance_cents: number
  lifetime_access?: boolean
  [key: string]: any
}

interface User {
  id: string
  whop_user_id: string
  email?: string
  whop_username?: string
  [key: string]: any
}

interface UserContextType {
  user: User | null
  whop: WhopUser | null
  profile: UserProfile | null
  balanceCents: number
  balanceDollars: string
  isLoading: boolean
  error: string | null
  refreshUser: () => Promise<void>
}

const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [whop, setWhop] = useState<WhopUser | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const balanceCents = profile?.balance_cents ?? 0
  const balanceDollars = (balanceCents / 100).toFixed(2)

  const refreshUser = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Build headers - include dev token from localStorage if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      // In local Whop dev mode, token is stored in localStorage
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

      const response = await fetch('/api/users/me', { headers })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch user')
      }

      const data = await response.json()
      setUser(data.user)
      setWhop(data.whop)
      setProfile(data.profile)
    } catch (err) {
      console.error('Failed to fetch user:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch user')
      // Don't clear user data on error - keep showing what we have
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch on mount
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  // Refresh periodically (every 30 seconds) to keep balance updated
  useEffect(() => {
    const interval = setInterval(() => {
      refreshUser()
    }, 30000)

    return () => clearInterval(interval)
  }, [refreshUser])

  return (
    <UserContext.Provider
      value={{
        user,
        whop,
        profile,
        balanceCents,
        balanceDollars,
        isLoading,
        error,
        refreshUser,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
