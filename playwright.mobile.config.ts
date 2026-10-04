import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Defaults to WebKit; MOBILE_BROWSER=chromium repeats the matrix in installed Chrome. */
export default defineConfig({
  ...base,
  testMatch: 'mobile-purchase.spec.ts',
  grepInvert: /desktop mobile-redesign baseline/,
  outputDir: './test-results/mobile-webkit',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3002', browserName: process.env.MOBILE_BROWSER === 'chromium' ? 'chromium' : 'webkit', launchOptions: process.env.MOBILE_BROWSER === 'chromium' ? base.use?.launchOptions : {} },
  webServer: { ...base.webServer as object, command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3002', url: 'http://127.0.0.1:3002', env: { ...((base.webServer as { env: Record<string, string> }).env), NEXT_DIST_DIR: '.next-mobile-e2e' } },
});
