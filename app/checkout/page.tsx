import { redirect } from 'next/navigation';
import { isPlan } from '@/lib/plans';
import { CheckoutPage } from '@/components/CheckoutPage';

export default async function Checkout({ searchParams }: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const { plan } = await searchParams;
  if (!isPlan(plan)) redirect('/#pricing');
  return <CheckoutPage plan={plan} />;
}
