import { defineConfig } from '@playwright/test';
import config from '../../playwright.config';

export default defineConfig({
  ...config,
  testDir: '../../tests',
  testMatch: ['frontend.spec.ts', 'ui-polish.spec.ts'],
  webServer: undefined,
});
