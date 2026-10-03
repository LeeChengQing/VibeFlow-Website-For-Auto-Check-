import { defineConfig } from '@playwright/test';
import production from './playwright.production.config';

// Keep frame sampling on a production server: development instrumentation skews it.
export default defineConfig(production, {
  testDir: './tests',
  testMatch: ['**/package-performance.spec.ts', '**/perf.spec.ts'],
  grepInvert: undefined,
  timeout: 120000,
  outputDir: '.local/performance-audit-artifacts',
});
