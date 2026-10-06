import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function migrateAll(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on tables to public, anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
  `);

  const migrationFiles = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    await db.exec(sql);
  }
}

test('Stage B: Fresh database runs all migrations and establishes complete schema', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const tables = (await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables
    where table_schema = 'public'
  `)).rows.map(r => r.table_name);

  // Core schema tables per CODEX_SPEC Section 5.1
  const requiredTables = [
    'plans',
    'orders',
    'payments',
    'webhook_events',
    'license_keys',
    'activations',
    'entitlements',
    'notifications',
    'refunds',
    'disputes',
    'audit_log',
    'app_config',
    'rate_limits',
    'heartbeats',
    'order_outbox',
    'support_tickets',
    'support_messages',
    'legacy_key_import_staging'
  ];

  for (const reqTable of requiredTables) {
    assert.ok(tables.includes(reqTable), `Expected table '${reqTable}' to exist in public schema`);
  }

  // Verify plans are populated with canonical plans
  const seededPlans = (await db.query<{ code: string; product: string }>(`
    select code, product from public.plans order by code
  `)).rows;

  const planCodes = seededPlans.map(p => p.code);
  assert.ok(planCodes.includes('core') || planCodes.includes('extension'), 'Expected core plan');
  assert.ok(planCodes.includes('bundle'), 'Expected bundle plan');
  assert.ok(planCodes.includes('semester'), 'Expected semester plan');
  assert.ok(planCodes.includes('yearly'), 'Expected yearly plan');
});

test('Stage B: RLS zero-access enforcement on private tables for anon and authenticated', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Sensitive tables that anon & authenticated must have zero read/write access to
  const sensitiveTables = [
    'orders',
    'payments',
    'webhook_events',
    'license_keys',
    'activations',
    'entitlements',
    'notifications',
    'refunds',
    'disputes',
    'audit_log',
    'order_outbox',
    'support_tickets',
    'support_messages',
    'rate_limits',
    'heartbeats',
    'legacy_key_import_staging'
  ];

  for (const table of sensitiveTables) {
    // 1. anon select must fail
    await db.exec(`set role anon;`);
    await assert.rejects(
      async () => {
        await db.query(`select * from public.${table};`);
      },
      /permission denied/,
      `Expected anon SELECT on '${table}' to be denied by RLS/grants`
    );
    await db.exec(`reset role;`);

    // 2. authenticated select must fail
    await db.exec(`set role authenticated;`);
    await assert.rejects(
      async () => {
        await db.query(`select * from public.${table};`);
      },
      /permission denied/,
      `Expected authenticated SELECT on '${table}' to be denied by RLS/grants`
    );
    await db.exec(`reset role;`);

    // 3. anon insert must fail
    await db.exec(`set role anon;`);
    await assert.rejects(
      async () => {
        await db.query(`insert into public.${table} default values;`);
      },
      /permission denied/,
      `Expected anon INSERT on '${table}' to be denied by RLS/grants`
    );
    await db.exec(`reset role;`);
  }

  // Verify public tables access:
  // plans: readable by anon, but NOT writable
  await db.exec(`set role anon;`);
  const plans = (await db.query<{ cnt: number }>(`select count(*) as cnt from public.plans;`)).rows;
  assert.ok(Number(plans[0].cnt) > 0, 'anon should be able to read public plans');

  await assert.rejects(
    async () => {
      await db.query(`
        insert into public.plans (code, product, name, price_myr, price_usd)
        values ('hacked', 'core', 'Hack', 0, 0);
      `);
    },
    /violates row-level security policy|permission denied/,
    'anon should not be allowed to insert into plans'
  );
  await db.exec(`reset role;`);

  // app_config: anon can read public items, but cannot read private items or write
  await db.exec(`
    insert into public.app_config (key, value, is_public)
    values
      ('client_banner', '{"message": "Welcome"}'::jsonb, true),
      ('secret_webhook_endpoint', '{"url": "https://internal"}'::jsonb, false)
    on conflict (key) do update set value = excluded.value, is_public = excluded.is_public;
  `);

  await db.exec(`set role anon;`);
  const publicConfigs = (await db.query<{ key: string }>(`select key from public.app_config;`)).rows.map(r => r.key);
  assert.ok(publicConfigs.includes('client_banner'), 'anon can see public config');
  assert.ok(!publicConfigs.includes('secret_webhook_endpoint'), 'anon cannot see private config');

  await assert.rejects(
    async () => {
      await db.query(`update public.app_config set value = '{"message": "pwned"}'::jsonb where key = 'client_banner';`);
    },
    /violates row-level security policy|permission denied/,
    'anon cannot update app_config'
  );
  await db.exec(`reset role;`);
});

