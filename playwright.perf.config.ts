import {defineConfig} from '@playwright/test';
import { join } from 'node:path';
export default defineConfig({
  testDir:'./tests',testMatch:'**/receipt-performance.spec.ts',workers:1,fullyParallel:false,timeout:120000,
  reporter:[['list']],outputDir:'.local/perf-artifacts',
  use:{baseURL:'http://127.0.0.1:3003',viewport:{width:1440,height:900},
    launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-gpu-rasterization']}},
  webServer:{command:'npm run start -- --port 3003',url:'http://127.0.0.1:3003',reuseExistingServer:false,timeout:120000,env:{LOCAL_DB_PATH:join(process.cwd(),'.local','perf.sqlite')}},
});
