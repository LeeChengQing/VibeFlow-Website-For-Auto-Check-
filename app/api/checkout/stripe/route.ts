import { randomUUID } from 'node:crypto';
import { getPublishedSiteConfig } from '@/lib/site-settings';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import { isPaymentCheckoutURL } from '@/lib/payment-checkout';
import { checkoutOrigin, getStripe, readStripeBody, StripeCheckoutError, stripeErrorResponse, stripeResponse } from '@/lib/stripe-server';

export const runtime = 'nodejs';

const publicPlans = {
  bundle: 'bundle', extension: 'extension', semester: 'mobile_notification', yearly: 'mobile_notification_yearly',
} as const;
const productNames = {
  bundle: 'Auto-Check Complete Bundle', extension: 'Auto-Check Browser Extension',
  semester: 'Auto-Check Notifications - Semester', yearly: 'Auto-Check Notifications - Yearly',
};

export async function POST(request: Request) {
  let apiCall = 'unknown';
  try {
    const origin = checkoutOrigin(request);
    if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
      throw new StripeCheckoutError('JSON_REQUIRED', 415);
    }
    let input: unknown;
    try { input = JSON.parse((await readStripeBody(request, 16_384)).toString('utf8')); }
    catch (error) {
      if (error instanceof StripeCheckoutError) throw error;
      throw new StripeCheckoutError('INVALID_CHECKOUT', 400);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StripeCheckoutError('INVALID_CHECKOUT', 400);
    const body = input as Record<string, unknown>;
    if (typeof body.plan !== 'string' || !Object.hasOwn(publicPlans, body.plan) || typeof body.buyer_email !== 'string') {
      throw new StripeCheckoutError('INVALID_CHECKOUT', 400);
    }
    const plan = body.plan as keyof typeof publicPlans;
    const email = body.buyer_email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StripeCheckoutError('INVALID_EMAIL', 400);
    const stripe = getStripe();
    const config = await getPublishedSiteConfig();
    if (!purchaseAllowed(config, publicPlans[plan])) throw new StripeCheckoutError('CHECKOUT_UNAVAILABLE', 409);
    const amountMinor = packagePrice(config, publicPlans[plan]);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 100) throw new StripeCheckoutError('INVALID_PRICE', 503);
    const reference = randomUUID();
    const supabase = getCommerceDatabase();
    const { error: insertError } = await supabase.from('orders').insert({
      id: reference, reference, buyer_email: email, plan, amount_minor: amountMinor,
      currency: 'MYR', status: 'pending', payment_provider: 'stripe',
    });
    if (insertError) throw new Error('ORDER_INSERT_FAILED');
    apiCall = 'checkout.sessions.create';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', allowed_payment_method_types: ['card', 'fpx'], customer_email: email,
      client_reference_id: reference, metadata: { order_id: reference },
      line_items: [{ quantity: 1, price_data: {
        currency: 'myr', unit_amount: amountMinor, product_data: { name: productNames[plan] },
      } }],
      success_url: `${origin}/success?order_id=${reference}`, cancel_url: `${origin}/#pricing`,
    }, { idempotencyKey: `checkout-${reference}` });
    apiCall = 'unknown';
    if (!session.id || !isPaymentCheckoutURL(session.url, 'stripe')) throw new Error('INVALID_CHECKOUT_RESPONSE');
    const { error: saveError } = await supabase.from('orders').update({ provider_request_id: session.id })
      .eq('id', reference).eq('status', 'pending');
    if (saveError) throw new Error('ORDER_SAVE_FAILED');
    return stripeResponse({ url: session.url, reference });
  } catch (error) { return stripeErrorResponse(error, apiCall); }
}
