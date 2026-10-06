import { decryptLicenseKey } from '@/lib/license-key-encryption';
import {
  type EmailDeliveryAdapter,
  MockEmailAdapter,
  ResendEmailAdapter,
} from '@/lib/mail/email-service';

export { type EmailDeliveryAdapter, MockEmailAdapter, ResendEmailAdapter };

export interface OutboxBatchOptions {
  limit?: number;
  emailAdapter?: EmailDeliveryAdapter;
  now?: Date;
}

export interface OutboxBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
}

interface OutboxRow {
  id: string;
  order_id: string;
  event_type: string;
  idempotency_key: string;
  payload: Record<string, any>;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
}

/**
 * Universal query runner supporting both PGlite instances and Supabase client queries.
 */
async function queryRows<T>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (typeof db.query === 'function') {
    // PGlite or standard pg pool
    const result = await db.query(sql, params);
    return result.rows as T[];
  }
  throw new Error('Unsupported database client for outbox processing');
}

/**
 * Processes a batch of pending tasks from the order_outbox table.
 * Implements exponential backoff, retry capping, and atomic status transitions.
 */
export async function processOutboxBatch(
  db: any,
  options?: OutboxBatchOptions
): Promise<OutboxBatchResult> {
  const limit = options?.limit ?? 10;
  const adapter = options?.emailAdapter ?? new ResendEmailAdapter();
  const now = options?.now ?? new Date();

  // 1. Fetch pending tasks due for execution
  const rows = await queryRows<OutboxRow>(
    db,
    `
    select id, order_id, event_type, idempotency_key, payload, status, attempts, max_attempts, next_attempt_at
    from public.order_outbox
    where status in ('pending', 'processing')
      and next_attempt_at <= $1
    order by next_attempt_at asc
    limit $2;
    `,
    [now.toISOString(), limit]
  );

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const currentAttempts = row.attempts + 1;

    try {
      if (row.event_type === 'order_fulfillment_email') {
        let plainKey: string | null = row.payload?.plain_key ?? null;
        if (!plainKey) {
          let invRows: Array<{ encrypted_key: string; key_hash: string }> = [];
          if (row.payload?.license_id) {
            invRows = await queryRows<{ encrypted_key: string; key_hash: string }>(
              db,
              `
              select ki.encrypted_key, ki.key_hash
              from public.issued_licenses il
              join public.key_inventory ki on ki.id = il.inventory_id
              where il.id = $1;
              `,
              [row.payload.license_id]
            );
          } else if (row.payload?.inventory_id) {
            invRows = await queryRows<{ encrypted_key: string; key_hash: string }>(
              db,
              `select encrypted_key, key_hash from public.key_inventory where id = $1;`,
              [row.payload.inventory_id]
            );
          } else if (row.order_id) {
            invRows = await queryRows<{ encrypted_key: string; key_hash: string }>(
              db,
              `
              select ki.encrypted_key, ki.key_hash
              from public.issued_licenses il
              join public.key_inventory ki on ki.id = il.inventory_id
              where il.order_id = $1;
              `,
              [row.order_id]
            );
          }

          if (invRows.length > 0 && invRows[0].encrypted_key && invRows[0].key_hash) {
            plainKey = decryptLicenseKey(invRows[0].encrypted_key, invRows[0].key_hash);
          }
        }

        if (!plainKey) {
          throw new Error(`Cannot decrypt license key for outbox task ${row.id}`);
        }

        await adapter.sendFulfillmentEmail({
          to: row.payload.email,
          orderId: row.order_id,
          plan: row.payload.plan ?? 'unknown',
          licenseKey: plainKey,
        });
      } else if (row.event_type === 'refund_notification_email' || row.event_type === 'order_refund_email') {
        await adapter.sendRefundEmail({
          to: row.payload.email,
          orderId: row.order_id,
          amountMinor: row.payload.amount_minor ?? 0,
          reason: row.payload.reason,
        });
      } else if (row.event_type === 'inventory_exhausted_alert') {
        await adapter.sendAlert({
          title: 'Auto-Check 库存耗尽警报 (Inventory Exhausted)',
          message: `订单 ${row.order_id} 履约失败：库存已耗尽，请及时补充 key 库存。`,
          level: 'critical',
          details: row.payload,
        });
      } else {
        console.warn(`[outbox] Unhandled event_type: ${row.event_type}`);
      }

      // Mark completed
      await db.query(
        `
        update public.order_outbox
        set status = 'completed',
            processed_at = now(),
            attempts = $2,
            last_error = null
        where id = $1;
        `,
        [row.id, currentAttempts]
      );
      succeeded++;
    } catch (err: any) {
      failed++;
      const errorMessage = err?.message ?? String(err);

      if (currentAttempts >= row.max_attempts) {
        // Exceeded max attempts: permanently mark failed
        await db.query(
          `
          update public.order_outbox
          set status = 'failed',
              attempts = $2,
              last_error = $3
          where id = $1;
          `,
          [row.id, currentAttempts, errorMessage]
        );
      } else {
        // Exponential backoff: 2 ^ attempts * 60 seconds (1m, 2m, 4m, 8m, etc.)
        const backoffSeconds = Math.pow(2, currentAttempts) * 60;
        const nextAttempt = new Date(Date.now() + backoffSeconds * 1000);

        await db.query(
          `
          update public.order_outbox
          set status = 'pending',
              attempts = $2,
              next_attempt_at = $3,
              last_error = $4
          where id = $1;
          `,
          [row.id, currentAttempts, nextAttempt.toISOString(), errorMessage]
        );
      }
    }
  }

  return {
    processed: rows.length,
    succeeded,
    failed,
  };
}
