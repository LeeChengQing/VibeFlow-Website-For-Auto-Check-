import { getTicket, replyTicket } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
type Context={params:Promise<{token:string}>};
export async function GET(request:Request, context:Context) {
  try { localOnly(request); const ticket=getTicket((await context.params).token); if(!ticket) throw new Error('NOT_FOUND'); return Response.json(ticket,{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); }
}
export async function POST(request:Request, context:Context) {
  try { localOnly(request,true); rateLimit(request,'reply'); const ticket=getTicket((await context.params).token); if(!ticket) throw new Error('NOT_FOUND'); const {message}=await request.json(); return Response.json(replyTicket(ticket.id,message,'customer')); } catch(error) { return apiError(error); }
}
