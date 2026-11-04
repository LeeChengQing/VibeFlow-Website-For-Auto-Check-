import {UnifiedPurchaseReturn} from '@/components/UnifiedPurchaseReturn';
import {isOrderId} from '@/lib/unified-commerce';
export const dynamic='force-dynamic';
export const metadata={title:'Purchase status · Auto-Check',robots:{index:false,follow:false}};
export default async function SuccessPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const id=(await searchParams).order_id;
  return isOrderId(id)?<UnifiedPurchaseReturn orderId={id}/>:<main className="mx-auto max-w-2xl px-6 py-32">请从原购买页面查看订单 / Open your original purchase page.</main>;
}
