'use client'

// /canvas used to be a standalone landing page. Canvas is now a first-class
// shell mode inside app/page.tsx, so this route exists only to keep existing
// links + bookmarks working — it redirects to `/?mode=canvas` and the shell
// presets Canvas as the active view.
//
// The full editor at /canvas/[id] is unaffected — that's a separate route
// with its own full-bleed React Flow surface.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CanvasRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/?mode=canvas')
  }, [router])

  return null
}
