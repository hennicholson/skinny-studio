'use client'

import { ReactNode } from 'react'

interface MasonryGridProps {
  children: ReactNode
}

export function MasonryGrid({ children }: MasonryGridProps) {
  return (
    <div className="masonry-grid">
      {children}
    </div>
  )
}

export function MasonryItem({ children }: { children: ReactNode }) {
  return (
    <div className="masonry-item">
      {children}
    </div>
  )
}
