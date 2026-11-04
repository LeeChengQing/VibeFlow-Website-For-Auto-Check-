import 'server-only';
import type Stripe from 'stripe';
export async function handleStripeWebhookEvent(db:any,event:Stripe.Event){
  const object=event.data.object as any;
  if(event.type==='charge.refunded'){
    const payment=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
    if(!payment)return;
    let {data:order,error}=await db.from('payment_orders').select('*').eq('payment_provider','stripe').eq('provider_payment_id',payment).maybeSingle();
    if(error)throw Error('ORDER_READ_FAILED');if(!order&&object.metadata?.order_id){const fallback=await db.from('payment_orders').select('*').eq('id',object.metadata.order_id).eq('payment_provider','stripe').maybeSingle();if(fallback.error)throw Error('ORDER_READ_FAILED');order=fallback.data;}if(!order)return;
    if(object.amount!==order.amount_minor||String(object.currency).toUpperCase()!==order.currency)throw Error('REFUND_MISMATCH');
    const result=await db.rpc('refund_verified_payment',{p_order:order.id,p_provider:'stripe',p_payment:payment,p_amount:object.amount_refunded,p_event:event.id});
    if(result.error)throw Error('REFUND_UPDATE_FAILED');
  } else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
    const result=await db.from('payment_orders').update({status:'cancelled'}).eq('payment_provider','stripe').eq('provider_request_id',object.id).eq('status','pending');
    if(result.error)throw Error('ORDER_UPDATE_FAILED');
  }
}
