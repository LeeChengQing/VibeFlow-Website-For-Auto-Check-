import 'server-only';
import type Stripe from 'stripe';
export async function handleStripeWebhookEvent(db:any,event:Stripe.Event,findStripeOrder?:(payment:string)=>Promise<string|undefined>){
  if(event.type==='charge.refunded'||event.type==='charge.dispute.created'){
    const object=event.data.object;
    const dispute=event.type==='charge.dispute.created';
    const payment=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id;
    if(!payment)return;
    let {data:order,error}=await db.from('payment_orders').select('id,amount_minor,currency').eq('payment_provider','stripe').eq('provider_payment_id',payment).maybeSingle();
    if(error)throw Error('ORDER_READ_FAILED');
    if(!order){
      const id=(!dispute?event.data.object.metadata?.order_id:undefined)||await findStripeOrder?.(payment);
      if(!id)return;
      const fallback=await db.from('payment_orders').select('id,amount_minor,currency').eq('id',id).eq('payment_provider','stripe').maybeSingle();
      if(fallback.error)throw Error('ORDER_READ_FAILED');
      if(!fallback.data)return;
      order=fallback.data;
    }
    if(String(object.currency).toUpperCase()!==order.currency||
      (dispute?object.amount<=0||object.amount>order.amount_minor:object.amount!==order.amount_minor))throw Error('REFUND_MISMATCH');
    const result=await db.rpc('refund_verified_payment',{p_order:order.id,p_provider:'stripe',p_payment:payment,p_amount:dispute?order.amount_minor:event.data.object.amount_refunded,p_event:event.id});
    if(result.error)throw Error('REFUND_UPDATE_FAILED');
  } else if(event.type==='checkout.session.expired'||event.type==='checkout.session.async_payment_failed'){
    const result=await db.from('payment_orders').update({status:'cancelled'}).eq('payment_provider','stripe').eq('provider_request_id',event.data.object.id).eq('status','pending');
    if(result.error)throw Error('ORDER_UPDATE_FAILED');
  }
}
