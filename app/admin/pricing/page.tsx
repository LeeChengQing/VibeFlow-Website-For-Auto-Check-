import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-auth';
import { PricingEditor } from './PricingEditor';
export const dynamic='force-dynamic';
export default async function Page() {
  if(!await getAdminSession()) redirect('/admin');
  return <main className="portal"><a href="/admin">← 后台</a><h1>价格与优惠排期</h1><PricingEditor/></main>;
}
