import 'server-only';
import type Stripe from 'stripe';
import {commerceDatabase,fulfillUnifiedOrder} from '@/lib/unified-commerce';
import {StripeCheckoutError} from './stripe-server';
export async function fulfillStripeSession(session:Stripe.Checkout.Session){
  if(session.payment_status!=='paid')return;
  const payment=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(session.mode!=='payment'||session.status!=='complete'||!payment)throw new StripeCheckoutError('INVALID_PAYMENT',400);
  let {data:order,error}=await commerceDatabase().from('payment_orders').select('*').eq('provider_request_id',session.id).eq('payment_provider','stripe').maybeSingle();
  if(error)throw Error('ORDER_READ_FAILED');
  if(!order&&session.client_reference_id){const fallback=await commerceDatabase().from('payment_orders').select('*').eq('id',session.client_reference_id).eq('payment_provider','stripe').maybeSingle();if(fallback.error)throw Error('ORDER_READ_FAILED');order=fallback.data;}
  if(!order)return;
  if(session.client_reference_id!==order.id)throw new StripeCheckoutError('PAYMENT_MISMATCH',409);
  await fulfillUnifiedOrder(order,payment,session.amount_total??0,session.currency??'',session.id);
}
