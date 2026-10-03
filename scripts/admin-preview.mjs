import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// This command deliberately uses disposable local key inventory, never a cloud project.
if (process.env.NODE_ENV === 'production') throw new Error('Admin preview is development-only.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const password = process.env.ADMIN_PREVIEW_PASSWORD || 'admin-browser-test-password';
const env = {
  ...process.env, NODE_ENV: 'development', LOCAL_DEMO: 'true', SITE_MANAGEMENT_LOCAL: 'true',
  LOCAL_ADMIN_PASSWORD: 'local-test-password', ADMIN_DASHBOARD_PASSWORD: password,
  ADMIN_SESSION_SECRET: randomBytes(32).toString('hex'), NEXT_DIST_DIR: '.next-admin-e2e',
  SUPABASE_URL: 'http://127.0.0.1:54329', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-only-credentials',
  ADMIN_FIXTURE_PORT: '54329',
};
const children = new Set();
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
function start(args) {
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  children.add(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { children.delete(child); stop(code ?? 1); });
  return child;
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
start(['tests/fixtures/admin-supabase.mjs']);
let ready = false;
for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
  try { ready = (await fetch(`${env.SUPABASE_URL}/health`, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Wait for the fixture. */ }
  if (ready) break;
  await delay(100);
}
if (!ready || stopping) {
  if (!stopping) { console.error('Local inventory fixture could not start on port 54329.'); stop(1); }
} else {
  console.log('\nSite management preview: http://127.0.0.1:3102/admin');
  console.log(process.env.ADMIN_PREVIEW_PASSWORD ? 'Password: your ADMIN_PREVIEW_PASSWORD value.' : `Local preview password: ${password}`);
  console.log('Settings and uploads persist in .local/. Inventory is disposable test data.\n');
  start(['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3102']);
}
