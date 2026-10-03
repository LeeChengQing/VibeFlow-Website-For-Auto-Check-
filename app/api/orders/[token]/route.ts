import { getOrder, completeOrder, cancelOrder } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
type Context={params:Promise<{token:string}>};
export async function GET(request:Request, context:Context) {
  try { localOnly(request); const order=getOrder((await context.params).token); if(!order) throw new Error('NOT_FOUND'); return Response.json(order,{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); }
}
export async function POST(request:Request, context:Context) {
  try { localOnly(request,true); rateLimit(request,'complete'); const {action,email}=await request.json(); const {token}=await context.params; if(!['complete','cancel'].includes(action)) throw new Error('INVALID_STATE'); const order=action==='complete'?completeOrder(token,email):cancelOrder(token); return Response.json(order); } catch(error) { return apiError(error); }
}
