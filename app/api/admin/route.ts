import { listOrders, listTickets, refundOrder, resendOrder, replyTicket, closeTicket } from '@/lib/store';
import { localOnly, requireAdmin, apiError } from '@/lib/security';
export async function GET(request:Request) {
  try { localOnly(request); await requireAdmin(); return Response.json({orders:listOrders(),tickets:listTickets()},{headers:{'Cache-Control':'no-store'}}); } catch(error) { return apiError(error); }
}
export async function POST(request:Request) {
  try { localOnly(request,true); await requireAdmin(); const {action,id,email,message}=await request.json();
    if(action==='refund') refundOrder(id);
    else if(action==='resend') resendOrder(id,email);
    else if(action==='reply') replyTicket(id,message,'admin');
    else if(action==='close') closeTicket(id);
    else throw new Error('INVALID_STATE');
    return Response.json({ok:true});
  } catch(error) { return apiError(error); }
}
