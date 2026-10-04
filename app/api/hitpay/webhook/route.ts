import { getCommerceDatabase } from '@/lib/supabase/commerce';
import {
  HitPayError, extractHitPayPayment, hitPayResponse, parseHitPayJSON,
  readHitPayBody, verifyHitPaySignature,
} from '@/lib/hitpay';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const salt = process.env.HITPAY_WEBHOOK_SALT;
    if (!salt) throw new HitPayError('WEBHOOK_NOT_CONFIGURED', 503);
    const rawBody = await readHitPayBody(request, 262_144);
    if (!verifyHitPaySignature(rawBody, request.headers.get('Hitpay-Signature'), salt)) {
      return hitPayResponse({ error: 'INVALID_SIGNATURE' }, 401);
    }
    const payment = extractHitPayPayment(parseHitPayJSON(rawBody), request.headers);
    if (!payment) return hitPayResponse({ ok: true });

    const supabase = getCommerceDatabase();
    const { data: order, error: readError } = await supabase.from('orders').select('*')
      .eq('provider_request_id', payment.requestId).maybeSingle();
    if (readError) throw new Error('ORDER_READ_FAILED');
    if (!order) throw new HitPayError('ORDER_NOT_FOUND', 404);
    if (order.payment_provider !== 'hitpay' || (payment.reference !== null && payment.reference !== order.reference) ||
        order.amount_minor !== payment.amountMinor || order.currency !== payment.currency) throw new HitPayError('PAYMENT_MISMATCH', 409);
    if (order.status !== 'pending' && order.status !== 'paid') throw new HitPayError('ORDER_NOT_PAYABLE', 409);
    if (order.provider_payment_id && order.provider_payment_id !== payment.paymentId) throw new HitPayError('TRANSACTION_CONFLICT', 409);

    // Commit verified capture BEFORE the RPC. Its stock-exhaustion rollback must
    // not erase the payment fact when we acknowledge the callback with HTTP 200.
    if (!order.provider_payment_id) {
      if (order.status !== 'pending') throw new HitPayError('PAYMENT_STATE_INCONSISTENT', 409);
      const { data: captured, error: captureError } = await supabase.from('orders')
        .update({ provider_payment_id: payment.paymentId, payment_confirmed_at: new Date().toISOString() })
        .eq('id', order.id).eq('status', 'pending').is('provider_payment_id', null).select('id').maybeSingle();
      if (captureError) {
        if (captureError.code === '23505') throw new HitPayError('TRANSACTION_CONFLICT', 409);
        throw new Error('PAYMENT_CAPTURE_SAVE_FAILED');
      }
      if (!captured) {
        // A competing identical callback may have won the conditional update.
        const { data: current, error } = await supabase.from('orders').select('provider_payment_id,status')
          .eq('id', order.id).maybeSingle();
        if (error) throw new Error('PAYMENT_CAPTURE_READ_FAILED');
        if (current?.provider_payment_id !== payment.paymentId || !['pending', 'paid'].includes(current.status)) {
          throw new HitPayError('TRANSACTION_CONFLICT', 409);
        }
      }
    }

    const { data: licenseId, error: fulfillmentError } = await supabase.rpc('assign_available_key', { p_order_id: order.id });
    if (fulfillmentError?.message === 'INVENTORY_EXHAUSTED') {
      console.error('CRITICAL HITPAY_INVENTORY_EXHAUSTED', { orderId: order.id, paymentId: payment.paymentId });
      try {
        const { error } = await supabase.from('orders').update({ fulfillment_error: 'INVENTORY_EXHAUSTED' })
          .eq('id', order.id).eq('status', 'pending').eq('provider_payment_id', payment.paymentId);
        if (error) console.error('CRITICAL HITPAY_FULFILLMENT_ALERT_SAVE_FAILED', { orderId: order.id });
      } catch { console.error('CRITICAL HITPAY_FULFILLMENT_ALERT_SAVE_FAILED', { orderId: order.id }); }
      return hitPayResponse({ ok: true });
    }
    if (fulfillmentError || !licenseId) throw new Error('FULFILLMENT_FAILED');
    const { error: cleanupError } = await supabase.from('orders').update({ fulfillment_error: null })
      .eq('id', order.id).eq('status', 'paid').eq('provider_payment_id', payment.paymentId);
    if (cleanupError) console.error('HITPAY_FULFILLMENT_ALERT_CLEAR_FAILED', { orderId: order.id });
    return hitPayResponse({ ok: true });
  } catch (error) {
    if (error instanceof HitPayError) return hitPayResponse({ error: error.code }, error.status);
    console.error('HITPAY_WEBHOOK_INTERNAL_ERROR');
    return hitPayResponse({ error: 'FULFILLMENT_FAILED' }, 500);
  }
}
