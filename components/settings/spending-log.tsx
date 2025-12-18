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
  DollarSign,
  Filter,
  TrendingDown,
  TrendingUp,
  Activity,
  Calendar,
  ExternalLink
} from 'lucide-react'
import Image from 'next/image'

interface TransactionMetadata {
  model?: string
  model_name?: string
  prompt?: string
  params?: Record<string, any>
  category?: string
  pricing_type?: string
  duration?: number
  resolution?: string
  cost_per_second_cents?: number
  resolution_multiplier?: number
  is_lifetime_user?: boolean
  // Sequential generation fields
  images_generated?: number
  sequential_mode?: boolean
  cost_per_image_cents?: number
  total_cost_cents?: number
}

interface Transaction {
  id: string
  user_id: string
  type: string
  task: string
  amount: number
  amount_charged: number
  status: string
  preview?: string
  metadata?: TransactionMetadata
  created_at: string
}

interface TransactionSummary {
  totalSpentCents: number
  totalAddedCents: number
  imageGenerations: number
  videoGenerations: number
  totalGenerations: number
}

interface TransactionsResponse {
  transactions: Transaction[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  summary: TransactionSummary
}

function formatDollars(dollars: number): string {
  // Database stores amount in dollars (e.g., 0.14 for 14 cents)
  return Math.abs(dollars).toFixed(2)
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

function TransactionCard({ transaction }: { transaction: Transaction }) {
  const [expanded, setExpanded] = useState(false)
  const isUsage = transaction.type === 'usage'
  const isVideo = transaction.task === 'video_generation' || transaction.metadata?.category === 'video'

  const metadata = transaction.metadata || {}
  const modelName = metadata.model_name || metadata.model || 'Unknown Model'

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
          {transaction.preview ? (
            <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-zinc-800">
              <Image
                src={transaction.preview}
                alt="Generation preview"
                fill
                className="object-cover"
                sizes="48px"
              />
            </div>
          ) : (
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
              isUsage ? "bg-red-500/10" : "bg-green-500/10"
            )}>
              {isVideo ? (
                <Video size={20} className={isUsage ? "text-red-400" : "text-green-400"} />
              ) : (
                <ImageIcon size={20} className={isUsage ? "text-red-400" : "text-green-400"} />
              )}
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-white text-sm truncate">
                {isUsage ? modelName : 'Credit Top-up'}
              </span>
              {isVideo && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
                  Video
                </span>
              )}
              {!isVideo && metadata.images_generated && metadata.images_generated > 1 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-skinny-yellow/20 text-skinny-yellow">
                  {metadata.images_generated} images
                </span>
              )}
              {isUsage && metadata?.is_lifetime_user && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400">
                  Lifetime
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
              <Clock size={12} />
              <span>{formatDate(transaction.created_at)}</span>
              {metadata.duration && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span>{metadata.duration}s @ {metadata.resolution || '720p'}</span>
                </>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <div className={cn(
              "font-bold",
              isUsage && metadata?.is_lifetime_user ? "text-green-400" :
              isUsage ? "text-red-400" : "text-green-400"
            )}>
              {isUsage && metadata?.is_lifetime_user ? (
                'FREE'
              ) : (
                <>{isUsage ? '-' : '+'}${formatDollars(transaction.amount_charged || Math.abs(transaction.amount))}</>
              )}
            </div>
            {metadata.pricing_type === 'per_second' && metadata.cost_per_second_cents && !metadata.is_lifetime_user && (
              <div className="text-[10px] text-zinc-600">
                {metadata.cost_per_second_cents}c/s
              </div>
            )}
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
              {/* Prompt */}
              {metadata.prompt && (
                <div>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Prompt</span>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-3">{metadata.prompt}</p>
                </div>
              )}

              {/* Video Pricing Breakdown */}
              {metadata.pricing_type === 'per_second' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Duration</span>
                    <p className="text-sm text-white font-medium">{metadata.duration}s</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Resolution</span>
                    <p className="text-sm text-white font-medium">{metadata.resolution || 'Default'}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Rate</span>
                    <p className="text-sm text-white font-medium">{metadata.cost_per_second_cents}c/sec</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Multiplier</span>
                    <p className="text-sm text-white font-medium">{metadata.resolution_multiplier || 1.0}x</p>
                  </div>
                </div>
              )}

              {/* Sequential Generation Breakdown */}
              {metadata.sequential_mode && metadata.images_generated && metadata.images_generated > 1 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Images Generated</span>
                    <p className="text-sm text-white font-medium">{metadata.images_generated}</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-2">
                    <span className="text-[10px] text-zinc-600 uppercase">Cost Per Image</span>
                    <p className="text-sm text-white font-medium">{metadata.cost_per_image_cents}c</p>
                  </div>
                </div>
              )}

              {/* View Output Button */}
              {transaction.preview && (
                <a
                  href={transaction.preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-skinny-yellow/10 border border-skinny-yellow/30 text-skinny-yellow text-xs font-medium hover:bg-skinny-yellow/20 transition-colors"
                >
                  <ExternalLink size={14} />
                  View Full Output
                </a>
              )}

              {/* Transaction ID */}
              <div className="flex items-center justify-between text-[10px] text-zinc-600">
                <span>ID: {transaction.id.slice(0, 8)}...</span>
                <span>{new Date(transaction.created_at).toLocaleString()}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function SpendingLog() {
  const [data, setData] = useState<TransactionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<'all' | 'usage' | 'topup'>('all')
  const [error, setError] = useState<string | null>(null)

  const fetchTransactions = async (offset = 0, append = false) => {
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
      if (filter !== 'all') {
        params.set('type', filter)
      }

      const res = await fetch(`/api/users/transactions?${params}`, { headers })

      if (!res.ok) {
        throw new Error('Failed to fetch transactions')
      }

      const newData: TransactionsResponse = await res.json()

      if (append && data) {
        setData({
          ...newData,
          transactions: [...data.transactions, ...newData.transactions],
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
    fetchTransactions(0, false)
  }, [filter])

  const handleLoadMore = () => {
    if (data && data.pagination.hasMore) {
      fetchTransactions(data.pagination.offset + data.pagination.limit, true)
    }
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
          onClick={() => fetchTransactions(0, false)}
          className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
        >
          Try again
        </button>
      </div>
    )
  }

  const summary = data?.summary
  const transactions = data?.transactions || []

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <TrendingDown size={14} className="text-red-400" />
              <span>Total Spent</span>
            </div>
            <p className="text-xl font-bold text-white">${formatDollars(summary.totalSpentCents)}</p>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
              <Activity size={14} className="text-skinny-yellow" />
              <span>Generations</span>
            </div>
            <p className="text-xl font-bold text-white">{summary.totalGenerations}</p>
            <p className="text-[10px] text-zinc-600">
              {summary.imageGenerations} images | {summary.videoGenerations} videos
            </p>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['all', 'usage', 'topup'] as const).map((f) => (
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
            {f === 'all' ? 'All' : f === 'usage' ? 'Spending' : 'Top-ups'}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="space-y-2">
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <DollarSign size={32} className="mx-auto text-zinc-700 mb-3" />
            <p className="text-sm text-zinc-500">No transactions yet</p>
            <p className="text-xs text-zinc-600 mt-1">Start generating to see your spending history</p>
          </div>
        ) : (
          transactions.map((tx) => (
            <TransactionCard key={tx.id} transaction={tx} />
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
