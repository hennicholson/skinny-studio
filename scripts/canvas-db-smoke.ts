#!/usr/bin/env tsx
//
// Canvas DB smoke test.
//
// Round-trip every canvas-queries.ts entry point against the real Supabase
// project pointed at by env vars. Confirms that the migration shape matches
// the IR, that RLS is bypassed by the service role, that incremental diff
// saves work, that delete cascades, and that the optimistic-lock 409 fires
// when expected.
//
// Run with:
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/canvas-db-smoke.ts
//
// (Or just `npx tsx scripts/canvas-db-smoke.ts` if your shell already exports
// the variables.) Idempotent: the test user_id is a fixed synthetic UUID and
// every canvas it creates is deleted at the end (and on the next run, any
// stragglers are pruned first).

import { sbAdmin } from '@/lib/supabaseAdmin'
import {
  listCanvases,
  createCanvas,
  getCanvas,
  saveCanvas,
  deleteCanvas,
  VersionConflictError,
} from '@/lib/supabase/canvas-queries'
import { newNode, newEdge, Canvas } from '@/lib/canvas/ir'

// Fixed synthetic user id so re-runs don't pile up stray rows in prod-like
// environments. This UUID is deterministic + arbitrary; never collides with a
// real Whop-derived UUID because it's not a SHA-256 prefix.
const TEST_USER_ID = '00000000-0000-4000-8000-000000000001'

// ANSI green tick / red cross for the terminal.
const OK = '[32m✓[0m'
const FAIL = '[31m✗[0m'

class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new AssertionError(message)
}

function step(name: string) {
  // eslint-disable-next-line no-console
  console.log(`\n→ ${name}`)
}

function pass(name: string) {
  // eslint-disable-next-line no-console
  console.log(`  ${OK} ${name}`)
}

function fail(name: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.log(`  ${FAIL} ${name}`)
  // eslint-disable-next-line no-console
  console.error(err)
}

// ---------------------------------------------------------------------------
// Cleanup any leftovers from prior runs so the smoke test is idempotent.
// ---------------------------------------------------------------------------
async function pruneStragglers(): Promise<void> {
  step('Pruning stragglers from prior smoke runs')
  const { data, error } = await sbAdmin
    .from('canvases')
    .select('id')
    .eq('user_id', TEST_USER_ID)
  if (error) throw error
  for (const row of (data as { id: string }[]) || []) {
    await deleteCanvas(row.id, TEST_USER_ID)
  }
  pass(`Pruned ${(data || []).length} stragglers`)
}

