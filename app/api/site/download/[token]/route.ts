import {deliveryAction} from '@/lib/order-delivery';
import {privateHeaders} from '@/lib/canonical-commerce';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({error:'method_not_allowed'},{status:405,headers:privateHeaders});}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}){
  return deliveryAction(request,{action:'private-download',orderId:(await params).token});
}