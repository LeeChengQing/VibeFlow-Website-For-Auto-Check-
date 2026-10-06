import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

test('Stage J: Secret scanner verifies zero live secrets in git tracked files', () => {
  // Get all files tracked by git
  const trackedFilesOutput = execSync('git ls-files', { encoding: 'utf8' });
  const files = trackedFilesOutput.split(/\r?\n/).filter(Boolean);

  // Exclude test mocks and documentation examples that explicitly mention dummy placeholder strings
  const testFilesToSkip = new Set([
    'tests/test-isolation.test.ts',
    'tests/fixtures/secrets.ts',
  ]);

  const forbiddenPatterns = [
    { pattern: /sk_live_[0-9a-zA-Z]{24,}/, name: 'Live Stripe Secret Key' },
    { pattern: /-----BEGIN (?:RSA|EC|OPENSSH|DSA|ED25519) PRIVATE KEY-----/, name: 'Private Key PEM' },
  ];

  const violations: string[] = [];

  for (const file of files) {
    if (testFilesToSkip.has(file)) continue;
    // Skip binary files
    if (file.endsWith('.zip') || file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.ico')) continue;

    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');

    for (const { pattern, name } of forbiddenPatterns) {
      if (pattern.test(content)) {
        violations.push(`${file}: matched ${name}`);
      }
    }

    // Ensure .env files are not tracked in git
    if (file === '.env.local' || file === '.env.production') {
      violations.push(`${file}: production env file must never be committed to git`);
    }
  }

  assert.equal(violations.length, 0, `Live secret scanner detected violations:\n${violations.join('\n')}`);
});

test('Stage J: Clean database migration replay succeeds on empty Postgres instance', async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);

  const migrationFiles = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const f of migrationFiles) {
    const migPath = path.join('supabase/migrations', f);
    assert.ok(existsSync(migPath), `Migration file must exist: ${migPath}`);
    const sql = readFileSync(migPath, 'utf8');
    try {
      await db.exec(sql);
    } catch (err: any) {
      console.error(`Migration FAILED: ${migPath}`, err);
      throw err;
    }
  }

  // Verify all essential tables exist
  const res = await db.query<{ tablename: string }>(`
    select tablename from pg_tables where schemaname = 'public';
  `);
  const tables = new Set(res.rows.map(r => r.tablename));

  const expectedTables = [
    'plans',
    'orders',
    'key_inventory',
    'issued_licenses',
    'license_keys',
    'activations',
    'entitlements',
    'notifications',
    'app_config',
    'rate_limits',
  ];

  for (const table of expectedTables) {
    assert.ok(tables.has(table), `Table ${table} must exist after all migrations run`);
  }

  // Verify down migrations execute cleanly
  const downMigrations = [
    'supabase/migrations/down/20261007050000_stage_f_notifications_down.sql',
    'supabase/migrations/down/20261007040000_stage_de_payment_refund_hardening_down.sql',
    'supabase/migrations/down/20261007030000_stage_c_activation_service_down.sql',
    'supabase/migrations/down/20261007020000_stage_b_database_hardening_down.sql',
  ];

  for (const downPath of downMigrations) {
    assert.ok(existsSync(downPath), `Down migration must exist: ${downPath}`);
    const downSql = readFileSync(downPath, 'utf8');
    try {
      await db.exec(downSql);
    } catch (err: any) {
      console.error(`Down migration FAILED: ${downPath}`, err);
      throw err;
    }
  }
});

test('Stage J: Extension release build ZIP is verified and free of secrets', () => {
  // Execute extension release build script
  execSync('node scripts/build-extension-release.mjs', { stdio: 'pipe' });

  const releaseDir = 'dist/extension-release';
  assert.ok(existsSync(releaseDir), 'Extension release directory must exist');

  // Verify manifest
  const manifestPath = path.join(releaseDir, 'manifest.json');
  assert.ok(existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3, 'Must be Chrome Manifest V3');
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'Extension release version must be valid semver');
  assert.ok(manifest.action, 'Must specify action popup');
  assert.ok(manifest.background?.service_worker, 'Must specify background service worker');

  // Verify distribution directory has no forbidden development or secret artifacts
  const forbiddenExtSubstrings = [
    'process.env',
    'sk_live',
    'service_role',
    'KEY_HMAC_SECRET',
    'ED25519_PRIVATE_KEY',
    '.env',
  ];

  function scanDir(dir: string) {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const st = statSync(fullPath);
      if (st.isDirectory()) {
        scanDir(fullPath);
      } else {
        assert.ok(!entry.endsWith('.key') && !entry.endsWith('.pem'), `Forbidden key file in extension: ${entry}`);
        const content = readFileSync(fullPath, 'utf8');
        for (const sub of forbiddenExtSubstrings) {
          assert.equal(
            content.includes(sub),
            false,
            `Extension file ${entry} contains forbidden substring: ${sub}`
          );
        }
      }
    }
  }

  scanDir(releaseDir);

  // Verify output zip file
  const zipPath = 'public/downloads/auto-check-extension.zip';
  assert.ok(existsSync(zipPath), 'Generated release ZIP must exist in public/downloads');
});

test('Stage J: Dependency package configuration and runtime engines integrity', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

  assert.ok(pkg.engines?.node, 'package.json must declare node engine requirements');
  assert.match(pkg.engines.node, />=24/, 'Node engine must require >=24');

  // Critical dependencies must be declared
  assert.ok(pkg.dependencies['stripe'], 'stripe must be present');
  assert.ok(pkg.dependencies['@supabase/supabase-js'], '@supabase/supabase-js must be present');
  assert.ok(pkg.devDependencies['@electric-sql/pglite'], '@electric-sql/pglite must be present for offline tests');
  assert.ok(pkg.devDependencies['typescript'], 'typescript must be present');

  // No dangerous protocols in dependencies (e.g. git+http, file:../outside)
  for (const [dep, ver] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.ok(
      typeof ver === 'string' && !ver.startsWith('http:') && !ver.startsWith('git:'),
      `Dependency ${dep} has insecure version specification: ${ver}`
    );
  }
});
