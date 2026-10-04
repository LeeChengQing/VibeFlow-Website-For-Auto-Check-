import { randomUUID } from 'node:crypto';
import { requireAdminSession } from '@/lib/admin-auth';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import type { ActivationKeyPlan } from '@/lib/supabase/admin';
import { isHitPaySandboxCheckoutURL } from '@/lib/hitpay-checkout-url';
import {
  HitPayError, hitPayDiagnosticText, hitPayRawDiagnosticText, hitPayResponse, hitPaySandboxConfig, isHitPayUUID,
  parseHitPayJSON, readHitPayBody,
} from '@/lib/hitpay';

export const runtime = 'nodejs';

const publicPlans = {
  bundle: 'bundle', extension: 'extension',
  semester: 'mobile_notification', yearly: 'mobile_notification_yearly',
} as const;

export async function POST(request: Request) {
  try {
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new HitPayError('JSON_REQUIRED', 415);
    }
    const body = parseHitPayJSON(await readHitPayBody(request, 16_384));
    if (typeof body.plan !== 'string' || !['bundle', 'extension', 'semester', 'yearly', 'internal_check'].includes(body.plan) ||
        typeof body.buyer_email !== 'string') throw new HitPayError('INVALID_CHECKOUT', 400);
    const plan = body.plan as ActivationKeyPlan;
    const email = body.buyer_email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HitPayError('INVALID_EMAIL', 400);

    if (plan === 'internal_check') {
      try { await requireAdminSession(); }
      catch { return hitPayResponse({ error: 'ADMIN_REQUIRED' }, 403); }
    }
    const { apiKey, endpoint } = hitPaySandboxConfig();
    const config = await getPublishedSiteConfig();
    if (config.settings.maintenance || !config.settings.checkoutEnabled ||
        (plan !== 'internal_check' && !purchaseAllowed(config, publicPlans[plan]))) throw new HitPayError('CHECKOUT_UNAVAILABLE', 409);
    const amountMinor = plan === 'internal_check' ? 100 : packagePrice(config, publicPlans[plan]);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new HitPayError('INVALID_PRICE', 503);

    const reference = randomUUID();
    const supabase = getCommerceDatabase();
    const { error: orderError } = await supabase.from('orders').insert({
      id: reference, reference, buyer_email: email, plan, amount_minor: amountMinor,
      currency: 'MYR', status: 'pending', payment_provider: 'hitpay',
    });
    if (orderError) throw new Error('ORDER_INSERT_FAILED');

    // A timeout may still create a provider request: retain the pending order and
    // do not automatically retry this POST or replace its identity.
    let payment: Record<string, unknown>;
    let phase = 'request';
    let providerStatus: number | undefined;
    let responseContentType: string | null = null;
    let responseBody = '';
    const startedAt = Date.now();
    const amount = (amountMinor / 100).toFixed(2);
    // HitPay's JSON schema declares a number in major units. Its notification
    // and repeated-payment flags are strings, not JSON booleans.
    const requestPayload = {
      email, currency: 'MYR', amount: Number(amount),
      reference_number: reference, purpose: `Auto-Check ${plan}`,
      redirect_url: new URL('/success', request.url).href,
      allow_repeated_payments: 'false', send_email: 'false', send_sms: 'false',
    };
    const requestBody = JSON.stringify(requestPayload);
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-BUSINESS-API-KEY': apiKey },
        body: requestBody,
      });
      phase = 'response';
      providerStatus = response.status;
      responseContentType = response.headers.get('Content-Type');
      if (!response.ok) {
        responseBody = await response.text();
        // Server-only diagnostic requested for provider rejection. The payload
        // includes buyer email; never include authentication headers or salts.
        console.error('HITPAY_PROVIDER_REJECTED', {
          orderId: reference, endpoint, providerStatus,
          responseBody: hitPayRawDiagnosticText(responseBody, [apiKey, process.env.HITPAY_WEBHOOK_SALT ?? '']),
          requestPayload: requestBody,
        });
        throw new Error('PROVIDER_REJECTED');
      }
      responseBody = (await readHitPayBody(response, 65_536)).toString('utf8');
      phase = 'decode';
      payment = JSON.parse(responseBody);
      phase = 'validate';
      if (!payment || Array.isArray(payment) || !isHitPayUUID(payment.id) || typeof payment.url !== 'string') throw new Error('INVALID_PROVIDER_RESPONSE');
      if (!isHitPaySandboxCheckoutURL(payment.url)) throw new Error('INVALID_CHECKOUT_URL');
    } catch (error) {
      const sensitive = [apiKey, email, process.env.HITPAY_WEBHOOK_SALT ?? ''];
      const clean = (value: unknown) => value === undefined ? undefined : hitPayDiagnosticText(String(value), sensitive);
      const failure = error as { name?: unknown; message?: unknown; cause?: { code?: unknown; message?: unknown } } | null;
      console.error('HITPAY_CHECKOUT_FAILED', {
        orderId: reference, endpoint, environment: 'sandbox', plan, amount, currency: 'MYR',
        phase, providerStatus, responseContentType, elapsedMs: Date.now() - startedAt,
        errorName: clean(failure?.name), errorMessage: clean(failure?.message ?? error),
        causeCode: clean(failure?.cause?.code), causeMessage: clean(failure?.cause?.message),
        responseBody: hitPayDiagnosticText(responseBody, sensitive),
      });
      throw new HitPayError('PAYMENT_PROVIDER_UNAVAILABLE', 502);
    }
    const { data: saved, error: saveError } = await supabase.from('orders')
      .update({ provider_request_id: payment.id as string }).eq('id', reference).eq('status', 'pending')
      .is('provider_request_id', null).select('id').maybeSingle();
    if (saveError || !saved) throw new Error('PAYMENT_REQUEST_SAVE_FAILED');
    return hitPayResponse({ url: payment.url, reference });
  } catch (error) {
    if (error instanceof HitPayError) return hitPayResponse({ error: error.code }, error.status);
    console.error('HITPAY_CHECKOUT_INTERNAL_ERROR');
    return hitPayResponse({ error: 'CHECKOUT_FAILED' }, 500);
  }
}
