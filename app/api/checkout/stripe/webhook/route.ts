import type Stripe from 'stripe';
import { fulfillStripeSession } from '@/lib/stripe-fulfillment';
import { getStripe, readStripeBody, StripeCheckoutError, stripeErrorResponse, stripeResponse } from '@/lib/stripe-server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let apiCall = 'unknown';
  try {
    const stripe = getStripe();
    const signature = request.headers.get('stripe-signature');
    if (!signature) throw new StripeCheckoutError('INVALID_SIGNATURE', 401);
    const rawBody = await readStripeBody(request, 262_144);
    let event: Stripe.Event;
    apiCall = 'webhooks.constructEvent';
    try { event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!.trim()); }
    catch { throw new StripeCheckoutError('INVALID_SIGNATURE', 401); }
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await fulfillStripeSession(event.data.object);
    }
    return stripeResponse({ ok: true });
  } catch (error) { return stripeErrorResponse(error, apiCall); }
}
