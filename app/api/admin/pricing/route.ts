import { readStripeBody } from '@/lib/stripe-server';
import { requireAdminSession } from '@/lib/admin-auth';
import { getSiteManagementData, mutateSiteSettings } from '@/lib/site-settings';
import { canonicalCampaignStatus } from '@/lib/canonical-pricing';
import { packagePrice, offerIsActive, validateSiteConfig, type SiteConfig } from '@/lib/site-config';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store'};
const keys:Record<string,string>={extension:'extension',mobile_notification:'phone',mobile_notification_yearly:'yearly',bundle:'bundle'};
function catalog(config:SiteConfig,version:number,now:string){
  const campaign={id:'site-offer',name:'Site offer',enabled:config.offer.enabled,starts_at:config.offer.startsAt,ends_at:config.offer.endsAt,version,state:''};
  campaign.state=canonicalCampaignStatus(campaign,now).toLowerCase();
  return {campaign,products:config.packages.map(p=>({id:keys[p.id]+':myr',product_key:keys[p.id],currency:'myr',regular_amount_minor:p.amount,promotional_amount_minor:p.promotionalAmount,effective_amount_minor:p.enabled?packagePrice(config,p.id,Date.parse(now)):null,enabled:p.enabled,promotion_enabled:p.promotionEnabled,promotion_active:offerIsActive(config,Date.parse(now))&&p.promotionEnabled&&p.promotionalAmount!==null,version,campaign_starts_at:campaign.starts_at,campaign_ends_at:campaign.ends_at}))};
}
export async function GET(){
  try{
    await requireAdminSession();
    const data=await getSiteManagementData(),now=new Date().toISOString();
    const draft=catalog(data.draft,data.version,now),published=catalog(data.published,data.version,now);
    return Response.json({products:draft.products,draft_campaign:draft.campaign,campaign:published.campaign,server_now:now,source:'site_configuration',audit:data.history.map(h=>({id:h.id,actor:'Publication',changed_at:h.createdAt,entity_id:'site_configuration',old_value:null,new_value:{offer:h.config.offer,packages:h.config.packages.map(p=>({id:p.id,amount:p.amount,promotionalAmount:p.promotionalAmount,promotionEnabled:p.promotionEnabled}))}}))},{headers});
  }catch(e){const unauthorized=e instanceof Error&&e.message==='UNAUTHORIZED';return Response.json({error:unauthorized?'UNAUTHORIZED':'site_pricing_unavailable'},{status:unauthorized?401:503,headers});}
}
export async function POST(request:Request){
  try{
    await requireAdminSession();
    const origin=process.env.APP_URL?new URL(process.env.APP_URL).origin:new URL(request.url).origin;
    if(request.headers.get('origin')!==origin)return Response.json({error:'INVALID_ORIGIN'},{status:403,headers});
    const input=JSON.parse((await readStripeBody(request,16384)).toString('utf8'));
    if(!input||!['product','campaign'].includes(input.kind)||typeof input.id!=='string'||!Number.isSafeInteger(input.version)||!input.values||typeof input.values!=='object'||Array.isArray(input.values))return Response.json({error:'invalid_pricing_update'},{status:400,headers});
    const allowed=input.kind==='campaign'?['enabled','starts_at','ends_at']:['regular_amount_minor','promotional_amount_minor','enabled','promotion_enabled'];
    if(Object.keys(input.values).some(k=>!allowed.includes(k)))return Response.json({error:'invalid_pricing_update'},{status:400,headers});
    for(const key of ['regular_amount_minor','promotional_amount_minor'])if(key in input.values&&input.values[key]!==null&&(!Number.isSafeInteger(input.values[key])||input.values[key]<100))return Response.json({error:'invalid_pricing_update'},{status:400,headers});
    const data=await getSiteManagementData();
    if(data.version!==input.version)return Response.json({error:'VERSION_CONFLICT'},{status:409,headers});
    const config=structuredClone(data.draft),v=input.values;
    if(input.kind==='campaign'){
      if(input.id!=='site-offer')throw Error('invalid_pricing_update');
      for(const key of ['starts_at','ends_at'])if(key in v&&(typeof v[key]!=='string'||!/([zZ]|[+-]\d{2}:\d{2})$/.test(v[key])))throw Error('invalid_pricing_update');
      config.offer={...config.offer,...('enabled'in v?{enabled:v.enabled}:{}),...('starts_at'in v?{startsAt:v.starts_at}:{}),...('ends_at'in v?{endsAt:v.ends_at}:{})};
    }else{
      const product=config.packages.find(p=>keys[p.id]+':myr'===input.id);
      if(!product)throw Error('invalid_pricing_update');
      if('regular_amount_minor'in v)product.amount=v.regular_amount_minor;
      if('promotional_amount_minor'in v)product.promotionalAmount=v.promotional_amount_minor;
      if('enabled'in v)product.enabled=v.enabled;
      if('promotion_enabled'in v)product.promotionEnabled=v.promotion_enabled;
    }
    let validated:SiteConfig;
    try{validated=validateSiteConfig(config);}catch{return Response.json({error:'invalid_pricing_update'},{status:400,headers});}
    await mutateSiteSettings('save',validated,input.version);
    return Response.json({ok:true,published:false},{headers});
  }catch(e){const message=e instanceof Error?e.message:'';return Response.json({error:['UNAUTHORIZED','VERSION_CONFLICT','invalid_pricing_update'].includes(message)?message:'site_pricing_unavailable'},{status:message==='UNAUTHORIZED'?401:message==='VERSION_CONFLICT'?409:message==='invalid_pricing_update'?400:503,headers});}
}
