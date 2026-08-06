import { defineConfig, devices } from '@playwright/test';

// Manual-style QA campaign config — separate from playwright.config.ts (the
// automated regression suite). Headed, slowed down, and captures evidence
// per docs required by the campaign (screenshots, trace/video on failure).
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e-manual',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'playwright-report-manual', open: 'never' }],
    ['list'],
  ],
  outputDir: './e2e-manual/evidence/test-results',
  use: {
    baseURL: BASE_URL,
    headless: false,
    launchOptions: { slowMo: 400 },
    trace: 'retain-on-failure',
    screenshot: 'off', // scripts take explicit named screenshots at each step
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
