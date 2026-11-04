import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import {commerceDatabase,fulfillUnifiedOrder} from '@/lib/unified-commerce';

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

export async function POST(request:Request){
  try{
    const secret=process.env.TOYYIBPAY_SECRET_KEY?.trim();
    if(!secret)return response({error:'TOYYIBPAY_NOT_CONFIGURED'},503);
    const callback=await parseCallback(request,await readBody(request));
    const status=text(callback.status)??text(callback.status_id),orderId=text(callback.order_id,64)??'',payment=text(callback.refno),bill=text(callback.billcode,64),signature=text(callback.hash,64);
    if(!status||!payment||!bill||!signature||!validCallbackHash(secret,status,orderId,payment,signature))return response({error:'INVALID_SIGNATURE'},401);
    if(status!=='1')return response({received:true});
    const amount=toMinorAmount(String(callback.amount??''));if(amount===undefined)return response({error:'INVALID_PAYMENT'},400);
    let query=commerceDatabase().from('payment_orders').select('*').eq('payment_provider','toyyibpay');
    query=orderId?query.eq('id',orderId):query.eq('provider_request_id',bill);
    const {data:order,error}=await query.maybeSingle();if(error)throw Error('ORDER_READ_FAILED');if(!order)return response({received:true});
    await fulfillUnifiedOrder(order,payment,amount,'MYR',bill);
    return response({received:true});
  }catch{return response({error:'PAYMENT_PROCESSING_FAILED'},503);}
}
