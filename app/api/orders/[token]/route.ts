import { getOrder, completeOrder, cancelOrder } from '@/lib/store';
import { localOnly, apiError, rateLimit } from '@/lib/security';
import { isCommerceConfigured, getCommerceDatabase } from '@/lib/supabase/commerce';
import { hashOrderAccessToken } from '@/lib/order-access-token';
import { decryptLicenseKey } from '@/lib/license-key-encryption';

type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { token } = await context.params;

    if (isCommerceConfigured()) {
      const db = getCommerceDatabase() as any;
      const tokenHash = hashOrderAccessToken(token);

      const { data: order, error } = await db
        .from('orders')
        .select('*')
        .eq('order_access_token_hash', tokenHash)
        .maybeSingle();

      if (error || !order) {
        throw new Error('NOT_FOUND');
      }

      let licenseKey: string | null = null;
      if (order.status === 'paid') {
        const { data: license } = await db
          .from('issued_licenses')
          .select('inventory_id')
          .eq('order_id', order.id)
          .eq('status', 'active')
          .maybeSingle();

        if (license) {
          const { data: inv } = await db
            .from('key_inventory')
            .select('encrypted_key, key_hash')
            .eq('id', license.inventory_id)
            .maybeSingle();

          if (inv?.encrypted_key && inv?.key_hash) {
            try {
              licenseKey = decryptLicenseKey(inv.encrypted_key, inv.key_hash);
            } catch {
              licenseKey = null;
            }
          }
        }
      }

      const maskedEmail = order.buyer_email
        ? `${order.buyer_email.slice(0, 1)}•••••@${order.buyer_email.split('@')[1] || ''}`
        : null;

      return Response.json(
        {
          id: order.id,
          reference: order.reference,
          token,
          plan: order.plan,
          amount: order.amount_minor,
          locale: 'zh',
          email: maskedEmail,
          status: order.status,
          createdAt: order.payment_confirmed_at || new Date().toISOString(),
          paidAt: order.payment_confirmed_at,
          expiresAt: null,
          delivery: licenseKey,
          resends: 0,
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Robots-Tag': 'noindex, nofollow',
            'Referrer-Policy': 'no-referrer',
          },
        }
      );
    }

    localOnly(request);
    const order = getOrder(token);
    if (!order) throw new Error('NOT_FOUND');
    return Response.json(order, {
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    localOnly(request, true);
    rateLimit(request, 'complete');
    const { action, email } = await request.json();
    const { token } = await context.params;
    if (!['complete', 'cancel'].includes(action)) throw new Error('INVALID_STATE');
    const order = action === 'complete' ? completeOrder(token, email) : cancelOrder(token);
    return Response.json(order);
  } catch (error) {
    return apiError(error);
  }
}
