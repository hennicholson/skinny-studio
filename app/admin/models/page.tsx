'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus,
  Search,
  Image,
  Video,
  Download,
  Loader2,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { adminFetch } from '@/lib/admin-fetch'
import { ModelCard } from '@/components/admin/model-card'
import { MODEL_SPECS, type ModelSpec } from '@/lib/orchestrator/model-specs'
import type { StudioModel, MergedModel } from '@/lib/types/admin'
import { formatCost } from '@/lib/types/admin'

// Merge database models with MODEL_SPECS
function mergeModelsWithSpecs(dbModels: StudioModel[]): MergedModel[] {
  return dbModels.map((dbModel) => {
    // Match by slug or replicate ID
    const spec = MODEL_SPECS.find(
      (s) => s.id === dbModel.slug || s.replicateId === dbModel.replicate_model
    )

    return {
      ...dbModel,
      spec,
      hasSpec: !!spec,
    }
  })
}

// Generate export markdown for Claude collaboration
function generateExportMarkdown(models: MergedModel[]): string {
  const date = new Date().toISOString().split('T')[0]

  const formatCapabilities = (spec: ModelSpec) => {
    const caps = Object.entries(spec.capabilities || {})
      .filter(([, v]) => v)
      .map(([k, v]) => {
        if (k === 'supportsReferenceImages' && spec.maxReferenceImages) {
          return `- ${k}: true (max ${spec.maxReferenceImages} via ${spec.imageInputParam})`
        }
        return `- ${k}: ${v}`
      })
    return caps.length > 0 ? caps.join('\n') : '- Standard capabilities'
  }

  const formatParams = (spec: ModelSpec) => {
    const allParams = [...spec.params.required, ...spec.params.optional]
    return allParams
      .map((p) => {
        const required = spec.params.required.includes(p) ? ', REQUIRED' : ''
        const options = p.options ? ` [${p.options.slice(0, 5).join(', ')}${p.options.length > 5 ? '...' : ''}]` : ''
        const def = p.default !== undefined ? ` (default: ${p.default})` : ''
        const range = p.range ? ` (range: ${p.range.min}-${p.range.max})` : ''
        return `- ${p.name} (${p.type}${required}): ${p.description}${options}${def}${range}`
      })
      .join('\n')
  }

  const imageModels = models.filter((m) => m.category === 'image')
  const videoModels = models.filter((m) => m.category === 'video')

  const formatModelSection = (model: MergedModel) => {
    if (!model.spec) {
      return `### ${model.name}
- **Replicate ID**: ${model.replicate_model}
- **DB Status**: ${model.is_active ? 'Active' : 'Inactive'} | ${formatCost(model)}
- **WARNING**: No orchestrator spec found - add to model-specs.ts

---`
    }

    return `### ${model.name}
- **Replicate ID**: ${model.replicate_model}
- **DB Status**: ${model.is_active ? 'Active' : 'Inactive'} | ${formatCost(model)}
- **Type**: ${model.spec.type}

**Capabilities**:
${formatCapabilities(model.spec)}

**Parameters**:
${formatParams(model.spec)}

**When to Use**: ${model.spec.whenToUse}

**Tips**:
${model.spec.tips?.map((t) => `- ${t}`).join('\n') || '- No tips available'}

---`
  }

  return `# Skinny Studio Model Configuration
Last updated: ${date}

## Image Models (${imageModels.length})

${imageModels.map(formatModelSection).join('\n\n')}

## Video Models (${videoModels.length})

${videoModels.map(formatModelSection).join('\n\n')}

---
*Generated from admin dashboard for Claude collaboration*
`
}

