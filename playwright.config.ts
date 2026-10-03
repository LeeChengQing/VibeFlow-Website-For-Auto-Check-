import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,timeout:45000,
  expect:{timeout:15000},reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:3001',viewport:{width:1440,height:1000},launchOptions:{executablePath:existsSync(chrome)?chrome:existsSync(edge)?edge:undefined},trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001',url:'http://127.0.0.1:3001',reuseExistingServer:false,timeout:120000,env:{NEXT_DIST_DIR:'.next-e2e',LOCAL_DEMO:'true',LOCAL_ADMIN_PASSWORD:'Vibeflow-Local-2026!',LOCAL_DB_PATH:join(process.cwd(),'.local','e2e.sqlite')}},
});
