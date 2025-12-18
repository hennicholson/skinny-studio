'use client'

import { useState, useCallback, useRef } from 'react'

// Types for drag and drop state
export interface DragItem {
  id: string
  type: 'generation' | 'folder'
  sourceFolderId: string | null // null = desktop
}

export interface DropTarget {
  id: string | null // folder id or null for desktop
  type: 'folder' | 'tab' | 'desktop'
}

interface DragState {
  // Current drag state
  isDragging: boolean
  dragItem: DragItem | null
  dropTarget: DropTarget | null

  // Position for drag overlay
  dragPosition: { x: number; y: number }

  // Preview data for overlay
  previewUrl: string | null
}

interface UseDragStateReturn extends DragState {
  // Start dragging an item
  startDrag: (item: DragItem, previewUrl?: string) => void

  // Update drag position (for overlay)
  updatePosition: (x: number, y: number) => void

  // Set current drop target (on hover)
  setDropTarget: (target: DropTarget | null) => void

  // End drag operation
  endDrag: () => void

  // Check if a target is valid drop zone
  isValidDropTarget: (targetFolderId: string | null) => boolean

  // Get drag event handlers for draggable items
  getDragHandlers: (item: DragItem, previewUrl?: string) => {
    draggable: true
    onDragStart: (e: React.DragEvent) => void
    onDragEnd: (e: React.DragEvent) => void
  }

  // Get drop event handlers for drop zones
  getDropHandlers: (target: DropTarget, onDrop: (item: DragItem) => void) => {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}

const initialState: DragState = {
  isDragging: false,
  dragItem: null,
  dropTarget: null,
  dragPosition: { x: 0, y: 0 },
  previewUrl: null,
}

export function useDragState(): UseDragStateReturn {
  const [state, setState] = useState<DragState>(initialState)
  const dragItemRef = useRef<DragItem | null>(null)

  const startDrag = useCallback((item: DragItem, previewUrl?: string) => {
    dragItemRef.current = item
    setState({
      isDragging: true,
      dragItem: item,
      dropTarget: null,
      dragPosition: { x: 0, y: 0 },
      previewUrl: previewUrl || null,
    })
  }, [])

  const updatePosition = useCallback((x: number, y: number) => {
    setState(prev => ({
      ...prev,
      dragPosition: { x, y },
    }))
  }, [])

  const setDropTarget = useCallback((target: DropTarget | null) => {
    setState(prev => ({
      ...prev,
      dropTarget: target,
    }))
  }, [])

  const endDrag = useCallback(() => {
    dragItemRef.current = null
    setState(initialState)
  }, [])

  // Check if dropping on this target is valid
  // Can't drop on the folder it's already in
  const isValidDropTarget = useCallback((targetFolderId: string | null): boolean => {
    const item = dragItemRef.current
    if (!item) return false

    // Can't drop folder onto itself
    if (item.type === 'folder' && item.id === targetFolderId) return false

    // Can't drop item into the folder it's already in
    if (item.sourceFolderId === targetFolderId) return false

    return true
  }, [])

  // Helper to get drag handlers for draggable items
  const getDragHandlers = useCallback((item: DragItem, previewUrl?: string) => ({
    draggable: true as const,
    onDragStart: (e: React.DragEvent) => {
      // Set drag data for cross-component communication
      e.dataTransfer.setData('application/json', JSON.stringify(item))
      e.dataTransfer.effectAllowed = 'move'

      // Use a small delay to ensure state updates after render
      setTimeout(() => startDrag(item, previewUrl), 0)
    },
    onDragEnd: (_e: React.DragEvent) => {
      endDrag()
    },
  }), [startDrag, endDrag])

  // Helper to get drop handlers for drop zones
  const getDropHandlers = useCallback((target: DropTarget, onDrop: (item: DragItem) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      // Check if we can drop here
      const itemData = e.dataTransfer.types.includes('application/json')
      if (!itemData) return

      // Validate drop target
      if (isValidDropTarget(target.id)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      if (isValidDropTarget(target.id)) {
        setDropTarget(target)
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      // Only clear if actually leaving (not entering a child)
      const relatedTarget = e.relatedTarget as Node
      if (!e.currentTarget.contains(relatedTarget)) {
        setDropTarget(null)
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()

      try {
        const data = e.dataTransfer.getData('application/json')
        if (data) {
          const item: DragItem = JSON.parse(data)
          if (isValidDropTarget(target.id)) {
            onDrop(item)
          }
        }
      } catch (err) {
        console.error('Failed to parse drag data:', err)
      }

      endDrag()
    },
  }), [isValidDropTarget, setDropTarget, endDrag])

  return {
    ...state,
    startDrag,
    updatePosition,
    setDropTarget,
    endDrag,
    isValidDropTarget,
    getDragHandlers,
    getDropHandlers,
  }
}
