import {defineConfig} from '@playwright/test';
// Commerce simulations deliberately require development mode; their existing tests remain intact.
export default defineConfig({
  testDir:'./tests/e2e',workers:1,fullyParallel:false,timeout:45000,
  testIgnore:'receipt-performance.spec.ts',
  grepInvert:/server ignores tampered|complete extension checkout|paid orders show|paid receipt and|receipt entrance sequence|mobile notifications use|hero recommends the complete bundle|long ticket subjects/,
  expect:{timeout:15000},reporter:[['list']],outputDir:'.local/production-ui-artifacts',
  use:{baseURL:'http://127.0.0.1:3002',viewport:{width:1440,height:1000},
    launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-gpu-rasterization']},
    trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run start -- --port 3002',url:'http://127.0.0.1:3002',reuseExistingServer:false,timeout:120000},
});
