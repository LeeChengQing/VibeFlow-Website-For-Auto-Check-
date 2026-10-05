import 'server-only';

import type Stripe from 'stripe';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import { StripeCheckoutError } from './stripe-server';

/** Only call with a Checkout Session from a signature-verified Stripe event. */
export async function fulfillStripeSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== 'paid') return;
  const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (session.mode !== 'payment' || session.status !== 'complete' || !paymentId) {
    throw new StripeCheckoutError('INVALID_PAYMENT', 400);
  }
  const supabase = getCommerceDatabase();
  const { data: order, error: readError } = await supabase.from('orders').select('*')
    .eq('provider_request_id', session.id).eq('payment_provider', 'stripe').maybeSingle();
  if (readError) throw new Error('ORDER_READ_FAILED');
  if (!order) throw new StripeCheckoutError('ORDER_NOT_FOUND', 404);
  if (session.client_reference_id !== order.id || session.amount_total !== order.amount_minor ||
    session.currency?.toUpperCase() !== order.currency) throw new StripeCheckoutError('PAYMENT_MISMATCH', 409);
  if (!['pending', 'paid'].includes(order.status) ||
    (order.provider_payment_id && order.provider_payment_id !== paymentId)) throw new StripeCheckoutError('TRANSACTION_CONFLICT', 409);

  if (!order.provider_payment_id) {
    if (order.status !== 'pending') throw new StripeCheckoutError('PAYMENT_STATE_INCONSISTENT', 409);
    const { data: captured, error } = await supabase.from('orders')
      .update({ provider_payment_id: paymentId, payment_confirmed_at: new Date().toISOString() })
      .eq('id', order.id).eq('status', 'pending').is('provider_payment_id', null).select('id').maybeSingle();
    if (error) throw new Error('PAYMENT_CAPTURE_SAVE_FAILED');
    if (!captured) {
      const { data: current, error: currentError } = await supabase.from('orders').select('provider_payment_id,status')
        .eq('id', order.id).maybeSingle();
      if (currentError) throw new Error('PAYMENT_CAPTURE_READ_FAILED');
      if (current?.provider_payment_id !== paymentId || !['pending', 'paid'].includes(current.status)) {
        throw new StripeCheckoutError('TRANSACTION_CONFLICT', 409);
      }
    }
  }
  const { data: licenseId, error: fulfillmentError } = await supabase.rpc('assign_available_key', { p_order_id: order.id });
  if (fulfillmentError?.message === 'INVENTORY_EXHAUSTED') {
    console.error('CRITICAL STRIPE_INVENTORY_EXHAUSTED', { orderId: order.id });
    const { error } = await supabase.from('orders').update({ fulfillment_error: 'INVENTORY_EXHAUSTED' })
      .eq('id', order.id).eq('status', 'pending').eq('provider_payment_id', paymentId);
    if (error) throw new Error('FULFILLMENT_ALERT_SAVE_FAILED');
    return;
  }
  if (fulfillmentError || (order.plan === 'extension' ? licenseId !== null : !licenseId)) throw new Error('FULFILLMENT_FAILED');
  const { error: cleanupError } = await supabase.from('orders').update({ fulfillment_error: null })
    .eq('id', order.id).eq('status', 'paid').eq('provider_payment_id', paymentId);
  if (cleanupError) throw new Error('FULFILLMENT_ALERT_CLEAR_FAILED');
}