test('Stage B: Orders state machine permits valid transitions and rejects invalid transitions with audit log', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Insert test order with initial status 'pending'
  const orderId = 'a0000000-0000-0000-0000-000000000001';
  await db.exec(`
    insert into public.orders (
      id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider
    ) values (
      '${orderId}', 'ORD-B-TEST-1', 'b-test@example.com', 'core', 3500, 'MYR', 'pending', 'stripe'
    );
  `);

  // Valid transition: pending -> paid
  await db.exec(`
    update public.orders set status = 'paid' where id = '${orderId}';
  `);

  const status1 = (await db.query<{ status: string }>(`
    select status from public.orders where id = '${orderId}';
  `)).rows[0].status;
  assert.equal(status1, 'paid');

  // Valid transition: paid -> fulfilled
  await db.exec(`
    update public.orders set status = 'fulfilled' where id = '${orderId}';
  `);

  const status2 = (await db.query<{ status: string }>(`
    select status from public.orders where id = '${orderId}';
  `)).rows[0].status;
  assert.equal(status2, 'fulfilled');

  // Valid transition: fulfilled -> refunded
  await db.exec(`
    update public.orders set status = 'refunded' where id = '${orderId}';
  `);

  const status3 = (await db.query<{ status: string }>(`
    select status from public.orders where id = '${orderId}';
  `)).rows[0].status;
  assert.equal(status3, 'refunded');

  // Verify that valid transitions were logged into audit_log by trigger
  const transitionLogs = (await db.query<{ action: string; meta: any }>(`
    select action, meta from public.audit_log
    where entity = 'orders' and entity_id = '${orderId}'
    order by created_at asc;
  `)).rows;

  assert.ok(transitionLogs.length >= 3, 'All valid status transitions must be logged in audit_log');

  // Invalid transition: refunded -> paid (refunded is terminal)
  await assert.rejects(
    async () => {
      await db.exec(`
        update public.orders set status = 'paid' where id = '${orderId}';
      `);
    },
    /ILLEGAL_ORDER_STATUS_TRANSITION/,
    'Should reject transition from refunded to paid'
  );
});

test('Stage B: License keys state machine permits valid transitions and rejects invalid transitions with audit log', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'b0000000-0000-0000-0000-000000000001';
  await db.exec(`
    insert into public.license_keys (
      id, key_hash, hash_version, channel, region, status, plan_code
    ) values (
      '${keyId}', 'stage-b-test-hash-001', 2, 'website', 'global', 'generated', 'core'
    );
  `);

  // Valid transition: generated -> listed
  await db.exec(`
    update public.license_keys set status = 'listed' where id = '${keyId}';
  `);

  // Valid transition: listed -> sold
  await db.exec(`
    update public.license_keys set status = 'sold' where id = '${keyId}';
  `);

  // Valid transition: sold -> activated
  await db.exec(`
    update public.license_keys set status = 'activated' where id = '${keyId}';
  `);

  // Valid transition: activated -> refunded
  await db.exec(`
    update public.license_keys set status = 'refunded' where id = '${keyId}';
  `);

  // Verify transition logs in audit_log
  const keyLogs = (await db.query<{ action: string; meta: any }>(`
    select action, meta from public.audit_log
    where entity = 'license_keys' and entity_id = '${keyId}'
    order by created_at asc;
  `)).rows;

  assert.ok(keyLogs.length >= 4, 'All valid key status transitions must be logged in audit_log');

  // Invalid transition: refunded -> activated
  await assert.rejects(
    async () => {
      await db.exec(`
        update public.license_keys set status = 'activated' where id = '${keyId}';
      `);
    },
    /ILLEGAL_LICENSE_KEY_STATUS_TRANSITION/,
    'Should reject transition from refunded to activated'
  );
});

test('Stage B: Audit log immutability prevents UPDATE and DELETE', async () => {
  const db = new PGlite();
  await migrateAll(db);

  await db.exec(`
    insert into public.audit_log (id, actor, action, entity, entity_id, meta)
    values ('c0000000-0000-0000-0000-000000000001', 'admin', 'TEST', 'test', '1', '{}'::jsonb);
  `);

  // UPDATE must fail
  await assert.rejects(
    async () => {
      await db.exec(`
        update public.audit_log set action = 'TAMPERED' where id = 'c0000000-0000-0000-0000-000000000001';
      `);
    },
    /AUDIT_LOG_IMMUTABLE/,
    'Audit log updates must be rejected'
  );

  // DELETE must fail
  await assert.rejects(
    async () => {
      await db.exec(`
        delete from public.audit_log where id = 'c0000000-0000-0000-0000-000000000001';
      `);
    },
    /AUDIT_LOG_IMMUTABLE/,
    'Audit log deletions must be rejected'
  );
});

