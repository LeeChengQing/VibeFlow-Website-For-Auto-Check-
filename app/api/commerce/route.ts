import {readStripeBody} from '@/lib/stripe-server';
import {privateHeaders} from '@/lib/canonical-commerce';
import {deliveryAction} from '@/lib/order-delivery';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({error:'method_not_allowed'},{status:405,headers:privateHeaders});}
export async function POST(request:Request) {
  try {
    if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON_REQUIRED'},{status:415,headers:privateHeaders});
    const input=JSON.parse((await readStripeBody(request,4096)).toString('utf8'));
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error();
    return await deliveryAction(request,input);
  }catch{return Response.json({error:'delivery_unavailable'},{status:503,headers:privateHeaders});}
}