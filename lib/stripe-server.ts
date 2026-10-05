import 'server-only';

import Stripe from 'stripe';

type DiagnosticStatus = 'missing' | 'empty' | 'set' | 'invalid';

function envStatus(value: string | undefined): DiagnosticStatus {
  if (value === undefined) return 'missing';
  return value.trim() ? 'set' : 'empty';
}

function configuredSnapshot(appUrlStatus?: DiagnosticStatus) {
  return {
    APP_URL: appUrlStatus ?? envStatus(process.env.APP_URL),
    TOYYIBPAY_SECRET_KEY: envStatus(process.env.TOYYIBPAY_SECRET_KEY),
    TOYYIBPAY_CATEGORY_CODE: envStatus(process.env.TOYYIBPAY_CATEGORY_CODE),
    STRIPE_SECRET_KEY: envStatus(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: envStatus(process.env.STRIPE_WEBHOOK_SECRET),
  } satisfies Record<string, DiagnosticStatus>;
}

function redactLogText(value: unknown, secret = process.env.STRIPE_SECRET_KEY): string | null {
  if (value === undefined || value === null) return null;
  let text = String(value);
  if (secret) text = text.split(secret).join('[redacted-secret]');
  return text.replace(/https?:\/\/[^\s]+/gi, '[redacted-url]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
}

function stripeModePrefix() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key?.startsWith('sk_test_') || key?.startsWith('sk_live_') ? key.slice(0, 8) : 'unknown';
}

function logStripeConfig(reasonCode: string, appUrlInvalidFields: string[] = []) {
  console.error('[checkout-diag]', JSON.stringify({
    provider: 'stripe', event: 'configuration', reasonCode,
    config: configuredSnapshot(appUrlInvalidFields.length ? 'invalid' : undefined),
    ...(appUrlInvalidFields.length ? { APP_URL_invalidFields: appUrlInvalidFields } : {}),
  }));
}

export class StripeCheckoutError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  // Do not collect payment before signed confirmation and delivery are configured.
  if (!key) {
    logStripeConfig(envStatus(process.env.STRIPE_SECRET_KEY) === 'missing' ? 'STRIPE_SECRET_MISSING' : 'STRIPE_SECRET_EMPTY');
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET?.trim()) {
    logStripeConfig(envStatus(process.env.STRIPE_WEBHOOK_SECRET) === 'missing' ? 'STRIPE_WEBHOOK_SECRET_MISSING' : 'STRIPE_WEBHOOK_SECRET_EMPTY');
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
  return new Stripe(key, { timeout: 20_000, maxNetworkRetries: 0 });
}

export function stripeResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function stripeErrorResponse(error: unknown, apiCall = 'unknown') {
  if (error instanceof StripeCheckoutError) return stripeResponse({ error: error.code }, error.status);
  const stripeError = error as { type?: unknown; code?: unknown; param?: unknown; statusCode?: unknown; message?: unknown; requestId?: unknown; _requestId?: unknown };
  console.error('[checkout-diag]', JSON.stringify({
    provider: 'stripe', event: 'provider_error', apiCall,
    type: redactLogText(stripeError.type), code: redactLogText(stripeError.code),
    param: redactLogText(stripeError.param), statusCode: typeof stripeError.statusCode === 'number' ? stripeError.statusCode : null,
    message: redactLogText(stripeError.message ?? error), requestId: redactLogText(stripeError.requestId ?? stripeError._requestId),
    modePrefix: stripeModePrefix(),
  }));
  return stripeResponse({ error: 'PAYMENT_PROVIDER_UNAVAILABLE' }, 502);
}

export function checkoutOrigin(request: Request) {
  const requestURL = new URL(request.url);
  const raw = process.env.APP_URL?.trim();
  let url: URL;
  try { url = new URL(raw || requestURL.origin); }
  catch {
    logStripeConfig('APP_URL_INVALID', ['protocol', 'hostname']);
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
  const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!raw && !local) {
    logStripeConfig('APP_URL_MISSING');
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
  const invalidFields = [
    ...(!local && url.protocol !== 'https:' ? ['protocol'] : []),
    ...(!url.hostname ? ['hostname'] : []),
    ...(url.username || url.password ? ['username/password'] : []),
    ...(url.pathname !== '/' ? ['path'] : []),
    ...(url.search ? ['query parameters'] : []),
    ...(url.hash ? ['fragment'] : []),
  ];
  if (invalidFields.length) {
    logStripeConfig('APP_URL_INVALID', invalidFields);
    throw new StripeCheckoutError('STRIPE_NOT_CONFIGURED', 503);
  }
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