test('Stage B: Legacy key import staging and ingestion RPC', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Insert 3 records into staging table: 2 valid, 1 duplicate (using valid 64-char hex strings)
  await db.exec(`
    insert into public.legacy_key_import_staging (
      raw_key_hash, raw_encrypted_key, raw_plan_type, raw_status, raw_channel, raw_region, raw_batch_id
    ) values
      ('1111111111111111111111111111111111111111111111111111111111111111', 'v1:enc:1', 'core', 'available', 'website', 'global', 'legacy-batch-1'),
      ('2222222222222222222222222222222222222222222222222222222222222222', 'v1:enc:2', 'bundle', 'available', 'website', 'global', 'legacy-batch-1'),
      ('1111111111111111111111111111111111111111111111111111111111111111', 'v1:enc:dup', 'core', 'available', 'website', 'global', 'legacy-batch-1');
  `);

  // Execute ingestion procedure: ingest_legacy_keys_from_staging()
  const result = (await db.query<{ imported_count: number; duplicate_count: number }>(`
    select * from public.ingest_legacy_keys_from_staging();
  `)).rows[0];

  assert.equal(Number(result.imported_count), 2, 'Should import exactly 2 unique keys');
  assert.equal(Number(result.duplicate_count), 1, 'Should detect 1 duplicate key');

  // Verify records exist in license_keys with hash_version = 1
  const importedKeys = (await db.query<{ key_hash: string; hash_version: number; status: string }>(`
    select key_hash, hash_version, status from public.license_keys
    where batch_id = 'legacy-batch-1'
    order by key_hash;
  `)).rows;

  assert.equal(importedKeys.length, 2);
  assert.equal(importedKeys[0].hash_version, 1);
  assert.equal(importedKeys[1].hash_version, 1);
});

test('Stage B: Rollback migration executes cleanly and reverts Stage B changes', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // Verify Stage B tables exist before rollback
  const beforeTables = (await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables where table_schema = 'public'
  `)).rows.map(r => r.table_name);
  assert.ok(beforeTables.includes('license_keys'));
  assert.ok(beforeTables.includes('activations'));
  assert.ok(beforeTables.includes('plans'));

  // Execute rollback script
  const downSql = readFileSync('supabase/migrations/down/20261007020000_stage_b_database_hardening_down.sql', 'utf8');
  await db.exec(downSql);

  // Verify Stage B tables are dropped
  const afterTables = (await db.query<{ table_name: string }>(`
    select table_name from information_schema.tables where table_schema = 'public'
  `)).rows.map(r => r.table_name);

  assert.ok(!afterTables.includes('license_keys'), 'license_keys should be dropped');
  assert.ok(!afterTables.includes('activations'), 'activations should be dropped');
  assert.ok(!afterTables.includes('plans'), 'plans should be dropped');

  // Verify pre-Stage B baseline tables still exist intact
  assert.ok(afterTables.includes('orders'), 'orders baseline must remain');
  assert.ok(afterTables.includes('key_inventory'), 'key_inventory baseline must remain');
  assert.ok(afterTables.includes('issued_licenses'), 'issued_licenses baseline must remain');
});

test('Stage B: parseAndValidateKeysCSV parses legacy CSV, rejects duplicates, and generates accurate report', async () => {
  const { parseAndValidateKeysCSV } = await import('../lib/keys/import-service');

  const csvContent = `key_hash,encrypted_key,plan_type,status
1111111111111111111111111111111111111111111111111111111111111111,enc1,core,available
2222222222222222222222222222222222222222222222222222222222222222,enc2,bundle,available
1111111111111111111111111111111111111111111111111111111111111111,enc_dup,core,available
short_hash,enc3,core,available
`;

  const { records, report } = parseAndValidateKeysCSV(csvContent, { channel: 'website', region: 'global' });

  assert.equal(report.totalRows, 4);
  assert.equal(report.validRows, 2);
  assert.equal(report.duplicateRows, 1);
  assert.equal(report.invalidRows, 1);
  assert.equal(records.length, 2);
  assert.equal(report.byPlan['core'], 1);
  assert.equal(report.byPlan['bundle'], 1);
});


