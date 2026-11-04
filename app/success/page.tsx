import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { PaymentReturn, type PaymentReturnStatus } from '@/components/PaymentReturn';
import { MinimalPaymentReturn } from '@/components/MinimalPaymentReturn';
import { isHitPayUUID } from '@/lib/hitpay';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import type { OrderPlanCode } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Payment confirmation · Auto-Check',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function firstParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined;
}

function isMobileWebView(userAgent: string) {
  const mobile = /android|iphone|ipad|ipod/i.test(userAgent);
  if (!mobile) return false;
  const appWebView = /(?:;\s*wv\)|\bwv\b|TNGD?|Touch[\s-]?n[\s-]?Go|mytng|touchngo|FBAN|FBAV|Instagram|Line\/|MicroMessenger)/i.test(userAgent);
  const iosWebView = /iphone|ipad|ipod/i.test(userAgent) && /AppleWebKit/i.test(userAgent) && !/Safari\//i.test(userAgent);
  return appWebView || iosWebView;
}

function isGatewayReturn(params: Record<string, string | string[] | undefined>) {
  const gatewayStatus = firstParam(params.status) ?? firstParam(params.payment_status) ?? firstParam(params.status_id);
  return Boolean(
    isHitPayUUID(firstParam(params.order_id)) || isHitPayUUID(firstParam(params.reference)) ||
    firstParam(params.billcode) || firstParam(params.payment_request_id) || firstParam(params.session_id) ||
    (gatewayStatus && /^(completed|complete|success|successful|paid|succeeded|1)$/i.test(gatewayStatus))
  );
}

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderId = firstParam(params.order_id);
  const reference = firstParam(params.reference);
  if(process.env.NODE_ENV==='production'||process.env.LOCAL_DEMO!=='true'){
    if(isHitPayUUID(orderId)||isHitPayUUID(reference))redirect('/purchase?order_id='+encodeURIComponent(orderId??reference!));
    redirect('/');
  }
  const billcode = firstParam(params.billcode);
  const providerRequestId = billcode ?? firstParam(params.payment_request_id) ?? firstParam(params.session_id);
  const headersList = await headers();
  const minimalMobileReturn = isGatewayReturn(params) && isMobileWebView(headersList.get('user-agent') ?? '');
  let status: PaymentReturnStatus = 'unverified';
  let downloadExtension = false;
  let deliveryUnavailable = false;
  let receipt: { reference: string; plan: OrderPlanCode; amount: number; maskedEmail: string; paidAt: string; paymentProvider: 'hitpay' | 'stripe' | 'toyyibpay' } | undefined;

  // Either identifier only locates the order. Payment is confirmed exclusively
  // from the server-side webhook fields, never from browser query parameters.
  if (!isHitPayUUID(orderId) && !isHitPayUUID(reference) && !(providerRequestId && providerRequestId.length <= 128)) {
    if (!minimalMobileReturn) redirect('/');
  }

  if (isHitPayUUID(orderId) || isHitPayUUID(reference) || (providerRequestId && providerRequestId.length <= 128)) {
    try {
      const supabase = getCommerceDatabase();
      let query = supabase.from('orders')
        .select('id,reference,status,payment_confirmed_at,plan,amount_minor,buyer_email,payment_provider')
        .in('payment_provider', ['hitpay', 'stripe', 'toyyibpay']);
      query = isHitPayUUID(orderId)
        ? query.eq('id', orderId)
        : query.eq('provider_request_id', isHitPayUUID(reference) ? reference! : providerRequestId!);
      const { data: order, error } = await query
        .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
      if (error) status = 'unavailable';
      else if (order?.status === 'cancelled' || order?.status === 'refunded') status = 'not_paid';
      else if (order?.payment_confirmed_at && order.status === 'paid') {
        status = 'success';
        downloadExtension = order.plan === 'extension' || order.plan === 'bundle';
        const [emailName, emailDomain] = order.buyer_email.split('@');
        receipt = {
          reference: order.reference,
          plan: order.plan as OrderPlanCode,
          amount: order.amount_minor,
          maskedEmail: `${emailName.slice(0, 1)}•••••@${emailDomain ?? ''}`,
          paidAt: order.payment_confirmed_at,
          paymentProvider: order.payment_provider as 'hitpay' | 'stripe' | 'toyyibpay',
        };

        deliveryUnavailable = ['bundle','semester','yearly'].includes(order.plan);
      } else if (order?.payment_confirmed_at) {
        status = 'processing';
      }
      else if (order?.status === 'pending') status = 'pending';
    } catch {
      status = 'unavailable';
    }
  }

  // Only confirmed entitlements cross the server/client boundary; no buyer email,
  // payment IDs, hashes, ciphertext, database credentials or privileged client do.
  if (minimalMobileReturn) return <MinimalPaymentReturn status={status} />;

  return <PaymentReturn status={status} downloadExtension={downloadExtension}
    deliveryUnavailable={deliveryUnavailable} receipt={receipt} />;
}
