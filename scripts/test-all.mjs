#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('=== Running Isolated Test Suite ===');
const result = spawnSync(
  process.execPath,
  ['scripts/test-isolated.mjs'],
  {
    cwd: rootDir,
    stdio: 'inherit',
  }
);

if (result.status !== 0) {
  console.error(`\nTest run failed with exit code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('\n=== All Isolated Tests Passed Successfully ===');
