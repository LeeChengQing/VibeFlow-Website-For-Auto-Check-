import { createOrder } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
export async function POST(request:Request) {
  try { localOnly(request,true); rateLimit(request,'checkout'); const input=await request.json(); const order=createOrder(input); return Response.json({url:`/checkout/${order.token}`,reference:order.reference}); }
  catch(error) { return apiError(error); }
}
