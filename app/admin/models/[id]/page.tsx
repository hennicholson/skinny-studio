'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Loader2,
  Image,
  Video
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'

interface StudioModel {
  id: string
  name: string
  slug: string
  category: string
  replicate_model: string
  is_active: boolean
  cost_per_run_cents?: number
  cost_per_second_cents?: number
  pricing_type: string
  sort_order: number
  default_parameters?: Record<string, any>
  parameter_schema?: Record<string, any>
  duration_options?: number[]
  resolution_options?: string[]
  max_duration?: number
  resolution_multipliers?: Record<string, number>
  audio_cost_cents?: number
}

export default function EditModelPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [model, setModel] = useState<StudioModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [category, setCategory] = useState<'image' | 'video'>('image')
  const [replicateModel, setReplicateModel] = useState('')
  const [pricingType, setPricingType] = useState<'per_run' | 'per_second'>('per_run')
  const [costPerRunCents, setCostPerRunCents] = useState(0)
  const [costPerSecondCents, setCostPerSecondCents] = useState(0)
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [defaultParameters, setDefaultParameters] = useState('')
  const [parameterSchema, setParameterSchema] = useState('')

  useEffect(() => {
    const fetchModel = async () => {
      try {
        const response = await adminFetch(`/api/admin/models/${id}`)
        if (response.ok) {
          const data = await response.json()
          const m = data.model
          setModel(m)
          setName(m.name)
          setSlug(m.slug)
          setCategory(m.category)
          setReplicateModel(m.replicate_model)
          setPricingType(m.pricing_type)
          setCostPerRunCents(m.cost_per_run_cents || 0)
          setCostPerSecondCents(m.cost_per_second_cents || 0)
          setSortOrder(m.sort_order)
          setIsActive(m.is_active)
          setDefaultParameters(m.default_parameters ? JSON.stringify(m.default_parameters, null, 2) : '')
          setParameterSchema(m.parameter_schema ? JSON.stringify(m.parameter_schema, null, 2) : '')
        } else {
          setError('Model not found')
        }
      } catch (error) {
        console.error('Failed to fetch model:', error)
        setError('Failed to load model')
      } finally {
        setLoading(false)
      }
    }
    fetchModel()
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      let parsedDefaultParams = null
      let parsedSchema = null

      if (defaultParameters.trim()) {
        try {
          parsedDefaultParams = JSON.parse(defaultParameters)
        } catch {
          setError('Invalid JSON in default parameters')
          setSaving(false)
          return
        }
      }

      if (parameterSchema.trim()) {
        try {
          parsedSchema = JSON.parse(parameterSchema)
        } catch {
          setError('Invalid JSON in parameter schema')
          setSaving(false)
          return
        }
      }

      const response = await adminFetch(`/api/admin/models/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          slug,
          category,
          replicate_model: replicateModel,
          pricing_type: pricingType,
          cost_per_run_cents: pricingType === 'per_run' ? costPerRunCents : null,
          cost_per_second_cents: pricingType === 'per_second' ? costPerSecondCents : null,
          sort_order: sortOrder,
          is_active: isActive,
          default_parameters: parsedDefaultParams,
          parameter_schema: parsedSchema,
        })
      })

      if (response.ok) {
        router.push('/admin/models')
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to save model')
      }
    } catch (error) {
      console.error('Failed to save model:', error)
      setError('Failed to save model')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-skinny-yellow animate-spin" />
      </div>
    )
  }

  if (!model) {
    return (
      <div className="p-8">
        <p className="text-red-400">{error || 'Model not found'}</p>
        <Link href="/admin/models" className="text-skinny-yellow mt-4 inline-block">
          Back to Models
        </Link>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/admin/models"
          className="p-2 rounded-lg hover:bg-white/[0.05] text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-white">Edit Model</h1>
          <p className="text-sm text-white/50 mt-1">{model.name}</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Basic Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Slug</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-white/50 mb-1.5">Replicate Model</label>
              <input
                type="text"
                value={replicateModel}
                onChange={(e) => setReplicateModel(e.target.value)}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-white/20"
                placeholder="owner/model:version"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Category</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCategory('image')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    category === 'image'
                      ? "bg-skinny-yellow/10 text-skinny-yellow border border-skinny-yellow/30"
                      : "bg-white/[0.03] text-white/60 border border-white/[0.06] hover:bg-white/[0.05]"
                  )}
                >
                  <Image size={16} />
                  Image
                </button>
                <button
                  onClick={() => setCategory('video')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    category === 'video'
                      ? "bg-skinny-yellow/10 text-skinny-yellow border border-skinny-yellow/30"
                      : "bg-white/[0.03] text-white/60 border border-white/[0.06] hover:bg-white/[0.05]"
                  )}
                >
                  <Video size={16} />
                  Video
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Sort Order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
              />
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Pricing</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Pricing Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPricingType('per_run')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    pricingType === 'per_run'
                      ? "bg-skinny-yellow/10 text-skinny-yellow border border-skinny-yellow/30"
                      : "bg-white/[0.03] text-white/60 border border-white/[0.06] hover:bg-white/[0.05]"
                  )}
                >
                  Per Run
                </button>
                <button
                  onClick={() => setPricingType('per_second')}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                    pricingType === 'per_second'
                      ? "bg-skinny-yellow/10 text-skinny-yellow border border-skinny-yellow/30"
                      : "bg-white/[0.03] text-white/60 border border-white/[0.06] hover:bg-white/[0.05]"
                  )}
                >
                  Per Second
                </button>
              </div>
            </div>
            {pricingType === 'per_run' ? (
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Cost (cents per run)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                  <input
                    type="number"
                    value={(costPerRunCents / 100).toFixed(2)}
                    onChange={(e) => setCostPerRunCents(Math.round(parseFloat(e.target.value) * 100) || 0)}
                    step="0.01"
                    className="w-full pl-7 pr-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Cost (cents per second)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">$</span>
                  <input
                    type="number"
                    value={(costPerSecondCents / 100).toFixed(3)}
                    onChange={(e) => setCostPerSecondCents(Math.round(parseFloat(e.target.value) * 100) || 0)}
                    step="0.001"
                    className="w-full pl-7 pr-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Advanced */}
        <div className="bg-zinc-950 border border-white/[0.06] rounded-xl p-6">
          <h2 className="text-sm font-medium text-white mb-4">Advanced</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Default Parameters (JSON)</label>
              <textarea
                value={defaultParameters}
                onChange={(e) => setDefaultParameters(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-white/20"
                placeholder="{}"
              />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Parameter Schema (JSON)</label>
              <textarea
                value={parameterSchema}
                onChange={(e) => setParameterSchema(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-black border border-white/[0.08] rounded-lg text-white text-sm font-mono focus:outline-none focus:border-white/20"
                placeholder="{}"
              />
            </div>
          </div>
        </div>

        {/* Status & Actions */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only"
            />
            <div className={cn(
              "w-10 h-6 rounded-full transition-colors relative",
              isActive ? "bg-skinny-yellow" : "bg-white/20"
            )}>
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                isActive ? "left-5" : "left-1"
              )} />
            </div>
            <span className="text-sm text-white/80">Active</span>
          </label>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-skinny-yellow text-black rounded-lg font-medium text-sm hover:bg-skinny-yellow/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
