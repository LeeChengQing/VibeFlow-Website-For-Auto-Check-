import {requireAdminSession} from '@/lib/admin-auth';
import {commerceDatabase} from '@/lib/unified-commerce';
export async function UnifiedOrdersPanel(){
  await requireAdminSession();
  const {data,error}=await commerceDatabase().from('payment_orders').select('id,plan,status,amount_minor,currency,payment_provider,refund_review,created_at').order('created_at',{ascending:false}).limit(100);
  if(error)return <p role="alert">Orders could not be loaded. Refresh to retry.</p>;
  return <section className="overflow-x-auto"><h2 className="mb-4 text-xl font-semibold">Orders</h2>{!data?.length?<p>No orders yet.</p>:<table className="w-full text-left text-sm"><thead><tr>{['Order','Plan','Amount','Provider','Status','Review'].map(label=><th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.map((order:any)=><tr className="border-t border-white/10" key={order.id}><td className="p-3 font-mono">{order.id}</td><td className="p-3">{order.plan}</td><td className="p-3">{order.currency} {(order.amount_minor/100).toFixed(2)}</td><td className="p-3">{order.payment_provider}</td><td className="p-3">{order.status}</td><td className="p-3">{order.refund_review?'Partial refund · manual review':'—'}</td></tr>)}</tbody></table>}</section>;
}
