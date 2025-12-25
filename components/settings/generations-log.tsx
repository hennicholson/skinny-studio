'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import {
  Image as ImageIcon,
  Video,
  Loader2,
  ChevronDown,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  ExternalLink,
  RefreshCw
} from 'lucide-react'
import Image from 'next/image'

interface Generation {
  id: string
  whop_user_id: string
  model_slug: string
  model_category: string
  prompt: string
  parameters?: Record<string, any>
  output_urls?: string[]
  cost_cents: number
  replicate_status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
  replicate_error?: string
  replicate_prediction_id?: string
  created_at: string
  completed_at?: string
  metadata?: Record<string, any>
}

interface GenerationsSummary {
  totalGenerations: number
  succeededCount: number
  failedCount: number
  pendingCount: number
  imageCount: number
  videoCount: number
  totalCostCents: number
}

interface GenerationsResponse {
  generations: Generation[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  summary: GenerationsSummary
}

function formatCents(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2)
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  })
}

function StatusBadge({ status, createdAt }: { status: Generation['replicate_status']; createdAt?: string }) {
  // Check if generation is stuck (starting/processing for more than 2 minutes)
  const isStuck = (status === 'starting' || status === 'processing') && createdAt &&
    (Date.now() - new Date(createdAt).getTime()) > 2 * 60 * 1000

  const config = {
    succeeded: { icon: CheckCircle2, color: 'text-green-400 bg-green-500/10', label: 'Success' },
    failed: { icon: XCircle, color: 'text-red-400 bg-red-500/10', label: 'Failed' },
    canceled: { icon: XCircle, color: 'text-orange-400 bg-orange-500/10', label: 'Canceled' },
    starting: { icon: Loader2, color: 'text-blue-400 bg-blue-500/10', label: 'Starting' },
    processing: { icon: Loader2, color: 'text-yellow-400 bg-yellow-500/10', label: 'Processing' },
  }

  // Override for stuck generations
  if (isStuck) {
    return (
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", "text-amber-400 bg-amber-500/10")}>
        <AlertCircle size={10} />
        Checking...
      </span>
    )
  }

  const { icon: Icon, color, label } = config[status] || config.failed
  const isLoading = status === 'starting' || status === 'processing'

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", color)}>
      <Icon size={10} className={isLoading ? 'animate-spin' : ''} />
      {label}
    </span>
  )
}

