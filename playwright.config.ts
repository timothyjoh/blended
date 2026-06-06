import { defineConfig, devices } from '@playwright/test'

// E2E gate for the event-spine dev harness. Browser tests against a live dev
// server and InstantDB realtime sync are timing-sensitive, so `retries: 3`
// absorbs transient flakes; a spec that still fails after retries is a real
// failure.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 3,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4399',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Dedicated port so the suite always drives a fresh dev server carrying the
  // current Vite config (React dedupe), rather than reusing a stale server that
  // may be lingering on Astro's default 4321.
  webServer: {
    command: 'npm run dev -- --port 4399',
    url: 'http://localhost:4399',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
