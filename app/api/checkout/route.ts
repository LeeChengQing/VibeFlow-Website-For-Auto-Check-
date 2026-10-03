import { createOrder } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
import { getPublishedSiteConfig } from '@/lib/site-settings';
export async function POST(request:Request) {
  try { localOnly(request,true); rateLimit(request,'checkout'); const input=await request.json(); const config=await getPublishedSiteConfig(); const order=createOrder(input,config); return Response.json({url:`/checkout/${order.token}`,reference:order.reference}); }
  catch(error) { return apiError(error); }
}
