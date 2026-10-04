import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

let fulfillmentDb: PGlite | undefined;
after(async () => { await fulfillmentDb?.close(); });

async function database() {
  if (fulfillmentDb) {
    await fulfillmentDb.exec(`reset role;
      drop trigger if exists test_failure on public.issued_licenses;
      drop trigger if exists test_failure on public.orders;
      drop function if exists public.test_fulfillment_failure();
      truncate public.issued_licenses, public.key_inventory, public.orders;
    `);
    return fulfillmentDb;
  }
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create role unrelated_role;
      grant usage on schema public to anon, authenticated, service_role, unrelated_role;
      alter default privileges in schema public grant execute on functions to public, anon, authenticated, service_role;
    `);
    await db.exec(readFileSync('supabase/migrations/20261004032804_commerce_and_inventory.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20261004040308_create_fulfillment_rpc.sql', 'utf8'));
    fulfillmentDb = db;
    return db;
  } catch (error) { await db.close(); throw error; }
}

async function order(db: PGlite, reference: string, plan = 'bundle', status = 'pending') {
  return (await db.query<{ id: string }>(`
    insert into public.orders (reference, buyer_email, plan, amount_minor, currency, status, payment_provider)
    values ($1, 'owner@example.com', $2, 3500, 'MYR', $3, 'hitpay') returning id
  `, [reference, plan, status])).rows[0].id;
}

async function stock(db: PGlite, hash: string, plan = 'bundle') {
  return (await db.query<{ id: string }>(`
    insert into public.key_inventory (key_hash, plan_type) values ($1, $2) returning id
  `, [hash, plan])).rows[0].id;
}

async function assign(db: PGlite, id: string | null) {
  return (await db.query<{ license_id: string }>(
    'select public.assign_available_key($1::uuid) as license_id', [id]
  )).rows[0].license_id;
}

async function snapshot(db: PGlite) {
  return (await db.query(`select jsonb_build_object(
    'orders', (select jsonb_agg(o order by o.id) from public.orders o),
    'inventory', (select jsonb_agg(i order by i.id) from public.key_inventory i),
    'licenses', (select jsonb_agg(l order by l.id) from public.issued_licenses l)
  ) as state`)).rows;
}

test('fulfillment RPC is a definer with a fixed public search path and denies every non-service caller', async () => {
  const db = await database();
  try {
    const { rows } = await db.query<{ prosecdef: boolean; proconfig: string[] }>(`
      select prosecdef, proconfig from pg_catalog.pg_proc
      where oid = 'public.assign_available_key(uuid)'::regprocedure
    `);
    assert.equal(rows[0].prosecdef, true);
    assert.deepEqual(rows[0].proconfig, ['search_path=public']);
    for (const role of ['anon', 'authenticated', 'unrelated_role']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(assign(db, null), /permission denied for function/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await assert.rejects(assign(db, null), /ORDER_NOT_FOUND/);
  } finally { await db.exec('reset role'); }
});

test('fulfillment assigns exactly one matching key, copies order ownership, records paid_at and returns the same license on retries', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    for (const [index, plan] of ['bundle', 'semester', 'yearly', 'internal_check'].entries()) {
      const id = await order(db, `ORDER-${plan}`, plan);
      await stock(db, String(index + 1).repeat(64), plan);
      await stock(db, String(index + 5).repeat(64), plan);
      const licenseId = await assign(db, id);
      const license = (await db.query<{ inventory_id: string; order_id: string; buyer_email: string; plan_type: string; status: string; device_id: null; activated_at: null }>(
        'select inventory_id, order_id, buyer_email, plan_type, status, device_id, activated_at from public.issued_licenses where id=$1', [licenseId]
      )).rows[0];
      assert.equal(license.order_id, id);
      assert.equal(license.buyer_email, 'owner@example.com');
      assert.equal(license.plan_type, plan);
      assert.equal(license.status, 'active');
      assert.equal(license.device_id, null);
      assert.equal(license.activated_at, null);
      assert.equal((await db.query<{ status: string }>(
        'select status from public.key_inventory where id=$1', [license.inventory_id]
      )).rows[0].status, 'assigned');
      const paid = (await db.query<{ status: string; has_paid_at: boolean }>(
        'select status, paid_at is not null as has_paid_at from public.orders where id=$1', [id]
      )).rows[0];
      assert.deepEqual(paid, { status: 'paid', has_paid_at: true });
      const before = await snapshot(db);
      assert.equal(await assign(db, id), licenseId);
      assert.deepEqual(await snapshot(db), before);
      assert.equal((await db.query<{ count: number }>(
        "select count(*)::int as count from public.key_inventory where plan_type=$1 and status='available'", [plan]
      )).rows[0].count, 1);
    }
  } finally { await db.exec('reset role'); }
});

test('unknown, cancelled, refunded and inconsistent paid orders cannot consume inventory', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    await stock(db, 'a'.repeat(64));
    for (const status of ['cancelled', 'refunded', 'paid']) {
      const id = await order(db, `ORDER-${status}`, 'bundle', status);
      const before = await snapshot(db);
      await assert.rejects(assign(db, id), status === 'paid' ? /FULFILLMENT_INCONSISTENT/ : /ORDER_NOT_PENDING/);
      assert.deepEqual(await snapshot(db), before);
    }
    const before = await snapshot(db);
    await assert.rejects(assign(db, '00000000-0000-4000-8000-000000000001'), /ORDER_NOT_FOUND/);
    assert.deepEqual(await snapshot(db), before);
  } finally { await db.exec('reset role'); }
});

test('inventory exhaustion rolls back payment and issuance, then replenishment can fulfill the same order', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const id = await order(db, 'EMPTY-STOCK');
    await stock(db, 'a'.repeat(64), 'yearly');
    const before = await snapshot(db);
    await assert.rejects(assign(db, id), /INVENTORY_EXHAUSTED/);
    assert.deepEqual(await snapshot(db), before);
    await stock(db, 'b'.repeat(64));
    assert.match(await assign(db, id), /^[0-9a-f-]{36}$/);
    assert.equal((await db.query<{ count: number }>(
      "select count(*)::int as count from public.key_inventory where plan_type='yearly' and status='available'"
    )).rows[0].count, 1);
  } finally { await db.exec('reset role'); }
});

test('errors during license insertion or the final payment update roll back all preceding mutations', async () => {
  const db = await database();
  try {
    const id = await order(db, 'LATE-FAILURE');
    await stock(db, 'a'.repeat(64));
    await db.exec(`create function public.test_fulfillment_failure() returns trigger language plpgsql as $$
      begin raise exception 'FORCED_LATE_FAILURE'; end $$`);
    for (const [table, operation] of [['issued_licenses', 'insert'], ['orders', 'update']]) {
      await db.exec(`create trigger test_failure before ${operation} on public.${table}
        for each row execute function public.test_fulfillment_failure()`);
      const before = await snapshot(db);
      await db.exec('set role service_role');
      await assert.rejects(assign(db, id), /FORCED_LATE_FAILURE/);
      await db.exec('reset role');
      assert.deepEqual(await snapshot(db), before);
      await db.exec(`drop trigger test_failure on public.${table}`);
    }
  } finally { await db.exec('reset role'); }
});

test('callback retries keep one license per order, never reactivate revoked licenses and do not reuse assigned stock', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const first = await order(db, 'RETRY-1');
    const second = await order(db, 'RETRY-2');
    await stock(db, 'a'.repeat(64));
    const license = await assign(db, first);
    await db.query("update public.issued_licenses set status='revoked' where id=$1", [license]);
    // PGlite has one connection: this covers replay behavior, not lock contention
    // between independent PostgreSQL sessions.
    const retries = await Promise.all(Array.from({ length: 8 }, () => assign(db, first)));
    assert.ok(retries.every(result => result === license));
    await assert.rejects(assign(db, second), /INVENTORY_EXHAUSTED/);
    assert.equal((await db.query<{ status: string }>(
      'select status from public.issued_licenses where id=$1', [license]
    )).rows[0].status, 'revoked');
    assert.equal((await db.query<{ count: number }>(
      'select count(*)::int as count from public.issued_licenses'
    )).rows[0].count, 1);
  } finally { await db.exec('reset role'); }
});
