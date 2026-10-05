import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCommerceDatabase } from '@/lib/supabase/commerce';

export const runtime = 'nodejs';

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBody(request: Request) {
  if (!request.body) throw Object.assign(new Error('INVALID_BODY'), { status: 400 });
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) {
        await reader.cancel();
        throw Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 });
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function parseCallback(request: Request, raw: Buffer) {
  const contentType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  const values: Record<string, unknown> = {};
  if (contentType === 'application/json') {
    try {
      const parsed: unknown = JSON.parse(raw.toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      Object.assign(values, parsed);
    } catch { throw Object.assign(new Error('INVALID_PAYLOAD'), { status: 400 }); }
  } else if (contentType === 'application/x-www-form-urlencoded') {
    new URLSearchParams(raw.toString('utf8')).forEach((value, key) => { values[key] = value; });
  } else if (contentType === 'multipart/form-data') {
    try {
      const form = await new Response(new Uint8Array(raw), { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
      form.forEach((value, key) => { if (typeof value === 'string') values[key] = value; });
    } catch { throw Object.assign(new Error('INVALID_PAYLOAD'), { status: 400 }); }
  } else {
    throw Object.assign(new Error('UNSUPPORTED_CONTENT_TYPE'), { status: 415 });
  }
  return values;
}

function text(value: unknown, max = 128) {
  const normalized = typeof value === 'string' ? value
    : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : undefined;
  return normalized && normalized.length <= max ? normalized : undefined;
}

function validCallbackHash(secret: string, status: string, orderId: string, refno: string, received: string) {
  if (!/^[a-f0-9]{32}$/i.test(received)) return false;
  const expected = createHash('md5').update(`${secret}${status}${orderId}${refno}ok`).digest();
  const actual = Buffer.from(received, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function toMinorAmount(value: string) {
  if (!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export async function POST(request: Request) {
  try {
    const secret = process.env.TOYYIBPAY_SECRET_KEY?.trim();
    if (!secret) throw Object.assign(new Error('TOYYIBPAY_NOT_CONFIGURED'), { status: 503 });
    const callback = await parseCallback(request, await readBody(request));
    const statusValue = text(callback.status) ?? text(callback.status_id);
    const orderId = text(callback.order_id, 64) ?? '';
    const refno = text(callback.refno);
    const billCode = text(callback.billcode, 64);
    const callbackHash = text(callback.hash, 64);
    if (!statusValue || !refno || !billCode || !callbackHash ||
        !validCallbackHash(secret, statusValue, orderId, refno, callbackHash)) {
      return response({ error: 'INVALID_SIGNATURE' }, 401);
    }
    if (statusValue !== '1' || (callback.status_id !== undefined && String(callback.status_id) !== '1')) {
      return response({ received: true });
    }
    const isOrderUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);
    if ((orderId && !isOrderUUID) || !/^[A-Za-z0-9_-]{2,64}$/.test(billCode)) return response({ error: 'INVALID_PAYMENT' }, 400);
    const amount = typeof callback.amount === 'number' && Number.isFinite(callback.amount)
      ? String(callback.amount) : text(callback.amount, 32);
    const amountMinor = amount ? toMinorAmount(amount) : undefined;
    if (amountMinor === undefined) return response({ error: 'INVALID_PAYMENT' }, 400);

    const supabase = getCommerceDatabase();
    let orderQuery = supabase.from('orders').select('*').eq('payment_provider', 'toyyibpay');
    orderQuery = isOrderUUID ? orderQuery.eq('id', orderId) : orderQuery.eq('provider_request_id', billCode);
    const { data: order, error: readError } = await orderQuery.maybeSingle();
    if (readError) throw new Error('ORDER_READ_FAILED');
    if (!order) return response({ error: 'ORDER_NOT_FOUND' }, 404);
    if ((isOrderUUID && order.reference !== orderId) || order.provider_request_id !== billCode || order.amount_minor !== amountMinor || order.currency !== 'MYR') {
      return response({ error: 'PAYMENT_MISMATCH' }, 409);
    }
    if (!['pending', 'paid'].includes(order.status) ||
        (order.provider_payment_id && order.provider_payment_id !== refno)) return response({ error: 'TRANSACTION_CONFLICT' }, 409);

    if (!order.provider_payment_id) {
      if (order.status !== 'pending') return response({ error: 'PAYMENT_STATE_INCONSISTENT' }, 409);
      const { data: captured, error: captureError } = await supabase.from('orders')
        .update({ provider_payment_id: refno, payment_confirmed_at: new Date().toISOString() })
        .eq('id', order.id).eq('status', 'pending').is('provider_payment_id', null).select('id').maybeSingle();
      if (captureError) {
        if (captureError.code === '23505') return response({ error: 'TRANSACTION_CONFLICT' }, 409);
        throw new Error('PAYMENT_CAPTURE_SAVE_FAILED');
      }
      if (!captured) {
        const { data: current, error } = await supabase.from('orders').select('provider_payment_id,status')
          .eq('id', order.id).maybeSingle();
        if (error) throw new Error('PAYMENT_CAPTURE_READ_FAILED');
        if (current?.provider_payment_id !== refno || !['pending', 'paid'].includes(current.status)) {
          return response({ error: 'TRANSACTION_CONFLICT' }, 409);
        }
      }
    }

    const { data: licenseId, error: fulfillmentError } = await supabase.rpc('assign_available_key', { p_order_id: order.id });
    if (fulfillmentError?.message === 'INVENTORY_EXHAUSTED') {
      console.error('CRITICAL TOYYIBPAY_INVENTORY_EXHAUSTED', { orderId: order.id, paymentId: refno });
      const { error } = await supabase.from('orders').update({ fulfillment_error: 'INVENTORY_EXHAUSTED' })
        .eq('id', order.id).eq('status', 'pending').eq('provider_payment_id', refno);
      if (error) throw new Error('FULFILLMENT_ALERT_SAVE_FAILED');
      return response({ received: true });
    }
    if (fulfillmentError || (order.plan === 'extension' ? licenseId !== null : !licenseId)) {
      throw new Error('FULFILLMENT_FAILED');
    }
    const { error: cleanupError } = await supabase.from('orders').update({ fulfillment_error: null })
      .eq('id', order.id).eq('status', 'paid').eq('provider_payment_id', refno);
    if (cleanupError) console.error('TOYYIBPAY_FULFILLMENT_ALERT_CLEAR_FAILED', { orderId: order.id });
    return response({ received: true });
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
      ? error.status : 500;
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'WEBHOOK_FAILED';
    if (status >= 500) console.error('TOYYIBPAY_WEBHOOK_FAILED', code);
    return response({ error: code }, status);
  }
}
