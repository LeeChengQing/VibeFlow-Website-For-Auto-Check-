import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('HitPay tracking keeps capture durable across stock failure and preserves service-only privileges', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon, authenticated, service_role;');
    for (const path of ['20261004032804_commerce_and_inventory.sql', '20261004040308_create_fulfillment_rpc.sql', '20261004042022_hitpay_payment_tracking.sql']) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
    await db.exec('set role service_role');
    const id = (await db.query<{ id: string }>(`insert into public.orders(reference,buyer_email,plan,amount_minor,currency,payment_provider,provider_request_id) values ('tracking-order','owner@example.com','bundle',3500,'MYR','hitpay','request-1') returning id`)).rows[0].id;
    await db.query(`update public.orders set provider_payment_id='transaction-1', payment_confirmed_at=now() where id=$1`, [id]);
    await assert.rejects(db.query('select public.assign_available_key($1::uuid)', [id]), /INVENTORY_EXHAUSTED/);
    await db.query(`update public.orders set fulfillment_error='INVENTORY_EXHAUSTED' where id=$1`, [id]);
    const pending = (await db.query<{ status: string; provider_payment_id: string; captured: boolean; fulfillment_error: string }>(`select status,provider_payment_id,payment_confirmed_at is not null as captured,fulfillment_error from public.orders where id=$1`, [id])).rows[0];
    assert.deepEqual(pending, { status: 'pending', provider_payment_id: 'transaction-1', captured: true, fulfillment_error: 'INVENTORY_EXHAUSTED' });
    await assert.rejects(db.exec(`insert into public.orders(reference,buyer_email,plan,amount_minor,currency,payment_provider,provider_request_id) values ('duplicate','other@example.com','bundle',3500,'MYR','hitpay','request-1')`), /unique constraint/);
    await assert.rejects(db.query(`update public.orders set provider_payment_id=null where id=$1`, [id]), /orders_payment_confirmation_check/);
    await db.exec(`insert into public.key_inventory(key_hash,plan_type) values ('${'a'.repeat(64)}','bundle')`);
    await db.query('select public.assign_available_key($1::uuid)', [id]);
    assert.equal((await db.query<{ status: string }>('select status from public.orders where id=$1', [id])).rows[0].status, 'paid');
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query('select provider_request_id,payment_confirmed_at,fulfillment_error from public.orders'), /permission denied/);
    }
  } finally { await db.close(); }
});
