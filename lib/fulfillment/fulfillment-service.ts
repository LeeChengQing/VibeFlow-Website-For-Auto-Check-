import { randomUUID } from 'node:crypto';

async function queryDb<T>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (typeof db.query === 'function') {
    const res = await db.query(sql, params);
    return res.rows as T[];
  }
  throw new Error('Unsupported database client for fulfillment service');
}

export async function recordInventoryExhaustion(db: any, orderId: string): Promise<void> {
  const now = new Date().toISOString();

  let order: any = null;
  if (typeof db.query === 'function') {
    const orders = await queryDb<any>(db, `select * from public.orders where id = $1`, [orderId]);
    if (orders.length > 0) order = orders[0];
  } else if (typeof db.from === 'function') {
    const { data } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    order = data;
  }

  if (!order) throw new Error('ORDER_NOT_FOUND');

  // 1. Update order fulfillment error
  if (typeof db.query === 'function') {
    await db.query(
      `update public.orders set fulfillment_error = 'INVENTORY_EXHAUSTED' where id = $1`,
      [orderId]
    );
  } else if (typeof db.from === 'function') {
    await db.from('orders').update({ fulfillment_error: 'INVENTORY_EXHAUSTED' }).eq('id', orderId);
  }

  // 2. Enqueue alert into order_outbox
  const outboxId = randomUUID();
  const idempotencyKey = `exhausted-alert-${orderId}`;
  const payload = {
    order_id: orderId,
    email: order.buyer_email,
    plan: order.plan,
    currency: order.currency,
    amount_minor: order.amount_minor,
    timestamp: now,
  };

  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.order_outbox (
        id, order_id, event_type, idempotency_key, payload, status, created_at
      ) values ($1, $2, 'inventory_exhausted_alert', $3, $4, 'pending', $5)
      on conflict (idempotency_key) do nothing`,
      [outboxId, orderId, idempotencyKey, JSON.stringify(payload), now]
    );
  } else if (typeof db.from === 'function') {
    await db.from('order_outbox').insert({
      id: outboxId,
      order_id: orderId,
      event_type: 'inventory_exhausted_alert',
      idempotency_key: idempotencyKey,
      payload,
      status: 'pending',
      created_at: now,
    });
  }

  // 3. Write to audit_log
  const auditId = randomUUID();
  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.audit_log (id, actor, action, entity, entity_id, meta, created_at)
       values ($1, 'system', 'inventory_exhausted', 'orders', $2, $3, $4)`,
      [auditId, orderId, JSON.stringify(payload), now]
    );
  } else if (typeof db.from === 'function') {
    await db.from('audit_log').insert({
      id: auditId,
      actor: 'system',
      action: 'inventory_exhausted',
      entity: 'orders',
      entity_id: orderId,
      meta: payload,
      created_at: now,
    });
  }
}

export async function retryOrderFulfillment(
  db: any,
  orderId: string
): Promise<{ ok: boolean; licenseId: string }> {
  let order: any = null;
  if (typeof db.query === 'function') {
    const orders = await queryDb<any>(db, `select * from public.orders where id = $1`, [orderId]);
    if (orders.length > 0) order = orders[0];
  } else if (typeof db.from === 'function') {
    const { data } = await db.from('orders').select('*').eq('id', orderId).maybeSingle();
    order = data;
  }

  if (!order) throw new Error('ORDER_NOT_FOUND');

  let licenseId: string | null = null;
  if (typeof db.query === 'function') {
    try {
      const res = await db.query(
        `select public.assign_available_key($1) as license_id`,
        [orderId]
      );
      licenseId = res.rows[0]?.license_id;
    } catch (err: any) {
      if (err.message?.includes('INVENTORY_EXHAUSTED')) {
        await recordInventoryExhaustion(db, orderId);
        throw new Error('INVENTORY_EXHAUSTED');
      }
      throw err;
    }
  } else if (typeof db.rpc === 'function') {
    const { data, error } = await db.rpc('assign_available_key', { p_order_id: orderId });
    if (error) {
      if (error.message?.includes('INVENTORY_EXHAUSTED')) {
        await recordInventoryExhaustion(db, orderId);
        throw new Error('INVENTORY_EXHAUSTED');
      }
      throw error;
    }
    licenseId = data;
  }

  if (!licenseId) throw new Error('FULFILLMENT_FAILED');

  // Clear fulfillment_error on success
  if (typeof db.query === 'function') {
    await db.query(`update public.orders set fulfillment_error = null where id = $1`, [orderId]);
  } else if (typeof db.from === 'function') {
    await db.from('orders').update({ fulfillment_error: null }).eq('id', orderId);
  }

  // Record audit log
  const now = new Date().toISOString();
  const auditId = randomUUID();
  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.audit_log (id, actor, action, entity, entity_id, meta, created_at)
       values ($1, 'admin', 'retry_fulfillment_success', 'orders', $2, $3, $4)`,
      [auditId, orderId, JSON.stringify({ licenseId }), now]
    );
  } else if (typeof db.from === 'function') {
    await db.from('audit_log').insert({
      id: auditId,
      actor: 'admin',
      action: 'retry_fulfillment_success',
      entity: 'orders',
      entity_id: orderId,
      meta: { licenseId },
      created_at: now,
    });
  }

  return { ok: true, licenseId };
}
