import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { fulfillStripeSession } from '@/lib/stripe-fulfillment';

async function queryDb<T>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (typeof db.query === 'function') {
    const res = await db.query(sql, params);
    return res.rows as T[];
  }
  throw new Error('Unsupported database client for stripe webhook event processing');
}

export async function handleStripeWebhookEvent(db: any, event: Stripe.Event): Promise<void> {
  const now = new Date().toISOString();

  // 1. Audit log the incoming event
  const auditId = randomUUID();
  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.audit_log (id, actor, action, entity, entity_id, meta, created_at)
       values ($1, 'stripe', $2, 'webhook', $3, $4, $5)`,
      [auditId, event.type, event.id, JSON.stringify({ type: event.type }), now]
    );
  } else if (typeof db.from === 'function') {
    await db.from('audit_log').insert({
      id: auditId,
      actor: 'stripe',
      action: event.type,
      entity: 'webhook',
      entity_id: event.id,
      meta: { type: event.type },
      created_at: now,
    });
  }

  // 2. Dispatch by event type
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      await fulfillStripeSession(event.data.object as Stripe.Checkout.Session);
      break;
    }

    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session?.id) break;

      if (typeof db.query === 'function') {
        await db.query(
          `update public.orders
           set status = 'cancelled'
           where provider_request_id = $1 and status = 'pending'`,
          [session.id]
        );
      } else if (typeof db.from === 'function') {
        await db
          .from('orders')
          .update({ status: 'cancelled' })
          .eq('provider_request_id', session.id)
          .eq('status', 'pending');
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as any;
      const paymentIntentId = typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id || charge.id;

      const metadataOrderId = charge.metadata?.order_id;
      if (!paymentIntentId && !metadataOrderId) break;

      let order: any = null;
      if (typeof db.query === 'function') {
        const rows = await queryDb<any>(
          db,
          `select * from public.orders
           where (provider_payment_id = $1 and $1 is not null)
              or (id = $2 and $2 is not null)
           limit 1`,
          [paymentIntentId || null, metadataOrderId || null]
        );
        if (rows.length > 0) order = rows[0];
      } else if (typeof db.from === 'function') {
        if (paymentIntentId) {
          const { data } = await db
            .from('orders')
            .select('*')
            .eq('provider_payment_id', paymentIntentId)
            .maybeSingle();
          order = data;
        }
        if (!order && metadataOrderId) {
          const { data } = await db
            .from('orders')
            .select('*')
            .eq('id', metadataOrderId)
            .maybeSingle();
          order = data;
        }
      }

      if (!order) break;
      if (order.status === 'refunded') break; // Idempotent: already refunded

      const refundAmount = charge.amount_refunded ?? charge.amount ?? order.amount_minor;

      if (typeof db.query === 'function') {
        await db.query(
          `select public.process_refund($1, $2, $3, $4)`,
          [order.id, refundAmount, 'Stripe charge refunded', 'stripe_webhook']
        );
      } else if (typeof db.rpc === 'function') {
        await db.rpc('process_refund', {
          p_order_id: order.id,
          p_amount_minor: refundAmount,
          p_reason: 'Stripe charge refunded',
          p_initiated_by: 'stripe_webhook',
        });
      }
      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as any;
      const paymentIntentId = dispute.payment_intent || dispute.charge;
      const metadataOrderId = dispute.metadata?.order_id;
      if (!paymentIntentId && !metadataOrderId) break;

      let order: any = null;
      if (typeof db.query === 'function') {
        const rows = await queryDb<any>(
          db,
          `select * from public.orders
           where (provider_payment_id = $1 and $1 is not null)
              or (id = $2 and $2 is not null)
           limit 1`,
          [paymentIntentId || null, metadataOrderId || null]
        );
        if (rows.length > 0) order = rows[0];
      } else if (typeof db.from === 'function') {
        if (paymentIntentId) {
          const { data } = await db
            .from('orders')
            .select('*')
            .eq('provider_payment_id', paymentIntentId)
            .maybeSingle();
          order = data;
        }
        if (!order && metadataOrderId) {
          const { data } = await db
            .from('orders')
            .select('*')
            .eq('id', metadataOrderId)
            .maybeSingle();
          order = data;
        }
      }

      if (!order) break;

      const disputeId = randomUUID();
      const amount = dispute.amount ?? order.amount_minor;
      const status = dispute.status || 'needs_response';

      if (typeof db.query === 'function') {
        await db.query(
          `insert into public.disputes (
            id, order_id, provider, provider_ref, status, amount_minor, opened_at
          ) values ($1, $2, 'stripe', $3, $4, $5, $6)`,
          [disputeId, order.id, dispute.id, status, amount, now]
        );
      } else if (typeof db.from === 'function') {
        await db.from('disputes').insert({
          id: disputeId,
          order_id: order.id,
          provider: 'stripe',
          provider_ref: dispute.id,
          status,
          amount_minor: amount,
          opened_at: now,
        });
      }
      break;
    }

    default:
      // Other unhandled event types are safely ignored after audit logging
      break;
  }
}
