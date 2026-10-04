import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = 'supabase/migrations/20261004032804_commerce_and_inventory.sql';
const tables = ['orders', 'key_inventory', 'issued_licenses'];

async function migrate(db: PGlite) {
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
  await db.exec(readFileSync('supabase/migrations/20261003162918_activation_keys.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/20261003182731_site_management.sql', 'utf8'));
  await db.exec(`
    create policy legacy_browser_read on public.activation_keys for select to anon using (true);
    create policy "Legacy custom policy" on public.activation_keys for all to authenticated
      using (true) with check (true);
  `);
  await db.exec(readFileSync(migration, 'utf8'));
}

async function order(db: PGlite, reference: string, paymentId: string | null = null) {
  return (await db.query<{ id: string }>(`
    insert into public.orders
      (reference, buyer_email, plan, amount_minor, currency, payment_provider, provider_payment_id)
    values ($1, 'buyer@example.com', 'bundle', 3500, 'MYR', 'hitpay', $2)
    returning id
  `, [reference, paymentId])).rows[0].id;
}

async function inventory(db: PGlite, hash: string) {
  return (await db.query<{ id: string }>(`
    insert into public.key_inventory (key_hash, plan_type) values ($1, 'bundle') returning id
  `, [hash])).rows[0].id;
}

test('commerce migration replaces the legacy table, policies and revoke RPC while preserving site data', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    assert.deepEqual((await db.query(`
      select to_regclass('public.activation_keys') as legacy_table,
        to_regprocedure('public.revoke_activation_key(uuid)') as legacy_rpc
    `)).rows, [{ legacy_table: null, legacy_rpc: null }]);
    assert.equal((await db.query<{ count: number }>(`
      select count(*)::int as count from pg_policies
      where schemaname='public' and tablename='activation_keys'
    `)).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>(
      'select count(*)::int as count from public.site_configuration'
    )).rows[0].count, 1);
    await db.exec('set role service_role');
    const id = await order(db, 'ORDER-1');
    assert.equal((await db.query<{ status: string }>(
      'select status from public.orders where id=$1', [id]
    )).rows[0].status, 'pending');
  } finally { await db.close(); }
});

test('commerce tables deny browser operations even with broad default grants and deny rows through RLS', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await db.exec('set role service_role');
    const orderId = await order(db, 'ORDER-SECURITY');
    const inventoryId = await inventory(db, 'a'.repeat(64));
    await db.query(`insert into public.issued_licenses
      (order_id, inventory_id, buyer_email, plan_type)
      values ($1, $2, 'buyer@example.com', 'bundle')`, [orderId, inventoryId]);
    await db.exec("update public.orders set status='paid'; update public.key_inventory set status='assigned'; update public.issued_licenses set status='revoked'");
    for (const table of tables) {
      await assert.rejects(db.query(`delete from public.${table}`), /permission denied/);
      await assert.rejects(db.query(`truncate public.${table}`), /permission denied/);
    }
    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of tables) {
        for (const sql of [
          `select * from public.${table}`,
          `insert into public.${table} default values`,
          `update public.${table} set id=id`,
          `delete from public.${table}`,
          `truncate public.${table}`,
        ]) await assert.rejects(db.query(sql), /permission denied/);
      }
      await db.exec('reset role');
    }
    // Prove that accidental SELECT/INSERT grants still cannot bypass RLS.
    await db.exec('grant select, insert on public.orders, public.key_inventory, public.issued_licenses to anon');
    await db.exec('set role anon');
    for (const table of tables) assert.deepEqual((await db.query(`select * from public.${table}`)).rows, []);
    await assert.rejects(order(db, 'FORBIDDEN'), /row-level security/);
    await assert.rejects(inventory(db, 'b'.repeat(64)), /row-level security/);
    await assert.rejects(db.query(`insert into public.issued_licenses
      (order_id, inventory_id, buyer_email, plan_type)
      values ($1, $2, 'buyer@example.com', 'bundle')`, [orderId, inventoryId]), /row-level security/);
  } finally { await db.close(); }
});

test('commerce constraints reject malformed records, duplicate payments and duplicate or orphaned licenses', async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await db.exec('set role service_role');
    const firstOrder = await order(db, 'ORDER-A', 'PAYMENT-1');
    const secondOrder = await order(db, 'ORDER-B');
    const firstInventory = await inventory(db, 'a'.repeat(64));
    const secondInventory = await inventory(db, 'b'.repeat(64));
    await assert.rejects(order(db, 'ORDER-A'), /unique constraint/);
    await assert.rejects(order(db, 'ORDER-C', 'PAYMENT-1'), /unique constraint/);
    await assert.rejects(inventory(db, 'a'.repeat(64)), /unique constraint/);
    await assert.rejects(inventory(db, 'plaintext-key'), /check constraint/);
    for (const [column, value] of [
      ['buyer_email', ' Buyer@Example.com '], ['buyer_email', ''],
      ['plan', 'extension'], ['status', 'complete'], ['currency', 'myr'],
      ['amount_minor', -1], ['reference', ''], ['payment_provider', ''],
      ['provider_payment_id', ''],
    ]) await assert.rejects(db.query(`update public.orders set ${column}=$1 where id=$2`, [value, firstOrder]), /check constraint/);
    await assert.rejects(db.query("update public.key_inventory set plan_type='extension'"), /check constraint/);
    await assert.rejects(db.query("update public.key_inventory set status='redeemed'"), /check constraint/);
    const issue = (orderId: string | null, inventoryId: string | null) => db.query(`
      insert into public.issued_licenses (order_id, inventory_id, buyer_email, plan_type)
      values ($1, $2, 'buyer@example.com', 'bundle') returning device_id, activated_at, status
    `, [orderId, inventoryId]);
    assert.deepEqual((await issue(firstOrder, firstInventory)).rows, [
      { device_id: null, activated_at: null, status: 'active' },
    ]);
    await assert.rejects(issue(firstOrder, secondInventory), /unique constraint/);
    await assert.rejects(issue(secondOrder, firstInventory), /unique constraint/);
    await assert.rejects(issue('00000000-0000-4000-8000-000000000001', secondInventory), /foreign key constraint/);
    await assert.rejects(issue(secondOrder, '00000000-0000-4000-8000-000000000001'), /foreign key constraint/);
    await assert.rejects(issue(null, secondInventory), /not-null constraint/);
    await assert.rejects(issue(secondOrder, null), /not-null constraint/);
    await assert.rejects(db.query("update public.issued_licenses set status='available'"), /check constraint/);
    await assert.rejects(db.query("update public.issued_licenses set buyer_email='Buyer@example.com'"), /check constraint/);
    await assert.rejects(db.query("update public.issued_licenses set plan_type='extension'"), /check constraint/);
    await db.exec('reset role');
    await assert.rejects(db.query('delete from public.orders where id=$1', [firstOrder]), /foreign key constraint/);
    await assert.rejects(db.query('delete from public.key_inventory where id=$1', [firstInventory]), /foreign key constraint/);
  } finally { await db.close(); }
});
