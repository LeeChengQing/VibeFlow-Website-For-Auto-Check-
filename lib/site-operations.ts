import 'server-only';

import { randomUUID } from 'node:crypto';
import { requireAdminSession } from '@/lib/admin-auth';
import { isLocalAdminPreview } from '@/lib/admin-local';
import type { Order, Ticket } from '@/lib/types';

export type SiteOperationsData = { local: boolean; orders: Order[]; tickets: Ticket[] };
export type SiteOperation = 'resend' | 'refund' | 'reply' | 'close' | 'reopen';
export type OperationPayload = { email?: string; message?: string };
export type OperationResult = { ok: true; message: string } | { error: string };

function getCommerceDb(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCommerceDatabase, isCommerceConfigured } = require('@/lib/supabase/commerce');
    if (isCommerceConfigured()) return getCommerceDatabase();
  } catch {}
  return null;
}

export async function getSiteOperations(): Promise<SiteOperationsData> {
  await requireAdminSession();

  const db = getCommerceDb();
  if (db) {
    let orderRows: any[] = [];
    if (typeof db.query === 'function') {
      const res = await db.query(
        `select id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider, provider_payment_id, fulfillment_error, payment_confirmed_at
         from public.orders
         order by id desc`
      );
      orderRows = res.rows;
    } else if (typeof db.from === 'function') {
      const { data } = await db
        .from('orders')
        .select('id, reference, buyer_email, plan, amount_minor, currency, status, payment_provider, provider_payment_id, fulfillment_error, payment_confirmed_at')
        .order('id', { ascending: false });
      orderRows = data || [];
    }

    const orders: Order[] = orderRows.map(r => ({
      id: r.id,
      reference: r.reference,
      token: '',
      plan: r.plan,
      amount: r.amount_minor,
      locale: 'zh',
      email: r.buyer_email,
      status: r.status,
      createdAt: r.payment_confirmed_at || new Date().toISOString(),
      paidAt: r.payment_confirmed_at,
      expiresAt: null,
      delivery: r.fulfillment_error ? `ERROR: ${r.fulfillment_error}` : null,
      resends: 0,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { listSupportTickets } = require('@/lib/support/support-service');
    const tickets = await listSupportTickets(db);
    return { local: false, orders, tickets };
  }

  if (!await isLocalAdminPreview()) return { local: false, orders: [], tickets: [] };
  const store = await import('@/lib/store');
  return { local: true, orders: store.listOrders(), tickets: store.listTickets() };
}

export function validateOperation(action: unknown, id: unknown, input: unknown): { action: SiteOperation; id: string; payload: OperationPayload } {
  if (!['resend', 'refund', 'reply', 'close', 'reopen'].includes(String(action)) ||
      typeof action !== 'string' || typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_OPERATION');
  const raw = input as Record<string, unknown>;
  const payload: OperationPayload = {};
  if (action === 'resend' && raw.email !== undefined) {
    if (typeof raw.email !== 'string' || raw.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim())) throw new Error('INVALID_EMAIL');
    payload.email = raw.email.trim().toLowerCase();
  }
  if (action === 'reply') {
    if (typeof raw.message !== 'string' || !raw.message.trim() || raw.message.trim().length > 4000) throw new Error('INVALID_TEXT');
    payload.message = raw.message.trim();
  }
  return { action: action as SiteOperation, id, payload };
}

/** Every entry point authenticates before loading the database. */
export async function runSiteOperation(action: unknown, id: unknown, input: unknown = {}): Promise<string> {
  await requireAdminSession();
  const db = getCommerceDb();
  if (!db && !await isLocalAdminPreview()) throw new Error('LOCAL_ONLY');
  const operation = validateOperation(action, id, input);

  if (db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const {
      adminReplySupportTicket,
      adminCloseSupportTicket,
      adminReopenSupportTicket,
    } = require('@/lib/support/support-service');

    switch (operation.action) {
      case 'reply': {
        await adminReplySupportTicket(db, operation.id, operation.payload.message);
        return 'Reply saved to support ticket.';
      }
      case 'close': {
        await adminCloseSupportTicket(db, operation.id);
        return 'Support ticket closed.';
      }
      case 'reopen': {
        await adminReopenSupportTicket(db, operation.id);
        return 'Support ticket reopened.';
      }
      case 'refund': {
        let order: any = null;
        if (typeof db.query === 'function') {
          const rows = (await db.query(`select * from public.orders where id = $1`, [operation.id])).rows;
          if (rows.length > 0) order = rows[0];
        } else if (typeof db.from === 'function') {
          const { data } = await db.from('orders').select('*').eq('id', operation.id).maybeSingle();
          order = data;
        }
        if (!order) throw new Error('NOT_FOUND');

        if (typeof db.query === 'function') {
          await db.query(`select public.process_refund($1, $2, $3, $4)`, [
            order.id,
            order.amount_minor,
            'Admin initiated refund',
            'admin_portal',
          ]);
        } else if (typeof db.rpc === 'function') {
          const { error } = await db.rpc('process_refund', {
            p_order_id: order.id,
            p_amount_minor: order.amount_minor,
            p_reason: 'Admin initiated refund',
            p_initiated_by: 'admin_portal',
          });
          if (error) throw error;
        }

        return `Refund processed and license revoked for order ${order.reference}.`;
      }
      case 'resend': {
        let order: any = null;
        if (typeof db.query === 'function') {
          const rows = (await db.query(`select * from public.orders where id = $1`, [operation.id])).rows;
          if (rows.length > 0) order = rows[0];
        } else if (typeof db.from === 'function') {
          const { data } = await db.from('orders').select('*').eq('id', operation.id).maybeSingle();
          order = data;
        }
        if (!order) throw new Error('NOT_FOUND');

        const emailToSend = operation.payload.email || order.buyer_email;
        if (operation.payload.email && operation.payload.email !== order.buyer_email) {
          if (typeof db.query === 'function') {
            await db.query(`update public.orders set buyer_email = $1 where id = $2`, [emailToSend, order.id]);
          } else if (typeof db.from === 'function') {
            await db.from('orders').update({ buyer_email: emailToSend }).eq('id', order.id);
          }
        }

        const taskId = randomUUID();
        const idempotencyKey = `resend-${order.id}-${Date.now()}`;
        const payload = {
          order_id: order.id,
          email: emailToSend,
          plan: order.plan,
        };

        if (typeof db.query === 'function') {
          await db.query(
            `insert into public.order_outbox (id, order_id, event_type, idempotency_key, payload, status, created_at)
             values ($1, $2, 'order_fulfillment_email', $3, $4, 'pending', now())`,
            [taskId, order.id, idempotencyKey, JSON.stringify(payload)]
          );
        } else if (typeof db.from === 'function') {
          await db.from('order_outbox').insert({
            id: taskId,
            order_id: order.id,
            event_type: 'order_fulfillment_email',
            idempotency_key: idempotencyKey,
            payload,
            status: 'pending',
          });
        }

        return `Fulfillment delivery enqueued for ${order.reference}.`;
      }
    }
  }

  if (!await isLocalAdminPreview()) throw new Error('LOCAL_ONLY');
  const store = await import('@/lib/store');
  switch (operation.action) {
    case 'resend': {
      const order = store.resendOrder(operation.id, operation.payload.email);
      return `Local delivery refreshed for ${order.reference}; no email sent.`;
    }
    case 'refund': {
      const order = store.refundOrder(operation.id);
      return `Simulated refund recorded for ${order.reference}; no money moved.`;
    }
    case 'reply': store.replyTicket(operation.id, operation.payload.message, 'admin'); return 'Reply saved to the local support ticket.';
    case 'close': store.closeTicket(operation.id); return 'Local support ticket closed.';
    case 'reopen': store.reopenTicket(operation.id); return 'Local support ticket reopened.';
  }
}
