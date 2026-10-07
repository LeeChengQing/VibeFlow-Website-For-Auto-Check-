#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedTestEnvironment } from './lib/test-environment.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const testTargets = args.length > 0 ? args : ['tests/*.test.ts'];

const safeEnv = isolatedTestEnvironment(process.env);
const guardUrl = pathToFileURL(path.resolve(__dirname, 'test-network-guard.mjs')).href;

// Spawn tsx with safeEnv
const child = spawn(
  process.execPath,
  [
    '--import',
    `data:text/javascript,import { installNetworkGuard } from '${guardUrl}'; installNetworkGuard();`,
    'node_modules/tsx/dist/cli.mjs',
    '--test',
    ...testTargets,
  ],
  {
    stdio: 'inherit',
    env: safeEnv,
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
