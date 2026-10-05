import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import type { ActivationKeyPlan } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const publicPlans = {
  bundle: 'bundle', extension: 'extension', semester: 'mobile_notification', yearly: 'mobile_notification_yearly',
} as const;
const billNames = {
  bundle: 'Auto Check Bundle', extension: 'Auto Check Extension',
  semester: 'Auto Check Semester', yearly: 'Auto Check Yearly',
} as const;

type DiagnosticStatus = 'missing' | 'empty' | 'set' | 'invalid';
type DiagnosticError = Error & { diagnosticCode?: string };

function envStatus(value: string | undefined): DiagnosticStatus {
  if (value === undefined) return 'missing';
  return value.trim() ? 'set' : 'empty';
}

function configSnapshot(appUrlStatus?: DiagnosticStatus) {
  return {
    APP_URL: appUrlStatus ?? envStatus(process.env.APP_URL),
    TOYYIBPAY_SECRET_KEY: envStatus(process.env.TOYYIBPAY_SECRET_KEY),
    TOYYIBPAY_CATEGORY_CODE: envStatus(process.env.TOYYIBPAY_CATEGORY_CODE),
    STRIPE_SECRET_KEY: envStatus(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: envStatus(process.env.STRIPE_WEBHOOK_SECRET),
  } satisfies Record<string, DiagnosticStatus>;
}

function configError(reasonCode: string) {
  const error = new Error('TOYYIBPAY_NOT_CONFIGURED') as DiagnosticError;
  error.diagnosticCode = reasonCode;
  return error;
}

function logConfig(reasonCode: string, appUrlInvalidFields: string[] = []) {
  console.error('[checkout-diag]', JSON.stringify({
    provider: 'toyyibpay', event: 'configuration', reasonCode,
    config: configSnapshot(appUrlInvalidFields.length ? 'invalid' : undefined),
    ...(appUrlInvalidFields.length ? { APP_URL_invalidFields: appUrlInvalidFields } : {}),
  }));
}

function redactLogText(value: unknown) {
  if (value === undefined || value === null) return null;
  const secret = process.env.TOYYIBPAY_SECRET_KEY;
  const category = process.env.TOYYIBPAY_CATEGORY_CODE;
  return String(value).replace(secret || /$^/g, '[redacted-secret]').replace(category || /$^/g, '[redacted-category]')
    .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[redacted-email]');
}

class ToyyibPayProviderError extends Error {
  constructor(public readonly code: string, public readonly stage: string, public readonly statusCode: number | null, public readonly providerMessage: unknown) {
    super(code);
  }
}

function responseMessage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = (value as Record<string, unknown>).message;
  return typeof message === 'string' ? message : null;
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function checkoutOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === 'production') {
    logConfig(envStatus(process.env.APP_URL) === 'missing' ? 'APP_URL_MISSING' : 'APP_URL_EMPTY');
    throw configError(envStatus(process.env.APP_URL) === 'missing' ? 'APP_URL_MISSING' : 'APP_URL_EMPTY');
  }
  let origin: URL;
  try { origin = new URL(configured || requestOrigin); }
  catch { logConfig('APP_URL_INVALID', ['protocol', 'hostname']); throw configError('APP_URL_INVALID'); }
  const local = process.env.NODE_ENV !== 'production' && origin.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((!local && origin.protocol !== 'https:') || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    const invalidFields = [
      ...((!local && origin.protocol !== 'https:') ? ['protocol'] : []),
      ...(!origin.hostname ? ['hostname'] : []),
      ...((origin.username || origin.password) ? ['username/password'] : []),
      ...(origin.pathname !== '/' ? ['path'] : []),
      ...(origin.search ? ['query parameters'] : []),
      ...(origin.hash ? ['fragment'] : []),
    ];
    logConfig('APP_URL_INVALID', invalidFields);
    throw configError('APP_URL_INVALID');
  }
  if (request.headers.get('origin') !== origin.origin) throw Object.assign(new Error('INVALID_ORIGIN'), { status: 403 });
  return origin.origin;
}

