'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'
import {
  LayoutDashboard,
  Boxes,
  Users,
  BarChart3,
  ChevronLeft,
  Shield,
  Loader2,
  Gift,
  Megaphone,
  Settings,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Models', href: '/admin/models', icon: Boxes },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Campaigns', href: '/admin/campaigns', icon: Megaphone },
  { label: 'Platform', href: '/admin/platform', icon: Settings },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [currentPath, setCurrentPath] = useState('')

  useEffect(() => {
    // Check admin authorization
    const checkAuth = async () => {
      try {
        const response = await adminFetch('/api/admin/stats')
        if (response.ok) {
          setIsAuthorized(true)
        } else {
          router.push('/')
        }
      } catch {
        router.push('/')
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [router])

  useEffect(() => {
    setCurrentPath(window.location.pathname)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-skinny-yellow animate-spin" />
          <p className="text-white/60 text-sm">Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <div className="min-h-screen bg-black flex">
      {/* Sidebar */}
      <aside className="w-64 bg-zinc-950 border-r border-white/[0.06] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-skinny-yellow" />
            <span className="font-semibold text-white">Admin Panel</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = currentPath === item.href ||
              (item.href !== '/admin' && currentPath.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setCurrentPath(item.href)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
                  isActive
                    ? "bg-skinny-yellow/10 text-skinny-yellow"
                    : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                )}
              >
                <Icon size={18} />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Back to App */}
        <div className="p-3 border-t border-white/[0.06]">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <ChevronLeft size={18} />
            <span className="text-sm">Back to App</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
