import 'server-only';

import Stripe from 'stripe';

export class StripeCheckoutError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  // Do not collect payment before signed confirmation and delivery are configured.
  if (!key || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
  return new Stripe(key, { timeout: 20_000, maxNetworkRetries: 0 });
}

export function stripeResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function stripeErrorResponse(error: unknown) {
  if (error instanceof StripeCheckoutError) return stripeResponse({ error: error.code }, error.status);
  console.error('STRIPE_CHECKOUT_FAILED');
  return stripeResponse({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502);
}

export function checkoutOrigin(request: Request) {
  const requestURL = new URL(request.url);
  const raw = process.env.APP_URL?.trim();
  const url = new URL(raw || requestURL.origin);
  const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!raw && !local) || (!local && url.protocol !== 'https:') || url.username || url.password ||
    url.search || url.hash || url.pathname !== '/') throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  if (request.headers.get('origin') !== url.origin) throw new StripeCheckoutError('INVALID_ORIGIN', 403);
  return url.origin;
}

export async function readStripeBody(request: Request, limit: number) {
  if (!request.body) throw new StripeCheckoutError('INVALID_CHECKOUT', 400);
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
        throw new StripeCheckoutError('BODY_TOO_LARGE', 413);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
