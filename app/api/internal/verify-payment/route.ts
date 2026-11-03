import {createHash} from 'node:crypto';
import {commerceDatabase,commerceOrigin,internalCheckoutAuthorized,isOrderId,reply} from '@/lib/unified-commerce';
import {getStripe} from '@/lib/stripe-server';
export const runtime='nodejs';
// No external charge: privileged diagnostics may settle only explicitly isolated fixtures.
export async function POST(request:Request){
  if(!internalCheckoutAuthorized(request))return reply({error:'unauthorized'},401);
  try{
    const {orderId}=await request.json();if(!isOrderId(orderId))return reply({error:'INVALID_ORDER'},400);
    const db=commerceDatabase(),result=await db.from('payment_orders').select('*').eq('id',orderId).eq('verification_only',true).single();
    const order=result.data;if(result.error||!order||order.buyer_email!=='checkout-verification@example.invalid')return reply({error:'VERIFICATION_ONLY'},403);
    const device=await db.from('devices').select('device_key').eq('id',order.device_id).single();
    if(!device.data?.device_key?.startsWith('verification-'))return reply({error:'VERIFICATION_ONLY'},403);
    const origin=commerceOrigin(),payment='verification-'+order.id;
    let response:Response;
    if(order.payment_provider==='stripe'){
      const payload=JSON.stringify({id:'evt_verification_'+order.id,type:'checkout.session.completed',object:'event',data:{object:{id:order.provider_request_id,object:'checkout.session',mode:'payment',status:'complete',payment_status:'paid',payment_intent:payment,client_reference_id:order.id,amount_total:order.amount_minor,currency:'myr'}}});
      const signature=getStripe().webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET!});
      response=await fetch(origin+'/api/checkout/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json','stripe-signature':signature},body:payload,redirect:'error',signal:AbortSignal.timeout(20000)});
    }else{
      const hash=createHash('md5').update(`${process.env.TOYYIBPAY_SECRET_KEY}1${order.id}${payment}ok`).digest('hex');
      response=await fetch(origin+'/api/webhook/toyyibpay',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'1',order_id:order.id,refno:payment,billcode:order.provider_request_id,amount:(order.amount_minor/100).toFixed(2),hash}),redirect:'error',signal:AbortSignal.timeout(20000)});
    }
    if(!response.ok)return reply({error:'VERIFICATION_CALLBACK_FAILED',callbackStatus:response.status},503);
    return reply({ok:true,synthetic:true,charged:false});
  }catch{return reply({error:'VERIFICATION_FAILED'},503);}
}
