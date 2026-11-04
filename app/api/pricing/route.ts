import { canonicalCall } from '@/lib/canonical-commerce';
export const runtime='nodejs';
export async function GET(request:Request) {
  try {
    const r=await canonicalCall('pricing',{currency:'myr'},request.headers.get('authorization')??'');
    if(!r.ok) throw Error('pricing_unavailable');
    const data=await r.json();
    if(process.env.PUBLIC_SALES_ENABLED!=='true'&&!(process.env.NODE_ENV!=='production'&&process.env.COMMERCE_TEST_MODE==='true'))data.checkout_allowed=false;
    return Response.json(data,{headers:{'Cache-Control':'no-store'}});
  } catch {return Response.json({error:'pricing_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
