'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

function WhopEntryContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    // Get the dev token from URL params (Whop adds this in local dev)
    const devToken = searchParams.get('whop-dev-user-token')

    if (devToken) {
      // Store the token for API calls
      localStorage.setItem('whop-dev-token', devToken)

      // Decode JWT to get user info
      try {
        const parts = devToken.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          console.log('Whop dev token payload:', payload)
          localStorage.setItem('whop-dev-user-id', payload.sub || '')
        }
      } catch (e) {
        console.error('Failed to decode dev token:', e)
      }
    }

    // Redirect to the main app
    router.replace('/')
  }, [searchParams, router])

  return (
    <div className="h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-skinny-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-500 text-sm">Loading Skinny Studio...</p>
      </div>
    </div>
  )
}

export default function WhopEntry() {
  return (
    <Suspense fallback={
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-skinny-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">Loading Skinny Studio...</p>
        </div>
      </div>
    }>
      <WhopEntryContent />
    </Suspense>
  )
}
