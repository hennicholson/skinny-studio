// Local types shared across the canvas components.

import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react'
import { CanvasNode, NodeType } from '@/lib/canvas/ir'

export type CanvasRFNode = RFNode<CanvasNode['data'] & { nodeType: NodeType }>
export type CanvasRFEdge = RFEdge

export interface StudioModelLite {
  slug: string
  name: string
  category: 'image' | 'video'
  pricing_type: 'per_run' | 'per_second'
  cost_per_run_cents?: number
  cost_per_second_cents?: number
  resolution_multipliers?: Record<string, number>
  parameter_schema?: any
}
