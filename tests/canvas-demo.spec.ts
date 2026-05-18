import { test, expect, Page } from '@playwright/test'

/**
 * Playwright smoke tests for the Skinny Studio canvas demo (/canvas/demo).
 *
 * The demo route requires no auth. It mounts CanvasShell with five
 * pre-seeded nodes and five edges so we can exercise the editor UI end-to-end:
 * picker, drop, settings, pan, delete, and the `/` shortcut.
 */

const DEMO_URL = '/canvas/demo'

const SELECTORS = {
  node: '.react-flow__node',
  edge: '.react-flow__edge',
  pane: '.react-flow__pane',
  viewport: '.react-flow__viewport',
  pickerSearch: 'input[placeholder="Search by name or type"]',
  settingsHeader: 'h3:has-text("Settings")',
} as const

/**
 * Wait for the demo canvas to be fully rendered.
 * The seeded canvas has 5 nodes and 5 edges; we wait for at least one of each
 * plus the React-Flow pane to ensure interactivity is wired up.
 */
async function waitForCanvas(page: Page) {
  await page.goto(DEMO_URL)
  await page.locator(SELECTORS.pane).waitFor({ state: 'visible' })
  await expect(page.locator(SELECTORS.node).first()).toBeVisible({ timeout: 15_000 })
}

test.describe('canvas demo', () => {
  test('page loads with seeded nodes, edges, and top bar', async ({ page }) => {
    await waitForCanvas(page)

    // Nodes from buildDemoCanvas() — should be 5.
    const nodeCount = await page.locator(SELECTORS.node).count()
    expect(nodeCount).toBeGreaterThanOrEqual(5)

    // Edges — should be 5 in the demo graph.
    const edgeCount = await page.locator(SELECTORS.edge).count()
    expect(edgeCount).toBeGreaterThanOrEqual(1)

    // TopBar — Skinny logo (img alt="Skinny Studio") is present.
    // Hidden on narrow viewports but visible at the default desktop size.
    await expect(page.locator('img[alt="Skinny Studio"]')).toBeVisible()
  })

  test('right-click on pane opens AddNodeModal picker', async ({ page }) => {
    await waitForCanvas(page)

    // Right-click an empty patch of the pane (top-right corner away from nodes).
    const pane = page.locator(SELECTORS.pane)
    const box = await pane.boundingBox()
    if (!box) throw new Error('pane has no bounding box')
    await page.mouse.click(box.x + box.width - 60, box.y + 60, { button: 'right' })

    await expect(page.locator(SELECTORS.pickerSearch)).toBeVisible({ timeout: 5_000 })
  })

  test('drop a Text prompt node from the picker', async ({ page }) => {
    await waitForCanvas(page)

    const initial = await page.locator(SELECTORS.node).count()

    // Open picker via right-click (closer-to-real interaction than keyboard).
    const pane = page.locator(SELECTORS.pane)
    const box = await pane.boundingBox()
    if (!box) throw new Error('pane has no bounding box')
    await page.mouse.click(box.x + box.width - 60, box.y + 60, { button: 'right' })

    const search = page.locator(SELECTORS.pickerSearch)
    await expect(search).toBeVisible()

    // Click the "Text prompt" row.
    await page.locator('button:has-text("Text prompt")').first().click()

    // Modal closes; new node appears.
    await expect(search).toBeHidden({ timeout: 5_000 })
    await expect.poll(async () => page.locator(SELECTORS.node).count()).toBeGreaterThan(initial)
  })

  test('double-clicking a node opens NodeSettingsModal', async ({ page }) => {
    await waitForCanvas(page)

    const firstNode = page.locator(SELECTORS.node).first()
    await firstNode.dblclick()

    // Header text is "<title> · Settings" rendered in a single <h3>.
    await expect(page.locator(SELECTORS.settingsHeader)).toBeVisible({ timeout: 5_000 })
    await expect(page.locator(SELECTORS.settingsHeader)).toContainText('Settings')
  })

  test('panning the canvas updates the viewport transform', async ({ page }) => {
    await waitForCanvas(page)

    const pane = page.locator(SELECTORS.pane)
    // The React-Flow pane uses cursor: grab when pannable.
    await expect(pane).toHaveCSS('cursor', /grab/)

    const viewport = page.locator(SELECTORS.viewport)
    const before = await viewport.evaluate((el) => (el as HTMLElement).style.transform)

    // Drag from a safe empty corner — top-right is unlikely to hit a node.
    const box = await pane.boundingBox()
    if (!box) throw new Error('pane has no bounding box')
    const startX = box.x + box.width - 60
    const startY = box.y + 60
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 160, startY + 80, { steps: 12 })
    await page.mouse.up()

    await expect
      .poll(async () => viewport.evaluate((el) => (el as HTMLElement).style.transform))
      .not.toBe(before)
  })

  test('add a node then delete it decreases node count', async ({ page }) => {
    await waitForCanvas(page)

    const initial = await page.locator(SELECTORS.node).count()

    // Open picker, add an Output node (utility, no model needed).
    const pane = page.locator(SELECTORS.pane)
    const box = await pane.boundingBox()
    if (!box) throw new Error('pane has no bounding box')
    await page.mouse.click(box.x + box.width - 60, box.y + 60, { button: 'right' })

    await expect(page.locator(SELECTORS.pickerSearch)).toBeVisible()
    await page.locator('button:has-text("Output")').first().click()
    await expect(page.locator(SELECTORS.pickerSearch)).toBeHidden({ timeout: 5_000 })

    const afterAdd = await page.locator(SELECTORS.node).count()
    expect(afterAdd).toBeGreaterThan(initial)

    // Newly added node is auto-selected by CanvasShell (settingsNodeId is set
    // AND it becomes the selected RF node). Close the settings modal if open.
    await page.keyboard.press('Escape')

    // Click the newest node to make sure it's selected, then Delete.
    const newest = page.locator(SELECTORS.node).last()
    await newest.click()
    await page.keyboard.press('Delete')

    await expect
      .poll(async () => page.locator(SELECTORS.node).count())
      .toBeLessThan(afterAdd)
  })

  test('pressing `/` opens the picker', async ({ page }) => {
    await waitForCanvas(page)

    // Focus the pane so the global keydown handler is active and not
    // intercepted by any input. Click on a non-node corner.
    const pane = page.locator(SELECTORS.pane)
    const box = await pane.boundingBox()
    if (!box) throw new Error('pane has no bounding box')
    await page.mouse.click(box.x + box.width - 60, box.y + 60)

    await page.keyboard.press('/')

    await expect(page.locator(SELECTORS.pickerSearch)).toBeVisible({ timeout: 5_000 })
  })
})
