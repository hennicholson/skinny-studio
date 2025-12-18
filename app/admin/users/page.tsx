'use client'

import { useEffect, useState } from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Crown,
  Loader2,
  User as UserIcon,
  Gift,
  X,
  Send,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'
import { motion, AnimatePresence } from 'framer-motion'

interface User {
  id: string
  username: string | null
  email: string | null
  whop_user_id: string
  balance_cents: number
  lifetime_access?: boolean
  created_at: string
  updated_at: string
  generation_count: number
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Gift Modal Component
function GiftModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User
  onClose: () => void
  onSuccess: () => void
}) {
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount) return

    setSending(true)
    try {
      const response = await adminFetch('/api/admin/gifts', {
        method: 'POST',
        body: JSON.stringify({
          recipient_user_id: user.id,
          amount_cents: Math.round(parseFloat(amount) * 100),
          message: message || null,
        }),
      })

      if (response.ok) {
        setSent(true)
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 1500)
      }
    } catch (error) {
      console.error('Failed to send gift:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-md bg-zinc-950 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="p-10 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-skinny-yellow to-skinny-green flex items-center justify-center"
            >
              <Check size={40} className="text-black" />
            </motion.div>
            <h3 className="text-xl font-semibold text-white mb-2">Gift Sent!</h3>
            <p className="text-white/60">
              {formatCurrency(parseFloat(amount) * 100)} sent to @{user.username || 'user'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-skinny-yellow/20 to-skinny-green/20 flex items-center justify-center">
                  <Gift size={18} className="text-skinny-yellow" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Send Gift</h2>
                  <p className="text-sm text-white/40">To @{user.username || 'user'}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSend} className="p-5 space-y-4">
              {/* Amount */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Gift Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full pl-7 pr-3 py-3 bg-black border border-white/[0.08] rounded-lg text-white text-lg placeholder:text-white/30 focus:outline-none focus:border-skinny-yellow/50"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Thanks for being an awesome user!"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-black border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-skinny-yellow/50 resize-none"
                />
              </div>

              {/* Quick amounts */}
              <div className="flex gap-2">
                {[1, 5, 10, 25].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(val.toString())}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                      amount === val.toString()
                        ? "bg-skinny-yellow/10 border-skinny-yellow/30 text-skinny-yellow"
                        : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]"
                    )}
                  >
                    ${val}
                  </button>
                ))}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={sending || !amount}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-skinny-yellow to-skinny-green text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {sending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <Send size={18} />
                    Send Gift
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [adjustingBalance, setAdjustingBalance] = useState<string | null>(null)
  const [balanceInput, setBalanceInput] = useState('')
  const [giftingUser, setGiftingUser] = useState<User | null>(null)

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(searchQuery && { search: searchQuery })
      })

      const response = await adminFetch(`/api/admin/users?${params}`)
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users)
        setTotalPages(data.totalPages)
        setTotal(data.total)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [page])

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1)
      fetchUsers()
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchQuery])

  const handleAdjustBalance = async (userId: string) => {
    const newBalance = parseFloat(balanceInput) * 100
    if (isNaN(newBalance)) return

    try {
      const response = await adminFetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ balance_cents: Math.round(newBalance) })
      })
      if (response.ok) {
        setUsers(prev => prev.map(u =>
          u.id === userId ? { ...u, balance_cents: Math.round(newBalance) } : u
        ))
      }
    } catch (error) {
      console.error('Failed to adjust balance:', error)
    }
    setAdjustingBalance(null)
    setBalanceInput('')
  }

  const toggleLifetime = async (user: User) => {
    try {
      const response = await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ lifetime_access: !user.lifetime_access })
      })
      if (response.ok) {
        setUsers(prev => prev.map(u =>
          u.id === user.id ? { ...u, lifetime_access: !u.lifetime_access } : u
        ))
      }
    } catch (error) {
      console.error('Failed to toggle lifetime:', error)
    }
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Users</h1>
        <p className="text-sm text-white/50 mt-1">{total} total users</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search by username, email, or Whop ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-white/[0.06] rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Users Table */}
      <div className="bg-zinc-950 border border-white/[0.06] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left text-xs text-white/40 font-medium px-4 py-3">User</th>
              <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Balance</th>
              <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Generations</th>
              <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Status</th>
              <th className="text-left text-xs text-white/40 font-medium px-4 py-3">Joined</th>
              <th className="text-right text-xs text-white/40 font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Loader2 className="w-6 h-6 text-skinny-yellow animate-spin mx-auto" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-white/40">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-white/[0.04] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/[0.05] flex items-center justify-center">
                        <UserIcon size={14} className="text-white/40" />
                      </div>
                      <div>
                        <p className="text-sm text-white font-medium">
                          {user.username || 'Unknown'}
                        </p>
                        <p className="text-xs text-white/40 truncate max-w-[200px]">
                          {user.email || user.whop_user_id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {adjustingBalance === user.id ? (
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white/40 text-sm">$</span>
                          <input
                            type="number"
                            value={balanceInput}
                            onChange={(e) => setBalanceInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAdjustBalance(user.id)
                              if (e.key === 'Escape') setAdjustingBalance(null)
                            }}
                            autoFocus
                            step="0.01"
                            className="w-20 pl-5 pr-2 py-1 bg-black border border-white/[0.1] rounded text-white text-sm focus:outline-none focus:border-skinny-yellow"
                          />
                        </div>
                        <button
                          onClick={() => handleAdjustBalance(user.id)}
                          className="px-2 py-1 bg-skinny-yellow text-black rounded text-xs font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setAdjustingBalance(null)}
                          className="px-2 py-1 bg-white/10 text-white rounded text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setAdjustingBalance(user.id)
                          setBalanceInput((user.balance_cents / 100).toFixed(2))
                        }}
                        className="text-sm text-white/80 hover:text-skinny-yellow transition-colors"
                      >
                        {formatCurrency(user.balance_cents)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white/80">{user.generation_count}</p>
                  </td>
                  <td className="px-4 py-3">
                    {user.lifetime_access ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 text-xs font-medium">
                        <Crown size={12} />
                        Lifetime
                      </span>
                    ) : (
                      <span className="text-xs text-white/40">Standard</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-white/60">{formatDate(user.created_at)}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setGiftingUser(user)}
                        className="p-1.5 rounded hover:bg-skinny-yellow/10 text-white/40 hover:text-skinny-yellow transition-colors"
                        title="Send Gift"
                      >
                        <Gift size={14} />
                      </button>
                      <button
                        onClick={() => {
                          setAdjustingBalance(user.id)
                          setBalanceInput((user.balance_cents / 100).toFixed(2))
                        }}
                        className="p-1.5 rounded hover:bg-white/[0.05] text-white/40 hover:text-white transition-colors"
                        title="Adjust Balance"
                      >
                        <DollarSign size={14} />
                      </button>
                      <button
                        onClick={() => toggleLifetime(user)}
                        className={cn(
                          "p-1.5 rounded hover:bg-white/[0.05] transition-colors",
                          user.lifetime_access ? "text-amber-400" : "text-white/40 hover:text-white"
                        )}
                        title={user.lifetime_access ? "Remove Lifetime" : "Grant Lifetime"}
                      >
                        <Crown size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-white/40">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg hover:bg-white/[0.05] text-white/60 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Gift Modal */}
      <AnimatePresence>
        {giftingUser && (
          <GiftModal
            user={giftingUser}
            onClose={() => setGiftingUser(null)}
            onSuccess={() => fetchUsers()}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
