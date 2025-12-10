'use client'

import { Generation } from '@/lib/mock-data'
import { EmptyState } from './empty-state'
import { GenerationCard } from '@/components/ui/generation-card'
import { MasonryGrid, MasonryItem } from '@/components/ui/masonry-grid'

interface GenerateViewProps {
  generations: Generation[]
  onQuickAction: (prompt: string) => void
  onSaveToWorkflow?: (id: string) => void
  onShare?: (id: string) => void
}

export function GenerateView({
  generations,
  onQuickAction,
  onSaveToWorkflow,
  onShare
}: GenerateViewProps) {
  if (generations.length === 0) {
    return <EmptyState onQuickAction={onQuickAction} />
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto">
        <MasonryGrid>
          {generations.map((generation) => (
            <MasonryItem key={generation.id}>
              <GenerationCard
                generation={generation}
                onSaveToWorkflow={onSaveToWorkflow}
                onShare={onShare}
              />
            </MasonryItem>
          ))}
        </MasonryGrid>
      </div>
    </div>
  )
}
