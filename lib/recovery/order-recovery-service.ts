import { randomUUID } from 'node:crypto';
import { generateOrderAccessToken } from '../order-access-token';

export interface RecoveryRequest {
  email: string;
  clientIp?: string;
}

export interface RecoveryResult {
  success: boolean;
  message?: string;
  error?: string;
}

// In-memory rate limiting: 5 requests per minute per IP
const ipRequestHistory = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const history = (ipRequestHistory.get(ip) || []).filter(t => now - t < windowMs);

  if (history.length >= 5) {
    return false; // Exceeded limit
  }

  history.push(now);
  ipRequestHistory.set(ip, history);
  return true;
}

export async function handleOrderRecovery(
  db: any,
  request: RecoveryRequest
): Promise<RecoveryResult> {
  const email = (request.email || '').trim().toLowerCase();

  // 1. Email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return {
      success: false,
      error: 'INVALID_EMAIL',
    };
  }

  // 2. IP rate limiting
  const ip = request.clientIp || '127.0.0.1';
  if (!checkRateLimit(ip)) {
    return {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
    };
  }

  // 3. Find matching active orders
  let orders: any[] = [];
  if (typeof db.query === 'function') {
    const res = await db.query(
      `select id, reference, buyer_email, plan from public.orders
       where buyer_email = $1 and status in ('paid', 'fulfilled')
       order by created_at desc limit 5`,
      [email]
    );
    orders = res.rows || [];
  } else if (typeof db.from === 'function') {
    const { data } = await db
      .from('orders')
      .select('id, reference, buyer_email, plan')
      .eq('buyer_email', email)
      .in('status', ['paid', 'fulfilled'])
      .order('created_at', { ascending: false })
      .limit(5);
    orders = data || [];
  }

  // 4. If orders exist, generate recovery token and enqueue outbox task
  for (const order of orders) {
    const { token, tokenHash } = generateOrderAccessToken();
    const outboxId = randomUUID();
    const idempotencyKey = `recovery-${order.id}-${Date.now()}`;

    // Update order with access token hash
    if (typeof db.query === 'function') {
      await db.query(
        `update public.orders set order_access_token_hash = $1 where id = $2`,
        [tokenHash, order.id]
      );
      await db.query(
        `insert into public.order_outbox (
           id, order_id, event_type, idempotency_key, payload, status
         ) values ($1, $2, 'order_recovery_email', $3, $4, 'pending')`,
        [
          outboxId,
          order.id,
          idempotencyKey,
          JSON.stringify({
            order_id: order.id,
            email: order.buyer_email,
            reference: order.reference,
            plan: order.plan,
            token,
          }),
        ]
      );
    } else if (typeof db.from === 'function') {
      await db.from('orders').update({ order_access_token_hash: tokenHash }).eq('id', order.id);
      await db.from('order_outbox').insert({
        id: outboxId,
        order_id: order.id,
        event_type: 'order_recovery_email',
        idempotency_key: idempotencyKey,
        payload: {
          order_id: order.id,
          email: order.buyer_email,
          reference: order.reference,
          plan: order.plan,
          token,
        },
        status: 'pending',
      });
    }
  }

  // 5. Always return identical message regardless of whether an order was found (Anti-Enumeration)
  return {
    success: true,
    message: 'If an active order exists for this email, recovery instructions have been sent.',
  };
}