// ---------------------------------------------------------------------------
// Round-trip.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  await pruneStragglers()

  // ---- listCanvases (empty) ----
  step('listCanvases() on a fresh user returns []')
  {
    const list = await listCanvases(TEST_USER_ID)
    assert(Array.isArray(list), 'listCanvases must return an array')
    assert(list.length === 0, `expected empty, got ${list.length}`)
    pass('returns empty array')
  }

  // ---- createCanvas ----
  step('createCanvas() returns a header')
  let canvas: Canvas
  {
    canvas = await createCanvas(TEST_USER_ID, 'Smoke test canvas')
    assert(canvas.id, 'created canvas missing id')
    assert(canvas.userId === TEST_USER_ID, 'wrong user_id on created canvas')
    assert(canvas.title === 'Smoke test canvas', 'wrong title')
    assert(Array.isArray(canvas.nodes) && canvas.nodes.length === 0, 'nodes should be empty')
    assert(Array.isArray(canvas.edges) && canvas.edges.length === 0, 'edges should be empty')
    pass(`created canvas ${canvas.id}`)
  }

  // ---- saveCanvas (initial seed with 3 nodes, 2 edges, and a
  //                  generationHistory entry) ----
  step('saveCanvas() seeds nodes/edges + generationHistory')
  {
    const prompt = newNode('text-prompt', { x: 0, y: 0 }, { prompt: 'a tiger' })
    const image = newNode(
      'image-gen',
      { x: 320, y: 0 },
      {
        modelSlug: 'flux-pro',
        modelName: 'Flux Pro',
        // Verifies that nested data (generationHistory) round-trips through
        // canvas_nodes.data_json without truncation / re-escaping.
        generationHistory: [
          {
            urls: ['https://example.com/output-1.png'],
            label: 'first run',
            generationId: 'gen_abc123',
            costCents: 5,
            completedAt: '2026-05-11T00:00:00.000Z',
          },
        ],
        historyIndex: 0,
      },
    )
    const output = newNode('output', { x: 640, y: 20 })
    const e1 = newEdge(prompt.id, 'out:prompt', image.id, 'in:prompt')
    const e2 = newEdge(image.id, 'out:image', output.id, 'in:asset')

    const seeded: Canvas = {
      ...canvas,
      title: 'Smoke test canvas v2',
      viewport: { x: 12, y: -8, zoom: 1.25 },
      nodes: [prompt, image, output],
      edges: [e1, e2],
    }

    const { newVersion } = await saveCanvas(seeded, TEST_USER_ID, {
      // First save — server's current version is 1, so expectedVersion = 1.
      expectedVersion: 1,
      sessionId: 'smoke-test-session',
    })
    assert(newVersion >= 2, `expected version bump (>=2), got ${newVersion}`)
    pass(`saved (version ${newVersion})`)
    // Remember for the next round-trip + conflict test.
    canvas = seeded
  }

  // Wait past the server-side rate-limit floor (500ms) so the next save isn't
  // throttled. We intentionally don't suppress that behaviour in tests — we
  // want to exercise the same code path as production.
  await new Promise((r) => setTimeout(r, 600))

  // ---- getCanvas (verify shape) ----
  step('getCanvas() returns the seeded shape')
  let loadedVersion = 0
  {
    const loaded = await getCanvas(canvas.id, TEST_USER_ID)
    assert(loaded, 'getCanvas returned null on a freshly-saved canvas')
    assert(loaded.canvas.id === canvas.id, 'id mismatch')
    assert(loaded.canvas.title === canvas.title, 'title mismatch')
    assert(loaded.canvas.nodes.length === 3, `expected 3 nodes, got ${loaded.canvas.nodes.length}`)
    assert(loaded.canvas.edges.length === 2, `expected 2 edges, got ${loaded.canvas.edges.length}`)

    // generationHistory round-trip
    const imageNode = loaded.canvas.nodes.find((n) => n.type === 'image-gen')
    assert(imageNode, 'image node missing')
    const hist = (imageNode.data.generationHistory || []) as Array<{
      urls: string[]
      label?: string
      generationId?: string
    }>
    assert(hist.length === 1, `expected 1 history entry, got ${hist.length}`)
    assert(hist[0].urls[0] === 'https://example.com/output-1.png', 'history url mismatch')
    assert(hist[0].label === 'first run', 'history label mismatch')
    assert(hist[0].generationId === 'gen_abc123', 'history generationId mismatch')

    // viewport round-trip
    assert(loaded.canvas.viewport.zoom === 1.25, 'viewport.zoom did not round-trip')

    loadedVersion = loaded.version
    assert(loaded.version >= 2, `expected version >= 2, got ${loaded.version}`)
    // The save layer preserves a-z, A-Z, 0-9, `-`, and `_`; rejects all other
    // characters and caps length at 64.
    assert(
      loaded.lastEditedBySession === 'smoke-test-session',
      `unexpected lastEditedBySession: ${loaded.lastEditedBySession}`,
    )
    pass(`shape verified (version ${loaded.version})`)
  }

  await new Promise((r) => setTimeout(r, 600))

  // ---- saveCanvas (version conflict) ----
  step('saveCanvas() throws VersionConflictError on stale version')
  {
    let threw: unknown = null
    try {
      await saveCanvas(canvas, TEST_USER_ID, {
        expectedVersion: 1, // intentionally stale — we're already at >= 2
        sessionId: 'smoke-test-session',
      })
    } catch (err) {
      threw = err
    }
    assert(threw instanceof VersionConflictError, 'expected VersionConflictError, got: ' + String(threw))
    const conflict = threw as VersionConflictError
    assert(conflict.currentVersion === loadedVersion, 'conflict.currentVersion mismatch')
    pass(`409 fires (currentVersion=${conflict.currentVersion})`)
  }

  await new Promise((r) => setTimeout(r, 600))

  // ---- saveCanvas (incremental — remove a node, edit a position) ----
  step('saveCanvas() applies an incremental diff')
  {
    const updated: Canvas = {
      ...canvas,
      // Drop the output node + its edge; nudge the image node's position.
      nodes: canvas.nodes
        .filter((n) => n.type !== 'output')
        .map((n) => (n.type === 'image-gen' ? { ...n, position: { x: 999, y: 999 } } : n)),
      edges: canvas.edges.filter((e) => {
        const target = canvas.nodes.find((n) => n.id === e.target)
        return target?.type !== 'output'
      }),
    }
    const { newVersion } = await saveCanvas(updated, TEST_USER_ID, {
      expectedVersion: loadedVersion,
      sessionId: 'smoke-test-session',
    })
    assert(newVersion > loadedVersion, 'expected version bump after edit')

    const reloaded = await getCanvas(canvas.id, TEST_USER_ID)
    assert(reloaded, 'reload after diff returned null')
    assert(reloaded.canvas.nodes.length === 2, `expected 2 nodes, got ${reloaded.canvas.nodes.length}`)
    assert(reloaded.canvas.edges.length === 1, `expected 1 edge, got ${reloaded.canvas.edges.length}`)
    const imgNode = reloaded.canvas.nodes.find((n) => n.type === 'image-gen')
    assert(imgNode && imgNode.position.x === 999, 'position diff did not persist')
    canvas = reloaded.canvas
    loadedVersion = reloaded.version
    pass(`incremental save applied (version ${loadedVersion})`)
  }

  // ---- deleteCanvas + cascade ----
  step('deleteCanvas() cascades to nodes + edges')
  {
    await deleteCanvas(canvas.id, TEST_USER_ID)

    const after = await getCanvas(canvas.id, TEST_USER_ID)
    assert(after === null, 'expected getCanvas to return null after delete')

    // Confirm child rows cascaded (raw count probe).
    const { count: nodeCount, error: nodeErr } = await sbAdmin
      .from('canvas_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('canvas_id', canvas.id)
    if (nodeErr) throw nodeErr
    assert((nodeCount || 0) === 0, `expected 0 cascaded nodes, got ${nodeCount}`)

    const { count: edgeCount, error: edgeErr } = await sbAdmin
      .from('canvas_edges')
      .select('id', { count: 'exact', head: true })
      .eq('canvas_id', canvas.id)
    if (edgeErr) throw edgeErr
    assert((edgeCount || 0) === 0, `expected 0 cascaded edges, got ${edgeCount}`)

    pass('cascade verified')
  }

  // ---- IDOR probe — another user can't see this canvas ----
  step('cross-user isolation (IDOR probe)')
  {
    const other = await createCanvas(TEST_USER_ID, 'Belongs to TEST_USER_ID')
    const fakeUserId = '00000000-0000-4000-8000-000000000002'
    const stolen = await getCanvas(other.id, fakeUserId)
    assert(stolen === null, 'getCanvas leaked a canvas across user_id!')
    await deleteCanvas(other.id, TEST_USER_ID)
    pass('user_id scoping enforced')
  }

  // eslint-disable-next-line no-console
  console.log(`\n${OK} All smoke checks passed.`)
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`\n${FAIL} Smoke test failed:`)
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
