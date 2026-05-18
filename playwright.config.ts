import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for Skinny Studio.
 *
 * Targets the canvas demo route at /canvas/demo, which renders the full
 * editor without Whop auth — perfect for smoke tests.
 *
 * The dev server is expected to be running on port 3007 (see `npm run dev`).
 * `reuseExistingServer` lets local devs keep their existing server running.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3007',
    headless: true,
    trace: 'retain-on-failure',
    // No screenshots-on-failure for now.
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3007/canvas/demo',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
