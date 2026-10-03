import { createTicket } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
export async function POST(request:Request) {
  try { localOnly(request,true); rateLimit(request,'ticket',20); const ticket=createTicket(await request.json()); return Response.json({url:`/support/${ticket.token}`}); } catch(error) { return apiError(error); }
}
