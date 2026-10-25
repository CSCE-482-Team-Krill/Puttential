import { defineConfig } from '@playwright/test';
import config from '../../playwright.config';

// Reuse the running game server; the logo review does not need the editor server.
export default defineConfig({
  ...config,
  testDir: '../../tests',
  testMatch: 'frontend.spec.ts',
  webServer: undefined,
});
