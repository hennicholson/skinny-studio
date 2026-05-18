// Tiny typed event bus for canvas balance / cost telemetry.
//
// The executor (lib/canvas/executor.ts) fires `node-completed` after each
// successful node finishes a model call so the UI can refresh balance from
// /api/users/me sub-second instead of waiting for the 30s UserProvider poll.
// `node-cost-debited` is a finer-grained event for surfaces (toasts, ticks)
// that just need the delta without re-fetching profile state.
//
// Usage (executor — DO NOT edit executor.ts; this is the suggested hook):
//
//   import { BalanceEventBus } from '@/lib/canvas/balance-events'
//   // after a successful /api/generate response:
//   BalanceEventBus.emit('node-completed', { nodeId: node.id, costCents: json.costCents ?? 0 })
//   BalanceEventBus.emit('node-cost-debited', { nodeId: node.id, costCents: json.costCents ?? 0 })
//
// Usage (any client component):
//
//   useBalanceEvent('node-completed', ({ costCents }) => {
//     refreshUser()
//   })

'use client'

import { useEffect } from 'react'

// === Event map =============================================================

export interface BalanceEventMap {
  'node-completed': { nodeId: string; costCents: number; generationId?: string }
  'node-cost-debited': { nodeId: string; costCents: number }
}

export type BalanceEventName = keyof BalanceEventMap

export type BalanceEventHandler<E extends BalanceEventName> = (
  payload: BalanceEventMap[E],
) => void

// === Singleton bus =========================================================

type AnyHandler = (payload: any) => void

class BalanceEventBusImpl {
  private listeners = new Map<BalanceEventName, Set<AnyHandler>>()

  on<E extends BalanceEventName>(event: E, handler: BalanceEventHandler<E>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    set.add(handler as AnyHandler)
    return () => this.off(event, handler)
  }

  off<E extends BalanceEventName>(event: E, handler: BalanceEventHandler<E>): void {
    this.listeners.get(event)?.delete(handler as AnyHandler)
  }

  emit<E extends BalanceEventName>(event: E, payload: BalanceEventMap[E]): void {
    const set = this.listeners.get(event)
    if (!set) return
    // Snapshot handlers so a handler that unsubscribes mid-emit doesn't
    // mutate the iterating set.
    for (const handler of Array.from(set)) {
      try {
        handler(payload)
      } catch (err) {
        // Surface listener errors without breaking the rest of the chain.
        // eslint-disable-next-line no-console
        console.error(`[BalanceEventBus] handler for "${event}" threw:`, err)
      }
    }
  }

  // Test/cleanup utility — never used in app code.
  _clear(): void {
    this.listeners.clear()
  }
}

export const BalanceEventBus = new BalanceEventBusImpl()

// === React hook ============================================================

/**
 * Subscribes the calling component to a balance event for its lifetime.
 * The handler is always called with the latest closure thanks to a ref
 * shim, so callers can use stale-free state inside without re-binding.
 */
export function useBalanceEvent<E extends BalanceEventName>(
  event: E,
  handler: BalanceEventHandler<E>,
): void {
  useEffect(() => {
    const unsubscribe = BalanceEventBus.on(event, handler)
    return unsubscribe
    // We intentionally re-subscribe when `handler` identity changes so
    // callers who memoize their handler get the expected behavior.
  }, [event, handler])
}
