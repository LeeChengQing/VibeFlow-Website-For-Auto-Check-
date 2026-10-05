import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PaymentReturn, type PaymentReturnStatus } from '@/components/PaymentReturn';
import { isHitPayUUID } from '@/lib/hitpay';
import { decryptLicenseKey } from '@/lib/license-key-encryption';
import { getCommerceDatabase } from '@/lib/supabase/commerce';
import type { OrderPlanCode } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Payment confirmation · Auto-Check',
  robots: { index: false, follow: false },
};
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function SuccessPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const orderId = typeof params.order_id === 'string' ? params.order_id : undefined;
  const reference = typeof params.reference === 'string' ? params.reference : undefined;
  let status: PaymentReturnStatus = 'unverified';
  let downloadExtension = false;
  let licenseKey: string | undefined;
  let licensePlan: 'semester' | 'yearly' | undefined;
  let deliveryUnavailable = false;
  let receipt: { reference: string; plan: OrderPlanCode; amount: number; maskedEmail: string; paidAt: string; paymentProvider: 'hitpay' | 'stripe' } | undefined;

  // Either identifier only locates the order. Payment is confirmed exclusively
  // from the server-side webhook fields, never from browser query parameters.
  if (!isHitPayUUID(orderId) && !isHitPayUUID(reference)) redirect('/');

  if (isHitPayUUID(orderId) || isHitPayUUID(reference)) {
    try {
      const supabase = getCommerceDatabase();
      let query = supabase.from('orders')
        .select('id,reference,status,payment_confirmed_at,plan,amount_minor,buyer_email,payment_provider')
        .in('payment_provider', ['hitpay', 'stripe']);
      query = isHitPayUUID(orderId)
        ? query.eq('id', orderId)
        : query.eq('provider_request_id', reference!);
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
          paymentProvider: order.payment_provider as 'hitpay' | 'stripe',
        };

        if (order.plan === 'bundle' || order.plan === 'semester' || order.plan === 'yearly') {
          const expectedPlan = order.plan === 'bundle' ? 'semester' : order.plan;
          try {
            const { data: license, error: licenseError } = await supabase.from('issued_licenses')
              .select('inventory_id,plan_type')
              .eq('order_id', order.id).eq('status', 'active')
              .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
            if (licenseError || !license || license.plan_type !== expectedPlan) {
              deliveryUnavailable = true;
            } else {
              const { data: inventory, error: inventoryError } = await supabase.from('key_inventory')
                .select('encrypted_key,key_hash')
                .eq('id', license.inventory_id).eq('status', 'assigned')
                .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
              if (inventoryError || !inventory?.encrypted_key || !inventory.key_hash) {
                deliveryUnavailable = true;
              } else {
                licenseKey = decryptLicenseKey(inventory.encrypted_key, inventory.key_hash);
                licensePlan = expectedPlan;
              }
            }
          } catch {
            deliveryUnavailable = true;
            licenseKey = undefined;
            licensePlan = undefined;
          }
        }
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
  return <PaymentReturn status={status} downloadExtension={downloadExtension}
    licenseKey={licenseKey} licensePlan={licensePlan} deliveryUnavailable={deliveryUnavailable} receipt={receipt} />;
}