export default function ModelsPage() {
  const [models, setModels] = useState<StudioModel[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [expandedSection, setExpandedSection] = useState<'image' | 'video' | 'both'>('both')
  const [copied, setCopied] = useState(false)

  const fetchModels = async () => {
    try {
      const response = await adminFetch('/api/admin/models')
      if (response.ok) {
        const data = await response.json()
        setModels(data.models)
      }
    } catch (error) {
      console.error('Failed to fetch models:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchModels()
  }, [])

  const toggleActive = async (model: StudioModel) => {
    setTogglingId(model.id)
    try {
      const response = await adminFetch(`/api/admin/models/${model.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !model.is_active }),
      })
      if (response.ok) {
        setModels((prev) =>
          prev.map((m) =>
            m.id === model.id ? { ...m, is_active: !m.is_active } : m
          )
        )
      }
    } catch (error) {
      console.error('Failed to toggle model:', error)
    } finally {
      setTogglingId(null)
    }
  }

  const deleteModel = async (model: StudioModel) => {
    if (!confirm(`Are you sure you want to delete "${model.name}"?`)) return

    try {
      const response = await adminFetch(`/api/admin/models/${model.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        setModels((prev) => prev.filter((m) => m.id !== model.id))
      }
    } catch (error) {
      console.error('Failed to delete model:', error)
    }
  }

  const mergedModels = useMemo(() => mergeModelsWithSpecs(models), [models])

  const filteredModels = useMemo(() => {
    return mergedModels.filter(
      (m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.replicate_model.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [mergedModels, searchQuery])

  const imageModels = filteredModels.filter((m) => m.category === 'image')
  const videoModels = filteredModels.filter((m) => m.category === 'video')

  const handleExport = async () => {
    const markdown = generateExportMarkdown(mergedModels)

    try {
      await navigator.clipboard.writeText(markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: download as file
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `skinny-models-config-${new Date().toISOString().split('T')[0]}.md`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-800 rounded w-48" />
          <div className="h-12 bg-zinc-800 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-zinc-800 rounded" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 min-h-screen overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Models</h1>
          <p className="text-sm text-white/50 mt-1">
            {models.length} total, {models.filter((m) => m.is_active).length} active
            {mergedModels.filter((m) => !m.hasSpec).length > 0 && (
              <span className="text-orange-400 ml-2">
                ({mergedModels.filter((m) => !m.hasSpec).length} missing specs)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-white/[0.06] text-white rounded-lg font-medium text-sm hover:bg-zinc-700 transition-colors"
          >
            {copied ? (
              <>
                <Check size={16} className="text-green-400" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={16} />
                Export Config
              </>
            )}
          </button>
          <Link
            href="/admin/models/new"
            className="flex items-center gap-2 px-4 py-2 bg-skinny-yellow text-black rounded-lg font-medium text-sm hover:bg-skinny-yellow/90 transition-colors"
          >
            <Plus size={18} />
            Add Model
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-zinc-950 border border-white/[0.06] rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/20"
        />
      </div>

      {/* Image Models */}
      <div className="mb-8">
        <button
          onClick={() =>
            setExpandedSection((prev) =>
              prev === 'image' ? 'both' : prev === 'both' ? 'video' : 'both'
            )
          }
          className="flex items-center gap-2 mb-3 group"
        >
          <div className="flex items-center gap-2">
            <Image size={16} className="text-skinny-yellow" />
            <h2 className="text-sm font-medium text-white">
              Image Models ({imageModels.length})
            </h2>
          </div>
          <div className="text-white/40 group-hover:text-white/60 transition-colors">
            {expandedSection === 'video' ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )}
          </div>
        </button>

        {expandedSection !== 'video' && (
          <div className="space-y-3">
            {imageModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onToggle={toggleActive}
                onDelete={deleteModel}
                togglingId={togglingId}
              />
            ))}
            {imageModels.length === 0 && (
              <div className="p-8 text-center text-sm text-white/40 bg-zinc-950 border border-white/[0.06] rounded-xl">
                No image models found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Video Models */}
      <div>
        <button
          onClick={() =>
            setExpandedSection((prev) =>
              prev === 'video' ? 'both' : prev === 'both' ? 'image' : 'both'
            )
          }
          className="flex items-center gap-2 mb-3 group"
        >
          <div className="flex items-center gap-2">
            <Video size={16} className="text-purple-400" />
            <h2 className="text-sm font-medium text-white">
              Video Models ({videoModels.length})
            </h2>
          </div>
          <div className="text-white/40 group-hover:text-white/60 transition-colors">
            {expandedSection === 'image' ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )}
          </div>
        </button>

        {expandedSection !== 'image' && (
          <div className="space-y-3">
            {videoModels.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onToggle={toggleActive}
                onDelete={deleteModel}
                togglingId={togglingId}
              />
            ))}
            {videoModels.length === 0 && (
              <div className="p-8 text-center text-sm text-white/40 bg-zinc-950 border border-white/[0.06] rounded-xl">
                No video models found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
