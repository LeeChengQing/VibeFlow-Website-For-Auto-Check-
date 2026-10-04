import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

export default defineConfig({
  testDir: './tests/hitpay-e2e', outputDir: './test-results/hitpay', workers: 1,
  timeout: 30_000, expect: { timeout: 3_000 }, reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3148', viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined },
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3148',
    url: 'http://127.0.0.1:3148', reuseExistingServer: false, timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-hitpay-test', LOCAL_DEMO: 'true', SITE_MANAGEMENT_LOCAL: 'true',
      SITE_MANAGEMENT_DB_PATH: join(process.cwd(), '.local', `hitpay-storefront-${Date.now()}.sqlite`) },
  },
});
