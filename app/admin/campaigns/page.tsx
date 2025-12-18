'use client'

import { useEffect, useState } from 'react'
import {
  Plus,
  Loader2,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Edit2,
  X,
  DollarSign,
  Users,
  Sparkles,
  Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'
import { motion, AnimatePresence } from 'framer-motion'

interface Campaign {
  id: string
  name: string
  description: string | null
  credit_amount_cents: number
  is_active: boolean
  applies_to: 'new_users' | 'all_users'
  created_at: string
  grants_count: number
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function CampaignCard({
  campaign,
  onToggle,
  onEdit,
  onDelete,
}: {
  campaign: Campaign
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "relative bg-zinc-950 border rounded-xl p-5 transition-all",
        campaign.is_active
          ? "border-skinny-yellow/30 shadow-[0_0_20px_rgba(234,179,8,0.1)]"
          : "border-white/[0.06]"
      )}
    >
      {/* Active indicator */}
      {campaign.is_active && (
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-skinny-yellow opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-skinny-yellow"></span>
          </span>
          <span className="text-[10px] text-skinny-yellow font-medium uppercase tracking-wider">Live</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          campaign.is_active
            ? "bg-gradient-to-br from-skinny-yellow/20 to-skinny-green/20"
            : "bg-white/[0.03]"
        )}>
          <Sparkles size={18} className={campaign.is_active ? "text-skinny-yellow" : "text-white/40"} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{campaign.name}</h3>
          {campaign.description && (
            <p className="text-sm text-white/40 mt-0.5 line-clamp-2">{campaign.description}</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white/[0.02] rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-white/40 mb-1">
            <DollarSign size={12} />
            <span className="text-[10px] uppercase tracking-wider">Amount</span>
          </div>
          <p className="text-lg font-semibold text-white">{formatCurrency(campaign.credit_amount_cents)}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-white/40 mb-1">
            <Users size={12} />
            <span className="text-[10px] uppercase tracking-wider">Granted</span>
          </div>
          <p className="text-lg font-semibold text-white">{campaign.grants_count}</p>
        </div>
        <div className="bg-white/[0.02] rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-white/40 mb-1">
            <Sparkles size={12} />
            <span className="text-[10px] uppercase tracking-wider">Applies To</span>
          </div>
          <p className="text-sm font-medium text-white">
            {campaign.applies_to === 'new_users' ? 'New Users' : 'All Users'}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
        <button
          onClick={onToggle}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
            campaign.is_active
              ? "bg-skinny-yellow/10 text-skinny-yellow hover:bg-skinny-yellow/20"
              : "bg-white/[0.03] text-white/60 hover:bg-white/[0.06] hover:text-white"
          )}
        >
          {campaign.is_active ? (
            <>
              <ToggleRight size={16} />
              Active
            </>
          ) : (
            <>
              <ToggleLeft size={16} />
              Inactive
            </>
          )}
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function CreateEditModal({
  campaign,
  onClose,
  onSave,
}: {
  campaign?: Campaign | null
  onClose: () => void
  onSave: (data: Partial<Campaign>) => Promise<void>
}) {
  const [name, setName] = useState(campaign?.name || '')
  const [description, setDescription] = useState(campaign?.description || '')
  const [amount, setAmount] = useState(campaign ? (campaign.credit_amount_cents / 100).toFixed(2) : '')
  const [appliesTo, setAppliesTo] = useState<'new_users' | 'all_users'>(campaign?.applies_to || 'new_users')
  const [isActive, setIsActive] = useState(campaign?.is_active || false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !amount) return

    setSaving(true)
    try {
      await onSave({
        name,
        description: description || null,
        credit_amount_cents: Math.round(parseFloat(amount) * 100),
        applies_to: appliesTo,
        is_active: isActive,
      })
      onClose()
    } catch (error) {
      console.error('Failed to save campaign:', error)
    } finally {
      setSaving(false)
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
        className="w-full max-w-md bg-zinc-950 border border-white/[0.08] rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <h2 className="text-lg font-semibold text-white">
            {campaign ? 'Edit Campaign' : 'Create Campaign'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Campaign Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Welcome Bonus"
              className="w-full px-3 py-2.5 bg-black border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-skinny-yellow/50"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this campaign..."
              rows={2}
              className="w-full px-3 py-2.5 bg-black border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-skinny-yellow/50 resize-none"
            />
          </div>

          {/* Credit Amount */}
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Credit Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.01"
                min="0"
                className="w-full pl-7 pr-3 py-2.5 bg-black border border-white/[0.08] rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-skinny-yellow/50"
                required
              />
            </div>
          </div>

          {/* Applies To */}
          <div>
            <label className="block text-sm text-white/60 mb-1.5">Applies To</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAppliesTo('new_users')}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border",
                  appliesTo === 'new_users'
                    ? "bg-skinny-yellow/10 border-skinny-yellow/30 text-skinny-yellow"
                    : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]"
                )}
              >
                New Users Only
              </button>
              <button
                type="button"
                onClick={() => setAppliesTo('all_users')}
                className={cn(
                  "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all border",
                  appliesTo === 'all_users'
                    ? "bg-skinny-yellow/10 border-skinny-yellow/30 text-skinny-yellow"
                    : "bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]"
                )}
              >
                All Users
              </button>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-white/60">Activate immediately</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                isActive ? "bg-skinny-yellow" : "bg-white/10"
              )}
            >
              <motion.div
                animate={{ x: isActive ? 22 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm"
              />
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !name || !amount}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-skinny-yellow to-skinny-green text-black font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <Check size={18} />
                {campaign ? 'Save Changes' : 'Create Campaign'}
              </>
            )}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)

  const fetchCampaigns = async () => {
    try {
      const response = await adminFetch('/api/admin/campaigns')
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleCreate = async (data: Partial<Campaign>) => {
    const response = await adminFetch('/api/admin/campaigns', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (response.ok) {
      await fetchCampaigns()
    }
  }

  const handleUpdate = async (id: string, data: Partial<Campaign>) => {
    const response = await adminFetch(`/api/admin/campaigns/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
    if (response.ok) {
      await fetchCampaigns()
    }
  }

  const handleToggle = async (campaign: Campaign) => {
    await handleUpdate(campaign.id, { is_active: !campaign.is_active })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign?')) return

    const response = await adminFetch(`/api/admin/campaigns/${id}`, {
      method: 'DELETE',
    })
    if (response.ok) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    }
  }

  const activeCampaign = campaigns.find((c) => c.is_active)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-white">Credit Campaigns</h1>
          <p className="text-sm text-white/50 mt-1">
            Manage promotional credit campaigns for users
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCampaign(null)
            setShowModal(true)
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-skinny-yellow to-skinny-green text-black font-medium hover:opacity-90 transition-opacity"
        >
          <Plus size={18} />
          New Campaign
        </button>
      </div>

      {/* Active Campaign Banner */}
      {activeCampaign && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 rounded-xl bg-gradient-to-r from-skinny-yellow/10 to-skinny-green/10 border border-skinny-yellow/20"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-skinny-yellow/20 flex items-center justify-center">
              <Sparkles size={18} className="text-skinny-yellow" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-white/60">Active Campaign</p>
              <p className="text-white font-medium">
                {activeCampaign.name} — {formatCurrency(activeCampaign.credit_amount_cents)} for {activeCampaign.applies_to === 'new_users' ? 'new users' : 'all users'}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Campaigns Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-skinny-yellow animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/[0.03] flex items-center justify-center">
            <Sparkles size={24} className="text-white/20" />
          </div>
          <h3 className="text-white font-medium mb-1">No campaigns yet</h3>
          <p className="text-sm text-white/40">Create your first campaign to reward users with credits</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {campaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onToggle={() => handleToggle(campaign)}
                onEdit={() => {
                  setEditingCampaign(campaign)
                  setShowModal(true)
                }}
                onDelete={() => handleDelete(campaign.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <CreateEditModal
            campaign={editingCampaign}
            onClose={() => {
              setShowModal(false)
              setEditingCampaign(null)
            }}
            onSave={async (data) => {
              if (editingCampaign) {
                await handleUpdate(editingCampaign.id, data)
              } else {
                await handleCreate(data)
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
