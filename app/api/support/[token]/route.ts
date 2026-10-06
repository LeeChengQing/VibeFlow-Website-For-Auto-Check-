import { getSupportTicketByToken, replySupportTicketByToken } from '@/lib/support/support-service';
import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';
import { apiError, rateLimit } from '@/lib/security';

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token } = await context.params;

    if (isCommerceConfigured()) {
      const db = getCommerceDatabase();
      const ticket = await getSupportTicketByToken(db, token);
      if (!ticket) throw new Error('NOT_FOUND');
      return Response.json(ticket, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (process.env.LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production') {
      const { getTicket } = await import('@/lib/store');
      const ticket = getTicket(token);
      if (!ticket) throw new Error('NOT_FOUND');
      return Response.json(ticket, { headers: { 'Cache-Control': 'no-store' } });
    }

    throw new Error('COMMERCE_NOT_CONFIGURED');
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    rateLimit(request, 'reply', 30);
    const { token } = await context.params;
    const body = await request.json();
    const message = body?.message;

    if (isCommerceConfigured()) {
      const db = getCommerceDatabase();
      const ticket = await replySupportTicketByToken(db, token, message);
      return Response.json(ticket, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (process.env.LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production') {
      const { getTicket, replyTicket } = await import('@/lib/store');
      const ticket = getTicket(token);
      if (!ticket) throw new Error('NOT_FOUND');
      const updated = replyTicket(ticket.id, message, 'customer');
      return Response.json(updated, { headers: { 'Cache-Control': 'no-store' } });
    }

    throw new Error('COMMERCE_NOT_CONFIGURED');
  } catch (error) {
    return apiError(error);
  }
}
