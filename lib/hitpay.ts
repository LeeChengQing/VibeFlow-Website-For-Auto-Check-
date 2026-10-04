import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

export class HitPayError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

export function hitPayResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function hitPaySandboxConfig() {
  const apiKey = process.env.HITPAY_API_KEY?.trim();
  if (process.env.HITPAY_ENABLED !== 'true' || process.env.HITPAY_ENVIRONMENT !== 'sandbox' || !apiKey) {
    throw new HitPayError('HITPAY_NOT_CONFIGURED', 503);
  }
  return { apiKey, endpoint: 'https://api.sandbox.hit-pay.com/v1/payment-requests' };
}

/** Verify the bytes received, before any JSON decoding or database access. */
export function verifyHitPaySignature(raw: Buffer, signature: string | null, salt: string): boolean {
  if (!salt || !signature || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', salt).update(raw).digest();
  const actual = Buffer.from(signature, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function readHitPayBody(request: Request, limit: number): Promise<Buffer> {
  if (!request.body) throw new HitPayError('INVALID_BODY', 400);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HitPayError('BODY_TOO_LARGE', 413);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export function hitPayObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HitPayError('INVALID_PAYLOAD', 400);
  return value as Record<string, unknown>;
}

export function parseHitPayJSON(raw: Buffer): Record<string, unknown> {
  try { return hitPayObject(JSON.parse(raw.toString('utf8'))); }
  catch { throw new HitPayError('INVALID_JSON', 400); }
}

export function isHitPayUUID(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// HitPay amounts are major units. Parse decimal digits, without floating-point rounding.
export function hitPayMinorAmount(value: unknown): number {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(text)) throw new HitPayError('INVALID_AMOUNT', 400);
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export type HitPayPayment = { requestId: string; paymentId: string; reference: string | null; amountMinor: number; currency: string };

/** Registered JSON event webhooks, not the legacy form-encoded payment callback. */
export function extractHitPayPayment(body: Record<string, unknown>, headers: Headers): HitPayPayment | null {
  const object = headers.get('Hitpay-Event-Object');
  const event = headers.get('Hitpay-Event-Type');
  let requestId: unknown, paymentId: unknown, reference: unknown, amount: unknown, currency: unknown;
  if (object === 'payment_request' && event === 'completed') {
    if (body.status !== 'completed') throw new HitPayError('INVALID_PAYMENT_STATUS', 400);
    if (!Array.isArray(body.payments)) throw new HitPayError('INVALID_PAYMENT', 400);
    const payments = body.payments.map(hitPayObject).filter(p => p.status === 'succeeded' || p.status === 'completed');
    if (payments.length !== 1) throw new HitPayError('INVALID_PAYMENT', 400);
    const payment = payments[0];
    if (payment.refunded_amount !== undefined && hitPayMinorAmount(payment.refunded_amount) !== 0) throw new HitPayError('REFUNDED_PAYMENT', 409);
    if (hitPayMinorAmount(body.amount) !== hitPayMinorAmount(payment.amount) ||
        typeof body.currency !== 'string' || typeof payment.currency !== 'string' ||
        body.currency.toUpperCase() !== payment.currency.toUpperCase()) throw new HitPayError('PAYMENT_MISMATCH', 409);
    requestId = body.id; paymentId = payment.id; reference = body.reference_number; amount = payment.amount; currency = payment.currency;
  } else if (object === 'charge' && event === 'created') {
    if (body.status !== 'succeeded') throw new HitPayError('INVALID_PAYMENT_STATUS', 400);
    if (body.refunded_amount !== undefined && hitPayMinorAmount(body.refunded_amount) !== 0) throw new HitPayError('REFUNDED_PAYMENT', 409);
    // POS charges have no payment request and do not correspond to our checkout.
    if (body.payment_request_id === null || body.payment_request_id === undefined) return null;
    requestId = body.payment_request_id; paymentId = body.id; amount = body.amount; currency = body.currency;
    reference = body.payment_request ? hitPayObject(body.payment_request).reference_number : null;
  } else return null;
  if (!isHitPayUUID(requestId) || !isHitPayUUID(paymentId) ||
      (reference !== null && !isHitPayUUID(reference)) || typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency)) {
    throw new HitPayError('INVALID_PAYMENT', 400);
  }
  return { requestId, paymentId, reference: reference as string | null, amountMinor: hitPayMinorAmount(amount), currency: currency.toUpperCase() };
}
