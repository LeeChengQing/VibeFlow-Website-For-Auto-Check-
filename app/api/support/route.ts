import { createSupportTicket } from '@/lib/support/support-service';
import { getCommerceDatabase, isCommerceConfigured } from '@/lib/supabase/commerce';
import { apiError, rateLimit } from '@/lib/security';

export async function POST(request: Request) {
  try {
    rateLimit(request, 'ticket', 20);
    const body = await request.json();

    if (isCommerceConfigured()) {
      const db = getCommerceDatabase();
      const { url } = await createSupportTicket(db, body);
      return Response.json({ url });
    }

    if (process.env.LOCAL_DEMO === 'true' && process.env.NODE_ENV !== 'production') {
      const { createTicket } = await import('@/lib/store');
      const ticket = createTicket(body);
      return Response.json({ url: `/support/${ticket.token}` });
    }

    throw new Error('COMMERCE_NOT_CONFIGURED');
  } catch (error) {
    return apiError(error);
  }
}
