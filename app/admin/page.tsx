'use client'

import { useEffect, useState } from 'react'
import {
  Users,
  Image,
  DollarSign,
  Boxes,
  TrendingUp,
  Clock,
  Activity,
  Brain,
  Sparkles
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'

interface Stats {
  totalUsers: number
  activeUsers: number
  totalGenerations: number
  todayGenerations: number
  totalRevenue: number
  totalModels: number
  activeModels: number
}

interface TopModel {
  id: string
  name: string
  count: number
}

interface RecentActivity {
  id: string
  created_at: string
  model_id: string
  model_name: string
  cost_cents: number
  username: string
}

interface OrchestratorStats {
  totalTokens: number
  totalCostCents: number
  platformTokens: number
  platformCostCents: number
  todayTokens: number
  todayPlatformTokens: number
  todayPlatformCostCents: number
  yesterdayPlatformTokens: number
}

interface DashboardData {
  stats: Stats
  orchestratorStats?: OrchestratorStats
  topModels: TopModel[]
  recentActivity: RecentActivity[]
}

function StatCard({
  title,
  value,
  icon: Icon,
  subValue,
  trend,
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-white/50">{title}</p>
          <p className="text-2xl font-semibold text-white mt-1">{value}</p>
          {subValue && (
            <p className={cn(
              "text-xs mt-1",
              trend === 'up' ? 'text-green-400' :
              trend === 'down' ? 'text-red-400' :
              'text-white/40'
            )}>
              {subValue}
            </p>
          )}
        </div>
        <div className="p-2 rounded-lg bg-white/[0.03]">
          <Icon className="w-5 h-5 text-skinny-yellow" />
        </div>
      </div>
    </div>
  )
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await adminFetch('/api/admin/stats')
        if (response.ok) {
          const json = await response.json()
          setData(json)
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-28 bg-zinc-800 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-8">
        <p className="text-white/60">Failed to load dashboard data</p>
      </div>
    )
  }

  const { stats, orchestratorStats, topModels, recentActivity } = data

  // Format token counts
  const formatTokens = (tokens: number): string => {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(2)}M`
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  // Calculate token change percentage
  const getTokenChange = (): { value: string; trend: 'up' | 'down' | 'neutral' } => {
    if (!orchestratorStats) return { value: '', trend: 'neutral' }
    const today = orchestratorStats.todayPlatformTokens
    const yesterday = orchestratorStats.yesterdayPlatformTokens
    if (yesterday === 0) {
      return today > 0 ? { value: 'New activity', trend: 'up' } : { value: '', trend: 'neutral' }
    }
    const change = ((today - yesterday) / yesterday) * 100
    if (change > 0) return { value: `+${change.toFixed(0)}% vs yesterday`, trend: 'up' }
    if (change < 0) return { value: `${change.toFixed(0)}% vs yesterday`, trend: 'down' }
    return { value: 'Same as yesterday', trend: 'neutral' }
  }

  const tokenChange = getTokenChange()

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-sm text-white/50 mt-1">Overview of Skinny Studio metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={Users}
          subValue={`${stats.activeUsers} active today`}
          trend="neutral"
        />
        <StatCard
          title="Total Generations"
          value={stats.totalGenerations.toLocaleString()}
          icon={Image}
          subValue={`${stats.todayGenerations} today`}
          trend={stats.todayGenerations > 0 ? 'up' : 'neutral'}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={DollarSign}
        />
        <StatCard
          title="Models"
          value={stats.totalModels}
          icon={Boxes}
          subValue={`${stats.activeModels} active`}
        />
      </div>

      {/* AI Orchestrator Stats */}
      {orchestratorStats && orchestratorStats.platformTokens > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Brain size={18} className="text-skinny-yellow" />
            <h2 className="text-sm font-medium text-white">AI Orchestrator (Platform Key)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard
              title="Platform Tokens Used"
              value={formatTokens(orchestratorStats.platformTokens)}
              icon={Sparkles}
              subValue={`${formatTokens(orchestratorStats.todayPlatformTokens)} today`}
              trend={orchestratorStats.todayPlatformTokens > 0 ? 'up' : 'neutral'}
            />
            <StatCard
              title="Estimated Cost"
              value={formatCurrency(orchestratorStats.platformCostCents)}
              icon={DollarSign}
              subValue={`${formatCurrency(orchestratorStats.todayPlatformCostCents)} today`}
              trend={orchestratorStats.todayPlatformCostCents > 0 ? 'up' : 'neutral'}
            />
            <StatCard
              title="Today's Usage"
              value={formatTokens(orchestratorStats.todayPlatformTokens)}
              icon={Clock}
              subValue={tokenChange.value}
              trend={tokenChange.trend}
            />
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Models */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-skinny-yellow" />
            <h2 className="text-sm font-medium text-white">Top Models (7 days)</h2>
          </div>
          <div className="space-y-3">
            {topModels.length === 0 ? (
              <p className="text-sm text-white/40">No data yet</p>
            ) : (
              topModels.map((model, index) => (
                <div key={model.id} className="flex items-center gap-3">
                  <span className="text-xs text-white/30 w-4">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{model.name}</p>
                  </div>
                  <span className="text-sm text-white/60">{model.count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-skinny-yellow" />
            <h2 className="text-sm font-medium text-white">Recent Activity</h2>
          </div>
          <div className="space-y-3">
            {recentActivity.length === 0 ? (
              <p className="text-sm text-white/40">No recent activity</p>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      <span className="text-skinny-yellow">@{activity.username}</span>
                      {' used '}
                      <span className="text-white/80">{activity.model_name}</span>
                    </p>
                    <p className="text-xs text-white/40">
                      {formatCurrency(activity.cost_cents || 0)}
                    </p>
                  </div>
                  <span className="text-xs text-white/30 flex-shrink-0">
                    {formatTime(activity.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
