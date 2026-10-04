import type { Metadata } from 'next';
import { PaymentReturn, type PaymentReturnStatus } from '@/components/PaymentReturn';
import { isHitPayUUID } from '@/lib/hitpay';
import { getCommerceDatabase } from '@/lib/supabase/commerce';

export const metadata: Metadata = {
  title: 'Payment confirmation · Auto-Check',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reference } = await searchParams;
  let status: PaymentReturnStatus = 'unverified';

  // HitPay appends its payment request UUID as `reference`. The browser's
  // `status` query parameter is not proof of payment or license delivery.
  if (isHitPayUUID(reference)) {
    try {
      const { data: order, error } = await getCommerceDatabase().from('orders')
        .select('status,payment_confirmed_at')
        .eq('payment_provider', 'hitpay').eq('provider_request_id', reference)
        .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
      if (error) status = 'unavailable';
      else if (order?.status === 'cancelled' || order?.status === 'refunded') status = 'not_paid';
      else if (order?.payment_confirmed_at) status = order.status === 'paid' ? 'success' : 'processing';
      else if (order?.status === 'pending') status = 'pending';
    } catch {
      status = 'unavailable';
    }
  }

  // Only a coarse state crosses the server/client boundary: no email, key,
  // payment IDs, database credentials or privileged client reach the browser.
  return <PaymentReturn status={status} />;
}
