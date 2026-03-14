// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Run SDK API tests against an already-running dev server (no webServer start).
// Usage: npm run dev (in another terminal), then: npx playwright test tests/sdk-api-tests.spec.js -c playwright.sdk.config.js
module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  timeout: 130000,
});
