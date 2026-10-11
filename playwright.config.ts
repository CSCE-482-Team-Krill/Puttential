import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 60_000,
  use: {
    viewport: { width: 1500, height: 1050 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'npm run editor', url: 'http://127.0.0.1:3001', reuseExistingServer: true },
    { command: 'npm run game', url: 'http://127.0.0.1:3000', reuseExistingServer: true },
  ],
});
