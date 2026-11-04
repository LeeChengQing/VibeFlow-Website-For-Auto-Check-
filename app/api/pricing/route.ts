import {getPublishedSiteConfig} from '@/lib/site-settings';
import {offerIsActive,packagePrice} from '@/lib/site-config';
import {configuredPaymentProviders,publicSalesEnabled} from '@/lib/payments/provider-status';
export const runtime='nodejs';
export async function GET(){
  try{
    const config=await getPublishedSiteConfig(),now=Date.now(),active=offerIsActive(config,now),offer=config.offer;
    const keys:Record<string,string>={extension:'extension',mobile_notification:'phone',mobile_notification_yearly:'yearly',bundle:'bundle'};
    const providers=configuredPaymentProviders();
    const campaign={id:'site-offer',name:'Site offer',enabled:offer.enabled,starts_at:offer.startsAt||null,ends_at:offer.endsAt||null,state:!offer.enabled?'disabled':active?'active':now<Date.parse(offer.startsAt)?'upcoming':'expired'};
    return Response.json({server_now:new Date(now).toISOString(),campaign,providers,checkout_allowed:publicSalesEnabled()&&config.settings.checkoutEnabled&&!config.settings.maintenance&&providers.length>0,products:config.packages.map(p=>({id:keys[p.id]+':myr',product_key:keys[p.id],currency:'myr',regular_amount_minor:p.amount,promotional_amount_minor:p.promotionalAmount,effective_amount_minor:p.enabled?packagePrice(config,p.id,now):null,enabled:p.enabled,promotion_enabled:p.promotionEnabled,promotion_active:active&&p.promotionEnabled&&p.promotionalAmount!==null,campaign_starts_at:campaign.starts_at,campaign_ends_at:campaign.ends_at}))},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'pricing_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