async function readJSON(request: Request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw Object.assign(new Error('JSON_REQUIRED'), { status: 415 });
  }
  if (!request.body) throw Object.assign(new Error('INVALID_CHECKOUT'), { status: 400 });
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch { throw Object.assign(new Error('INVALID_CHECKOUT'), { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const origin = checkoutOrigin(request);
    const secret = process.env.TOYYIBPAY_SECRET_KEY?.trim();
    const category = process.env.TOYYIBPAY_CATEGORY_CODE?.trim();
    if (!secret) {
      logConfig(envStatus(process.env.TOYYIBPAY_SECRET_KEY) === 'missing' ? 'TOYYIBPAY_SECRET_MISSING' : 'TOYYIBPAY_SECRET_EMPTY');
      throw configError(envStatus(process.env.TOYYIBPAY_SECRET_KEY) === 'missing' ? 'TOYYIBPAY_SECRET_MISSING' : 'TOYYIBPAY_SECRET_EMPTY');
    }
    if (!category) {
      logConfig(envStatus(process.env.TOYYIBPAY_CATEGORY_CODE) === 'missing' ? 'TOYYIBPAY_CATEGORY_MISSING' : 'TOYYIBPAY_CATEGORY_EMPTY');
      throw configError(envStatus(process.env.TOYYIBPAY_CATEGORY_CODE) === 'missing' ? 'TOYYIBPAY_CATEGORY_MISSING' : 'TOYYIBPAY_CATEGORY_EMPTY');
    }

    const body = await readJSON(request);
    if (typeof body.plan !== 'string' || !Object.hasOwn(publicPlans, body.plan) || typeof body.buyer_email !== 'string') {
      throw Object.assign(new Error('INVALID_CHECKOUT'), { status: 400 });
    }
    const plan = body.plan as keyof typeof publicPlans;
    const email = body.buyer_email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw Object.assign(new Error('INVALID_EMAIL'), { status: 400 });
    }

    const config = await getPublishedSiteConfig();
    if (!purchaseAllowed(config, publicPlans[plan])) throw Object.assign(new Error('CHECKOUT_UNAVAILABLE'), { status: 409 });
    const amountMinor = packagePrice(config, publicPlans[plan]);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new Error('INVALID_PRICE');

    const orderId = randomUUID();
    const supabase = getCommerceDatabase();
    const { error: insertError } = await supabase.from('orders').insert({
      id: orderId, reference: orderId, buyer_email: email, plan: plan as ActivationKeyPlan,
      amount_minor: amountMinor, currency: 'MYR', status: 'pending', payment_provider: 'toyyibpay',
    });
    if (insertError) throw new Error('ORDER_INSERT_FAILED');

    const returnUrl = new URL('/success', origin);
    returnUrl.searchParams.set('order_id', orderId);
    const fields = new URLSearchParams({
      userSecretKey: secret,
      categoryCode: category,
      billName: billNames[plan],
      billDescription: `Auto Check ${plan} License`,
      billPriceSetting: '1',
      billPayorInfo: '1',
      billAmount: String(amountMinor),
      billReturnUrl: returnUrl.href,
      billCallbackUrl: new URL('/api/webhook/toyyibpay', origin).href,
      billExternalReferenceNo: orderId,
      billEmail: email,
      enableDuitNowQR: '1',
      chargeDuitNowQR: '0',
    });

    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch('https://toyyibpay.com/index.php/api/createBill', {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: fields.toString(),
      });
    } catch (error) {
      throw new ToyyibPayProviderError('TOYYIBPAY_PROVIDER_UNAVAILABLE', 'createBill.request', null, error instanceof Error ? error.message : null);
    }
    const rawResult = await gatewayResponse.text();
    let parsedMessage: string | null = null;
    try { parsedMessage = responseMessage(JSON.parse(rawResult)); } catch { /* diagnostic message unavailable */ }
    if (!gatewayResponse.ok || rawResult.length > 65_536) {
      throw new ToyyibPayProviderError('TOYYIBPAY_PROVIDER_UNAVAILABLE', 'createBill.response', gatewayResponse.status, parsedMessage);
    }

    let result: unknown;
    try { result = JSON.parse(rawResult); } catch { throw new ToyyibPayProviderError('TOYYIBPAY_PROVIDER_REJECTED', 'createBill.response_parse', gatewayResponse.status, null); }
    const bill = Array.isArray(result) ? result[0] : result;
    const billCode = bill && typeof bill === 'object' ? (bill as Record<string, unknown>).BillCode : undefined;
    if (typeof billCode !== 'string' || !/^[A-Za-z0-9_-]{2,64}$/.test(billCode)) {
      throw new ToyyibPayProviderError('TOYYIBPAY_PROVIDER_REJECTED', 'createBill.response_validation', gatewayResponse.status, responseMessage(bill));
    }

    const { data: saved, error: saveError } = await supabase.from('orders')
      .update({ provider_request_id: billCode }).eq('id', orderId).eq('status', 'pending')
      .is('provider_request_id', null).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('ORDER_SAVE_FAILED');
    return response({ url: `https://toyyibpay.com/${billCode}`, reference: orderId });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status : error instanceof Error && error.message === 'TOYYIBPAY_NOT_CONFIGURED' ? 503
        : error instanceof Error && error.message === 'TOYYIBPAY_PROVIDER_UNAVAILABLE' ? 502
          : error instanceof Error && error.message === 'TOYYIBPAY_PROVIDER_REJECTED' ? 502
            : error instanceof Error && error.message === 'INVALID_PRICE' ? 503
              : error instanceof Error && error.message === 'INVALID_ORIGIN' ? 403
                : error instanceof Error && error.message === 'ORDER_INSERT_FAILED' ? 500
                  : error instanceof Error && error.message === 'ORDER_SAVE_FAILED' ? 500 : 500;
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECKOUT_FAILED';
    if (error instanceof ToyyibPayProviderError) {
      console.error('[checkout-diag]', JSON.stringify({ provider: 'toyyibpay', event: 'provider_error', stage: error.stage,
        statusCode: error.statusCode, message: redactLogText(error.providerMessage), environment: 'production' }));
    } else if (status >= 500) {
      const diagnosticCode = error instanceof Error && 'diagnosticCode' in error ? (error as DiagnosticError).diagnosticCode : code;
      if (diagnosticCode && !(error instanceof Error && 'diagnosticCode' in error)) {
        console.error('[checkout-diag]', JSON.stringify({ provider: 'toyyibpay', event: 'checkout_failure', reasonCode: diagnosticCode, config: configSnapshot() }));
      }
    }
    return response({ error: code }, status);
  }
}
