import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/e2e-server.js',
    url: 'http://127.0.0.1:4321/api/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
