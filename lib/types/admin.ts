import type { ModelSpec } from '@/lib/orchestrator/model-specs'

export interface StudioModel {
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
  created_at?: string
}

export interface MergedModel extends StudioModel {
  spec?: ModelSpec
  hasSpec: boolean
}

export function formatCost(model: StudioModel): string {
  if (model.pricing_type === 'per_second') {
    return `$${((model.cost_per_second_cents || 0) / 100).toFixed(3)}/sec`
  }
  return `$${((model.cost_per_run_cents || 0) / 100).toFixed(2)}/run`
}
