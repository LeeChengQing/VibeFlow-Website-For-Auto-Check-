import {createUnifiedCheckout,internalCheckoutAuthorized,isOrderId,reply} from '@/lib/unified-commerce';
export const runtime='nodejs';
export async function POST(request:Request){
  if(!internalCheckoutAuthorized(request))return reply({error:'unauthorized'},401);
  let input;try{input=await request.clone().json();}catch{return reply({error:'INVALID_CHECKOUT'},400);}
  const verification=input.verification===true;
  if(!isOrderId(input.device_id)||!(verification?['semester','yearly','extension','bundle']:['semester','yearly']).includes(input.plan)||!['stripe','toyyibpay'].includes(input.source))return reply({error:'INVALID_CHECKOUT'},400);
  return createUnifiedCheckout(request,input.source,input.device_id,verification);
}
