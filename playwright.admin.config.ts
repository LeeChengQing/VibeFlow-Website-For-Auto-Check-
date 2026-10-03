import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const settingsDb = process.env.SITE_MANAGEMENT_TEST_DB || join(process.cwd(), '.local', `admin-test-settings-${Date.now()}.sqlite`);
process.env.SITE_MANAGEMENT_TEST_DB = settingsDb;
export default defineConfig({
  testDir: './tests/admin-e2e', outputDir: './test-results/admin', workers: 1, timeout: 45_000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3103', viewport: { width: 1440, height: 1000 },
    launchOptions: { executablePath: existsSync(chrome) ? chrome : existsSync(edge) ? edge : undefined },
    trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'node tests/fixtures/admin-supabase.mjs', url: 'http://127.0.0.1:54330/health', reuseExistingServer: false, env: { ADMIN_FIXTURE_PORT: '54330' } },
    { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3103',
      url: 'http://127.0.0.1:3103', reuseExistingServer: false, timeout: 120_000,
      env: { NEXT_DIST_DIR: '.next-admin-test', LOCAL_DEMO: 'true', LOCAL_ADMIN_PASSWORD: 'local-test-password', SITE_MANAGEMENT_LOCAL: 'true',
        SITE_MANAGEMENT_DB_PATH: settingsDb, LOCAL_DB_PATH: join(process.cwd(), '.local', `admin-test-commerce-${Date.now()}.sqlite`),
        ADMIN_DASHBOARD_PASSWORD: 'admin-browser-test-password', ADMIN_SESSION_SECRET: 'ab'.repeat(32),
        SUPABASE_URL: 'http://127.0.0.1:54330', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-only-credentials' } },
  ],
});