function GenerationCard({ generation, onRefresh }: { generation: Generation; onRefresh?: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const isVideo = generation.model_category === 'video'
  const hasOutput = generation.output_urls && generation.output_urls.length > 0
  const previewUrl = hasOutput ? generation.output_urls![0] : null

  // Check if generation is stuck
  const isStuck = (generation.replicate_status === 'starting' || generation.replicate_status === 'processing') &&
    (Date.now() - new Date(generation.created_at).getTime()) > 2 * 60 * 1000

  // Retry check for stuck generations
  const handleRetryCheck = async () => {
    if (!generation.id || isRetrying) return
    setIsRetrying(true)

    try {
      // Get auth headers from localStorage
      const headers: Record<string, string> = {}
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) headers['x-whop-user-token'] = devToken
        if (devUserId) headers['x-whop-user-id'] = devUserId
      }

      const res = await fetch(`/api/generations/${generation.id}`, { headers })
      if (res.ok) {
        // Refresh the list to show updated status
        onRefresh?.()
      }
    } catch (err) {
      console.error('Retry check failed:', err)
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left"
      >
        <div className="flex items-start gap-3">
          {/* Preview or Icon */}
          {previewUrl ? (
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
              {isVideo ? (
                <video
                  src={previewUrl}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <Image
                  src={previewUrl}
                  alt="Generation preview"
                  fill
                  className="object-cover"
                  sizes="48px"
                />
              )}
            </div>
          ) : (
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
              generation.replicate_status === 'succeeded' ? "bg-green-500/10" :
              generation.replicate_status === 'failed' ? "bg-red-500/10" :
              "bg-zinc-800"
            )}>
              {isVideo ? (
                <Video size={20} className="text-zinc-400" />
              ) : (
                <ImageIcon size={20} className="text-zinc-400" />
              )}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white text-sm">
                {generation.model_slug}
              </span>
              <StatusBadge status={generation.replicate_status} createdAt={generation.created_at} />
              {isVideo && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
                  Video
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1 truncate max-w-[200px]">
              {generation.prompt.slice(0, 50)}{generation.prompt.length > 50 ? '...' : ''}
            </p>
            <div className="flex items-center gap-2 text-xs text-zinc-600 mt-1">
              <Clock size={10} />
              <span>{formatDate(generation.created_at)}</span>
            </div>
          </div>

          {/* Cost */}
          <div className="text-right flex-shrink-0">
            <div className="font-medium text-zinc-400 text-sm">
              {generation.cost_cents > 0 ? `$${formatCents(generation.cost_cents)}` : 'Free'}
            </div>
          </div>

          <ChevronDown
            size={16}
            className={cn(
              "text-zinc-600 transition-transform flex-shrink-0 mt-1",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800"
          >
            <div className="p-4 space-y-3">
              {/* Full Prompt */}
              <div>
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Prompt</span>
                <p className="text-xs text-zinc-400 mt-1">{generation.prompt}</p>
              </div>

              {/* Error Message */}
              {generation.replicate_error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <span className="text-[10px] text-red-400 uppercase tracking-wider">Error</span>
                  <p className="text-xs text-red-300 mt-1">{generation.replicate_error}</p>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800/50 rounded-lg p-2">
                  <span className="text-[10px] text-zinc-600 uppercase">Model</span>
                  <p className="text-sm text-white font-medium">{generation.model_slug}</p>
                </div>
                <div className="bg-zinc-800/50 rounded-lg p-2">
                  <span className="text-[10px] text-zinc-600 uppercase">Category</span>
                  <p className="text-sm text-white font-medium capitalize">{generation.model_category}</p>
                </div>
                {generation.completed_at && (
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Duration</span>
                    <p className="text-sm text-white font-medium">
                      {Math.round((new Date(generation.completed_at).getTime() - new Date(generation.created_at).getTime()) / 1000)}s
                    </p>
                  </div>
                )}
                {generation.output_urls && generation.output_urls.length > 1 && (
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Outputs</span>
                    <p className="text-sm text-white font-medium">{generation.output_urls.length} images</p>
                  </div>
                )}
              </div>

              {/* Retry Check Button for stuck generations */}
              {isStuck && (
                <button
                  onClick={handleRetryCheck}
                  disabled={isRetrying}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {isRetrying ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  {isRetrying ? 'Checking Replicate...' : 'Check Status'}
                </button>
              )}

              {/* View Output Button */}
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-skinny-yellow/10 border border-skinny-yellow/30 text-skinny-yellow text-xs font-medium hover:bg-skinny-yellow/20 transition-colors"
                >
                  <ExternalLink size={14} />
                  View Full Output
                </a>
              )}

              {/* IDs */}
              <div className="flex items-center justify-between text-[10px] text-zinc-600">
                <span>ID: {generation.id.slice(0, 8)}...</span>
                {generation.replicate_prediction_id && (
                  <span>Prediction: {generation.replicate_prediction_id.slice(0, 8)}...</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function GenerationsLog() {
  const [data, setData] = useState<GenerationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<'all' | 'succeeded' | 'failed' | 'pending'>('all')
  const [error, setError] = useState<string | null>(null)

  const fetchGenerations = async (offset = 0, append = false) => {
    if (offset === 0) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }
    setError(null)

    try {
      // Get auth headers from localStorage
      const headers: Record<string, string> = {}
      if (typeof window !== 'undefined') {
        const devToken = localStorage.getItem('whop-dev-token')
        const devUserId = localStorage.getItem('whop-dev-user-id')
        if (devToken) headers['x-whop-user-token'] = devToken
        if (devUserId) headers['x-whop-user-id'] = devUserId
      }

      const params = new URLSearchParams({
        limit: '20',
        offset: offset.toString(),
      })

      // Map filter to status
      if (filter === 'succeeded') {
        params.set('status', 'succeeded')
      } else if (filter === 'failed') {
        params.set('status', 'failed')
      } else if (filter === 'pending') {
        // Pending means starting or processing - we'll filter client-side
      }

      const res = await fetch(`/api/users/generations?${params}`, { headers })

      if (!res.ok) {
        throw new Error('Failed to fetch generations')
      }

      const newData: GenerationsResponse = await res.json()

      // Filter pending client-side if needed
      if (filter === 'pending') {
        newData.generations = newData.generations.filter(
          g => g.replicate_status === 'starting' || g.replicate_status === 'processing'
        )
      }

      if (append && data) {
        setData({
          ...newData,
          generations: [...data.generations, ...newData.generations],
        })
      } else {
        setData(newData)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    fetchGenerations(0, false)
  }, [filter])

  const handleLoadMore = () => {
    if (data && data.pagination.hasMore) {
      fetchGenerations(data.pagination.offset + data.pagination.limit, true)
    }
  }

  const handleRefresh = () => {
    fetchGenerations(0, false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="animate-spin text-zinc-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={() => fetchGenerations(0, false)}
          className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  const summary = data?.summary
  const generations = data?.generations || []

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
              <CheckCircle2 size={12} className="text-green-400" />
              <span>Success</span>
            </div>
            <p className="text-lg font-bold text-white">{summary.succeededCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
              <XCircle size={12} className="text-red-400" />
              <span>Failed</span>
            </div>
            <p className="text-lg font-bold text-white">{summary.failedCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mb-1">
              <Activity size={12} className="text-skinny-yellow" />
              <span>Total</span>
            </div>
            <p className="text-lg font-bold text-white">{summary.totalGenerations}</p>
          </div>
        </div>
      )}

      {/* Filter Tabs + Refresh */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 flex-1">
          {(['all', 'succeeded', 'failed', 'pending'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === f
                  ? "bg-skinny-yellow text-black"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              )}
            >
              {f === 'all' ? 'All' : f === 'succeeded' ? 'Success' : f === 'failed' ? 'Failed' : 'Pending'}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Generation List */}
      <div className="space-y-2">
        {generations.length === 0 ? (
          <div className="text-center py-12">
            <ImageIcon size={32} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No generations yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start creating to see your generation history</p>
          </div>
        ) : (
          generations.map((gen) => (
            <GenerationCard key={gen.id} generation={gen} onRefresh={handleRefresh} />
          ))
        )}
      </div>

      {/* Load More */}
      {data?.pagination.hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loadingMore}
          className="w-full py-3 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loadingMore ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Loading...
            </>
          ) : (
            'Load More'
          )}
        </button>
      )}
    </div>
  )
}
