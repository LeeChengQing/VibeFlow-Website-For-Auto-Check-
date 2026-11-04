import { readStripeBody } from '@/lib/stripe-server';
import { requireAdminSession } from '@/lib/admin-auth';
import { pricingDatabase } from '@/lib/canonical-commerce';
export const runtime='nodejs';
export async function GET() {
  try {
    await requireAdminSession();
    const db=pricingDatabase();
    const [catalogs,audit]=await Promise.all([
      Promise.all(['myr','cny','usd'].map(currency=>db.rpc('pricing_catalog',{p_currency:currency}))),
      db.from('pricing_audit').select('*').order('id',{ascending:false}).limit(100)
    ]);
    if(audit.error||catalogs.some(r=>r.error)) throw Error('pricing_unavailable');
    return Response.json({products:catalogs.flatMap(r=>r.data.products),campaign:catalogs[0].data.campaign,audit:audit.data,server_now:catalogs[0].data.server_now},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {return Response.json({error:e instanceof Error?e.message:'pricing_unavailable'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:503});}
}
export async function POST(request:Request) {
  try {
    const session=await requireAdminSession();
    const origin=process.env.APP_URL?new URL(process.env.APP_URL).origin:new URL(request.url).origin;
    if(request.headers.get('origin')!==origin) return Response.json({error:'INVALID_ORIGIN'},{status:403});
    const input=JSON.parse((await readStripeBody(request,16384)).toString('utf8'));
    if(!input||!['product','campaign'].includes(input.kind)||typeof input.id!=='string'||input.id.length>100||!Number.isSafeInteger(input.version)||!input.values||typeof input.values!=='object'||Array.isArray(input.values)) throw Error('invalid_pricing_update');
    for(const [key,value] of Object.entries(input.values)) {
      if(['regular_amount_minor','promotional_amount_minor'].includes(key)&&value!==null&&(!Number.isSafeInteger(value)||Number(value)<100)) throw Error('invalid_price');
      if(['enabled','promotion_enabled'].includes(key)&&typeof value!=='boolean') throw Error('invalid_boolean');
      if(['starts_at','ends_at'].includes(key)&&(typeof value!=='string'||!/([zZ]|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))) throw Error('invalid_campaign_time');
    }
    const {error}=await pricingDatabase().rpc('pricing_admin_update',{p_kind:input.kind,p_id:input.id,p_values:input.values,p_expected_version:input.version,p_actor:'admin-session:'+session.issuedAt});
    if(error) return Response.json({error:'pricing_update_rejected'},{status:409});
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  } catch(e) {return Response.json({error:e instanceof Error?e.message:'invalid_pricing_update'},{status:e instanceof Error&&e.message==='UNAUTHORIZED'?401:400});}
}
