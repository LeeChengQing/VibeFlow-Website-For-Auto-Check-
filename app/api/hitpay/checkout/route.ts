import { randomUUID } from 'node:crypto';
import { requireAdminSession } from '@/lib/admin-auth';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import type { ActivationKeyPlan } from '@/lib/supabase/admin';
import {
  HitPayError, hitPayResponse, hitPaySandboxConfig, isHitPayUUID,
  parseHitPayJSON, readHitPayBody,
} from '@/lib/hitpay';

export const runtime = 'nodejs';

const publicPlans = { bundle: 'bundle', semester: 'mobile_notification', yearly: 'mobile_notification_yearly' } as const;

export async function POST(request: Request) {
  try {
    if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw new HitPayError('JSON_REQUIRED', 415);
    }
    const body = parseHitPayJSON(await readHitPayBody(request, 16_384));
    if (typeof body.plan !== 'string' || !['bundle', 'semester', 'yearly', 'internal_check'].includes(body.plan) ||
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
    try {
      const response = await fetch(endpoint, {
        method: 'POST', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json', 'X-BUSINESS-API-KEY': apiKey },
        body: JSON.stringify({
          email, currency: 'MYR', amount: (amountMinor / 100).toFixed(2),
          reference_number: reference, purpose: `Auto-Check ${plan}`,
          allow_repeated_payments: 'false', send_email: 'false', send_sms: 'false',
        }),
      });
      if (!response.ok) throw new Error('PROVIDER_REJECTED');
      payment = await response.json();
      if (!payment || !isHitPayUUID(payment.id) || typeof payment.url !== 'string') throw new Error('INVALID_PROVIDER_RESPONSE');
      const url = new URL(payment.url);
      if (url.protocol !== 'https:' || url.hostname !== 'securecheckout.sandbox.hit-pay.com' ||
          url.port || url.username || url.password) throw new Error('INVALID_CHECKOUT_URL');
    } catch {
      console.error('HITPAY_CHECKOUT_FAILED', { orderId: reference });
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
