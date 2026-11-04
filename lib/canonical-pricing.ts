import type { SiteConfig } from './site-config';
export type PriceRow={id:string;product_key:string;currency:string;regular_amount_minor:number;promotional_amount_minor:number|null;effective_amount_minor:number|null;enabled:boolean;promotion_enabled:boolean;promotion_active:boolean;version:number;campaign_starts_at:string|null;campaign_ends_at:string|null};
export type PricingCatalog={server_now:string;campaign:{id:string;name:string;enabled:boolean;starts_at:string|null;ends_at:string|null;version:number;state:string};products:PriceRow[];providers?:string[];checkout_allowed?:boolean};
const productKeys:Record<string,string>={extension:'extension',mobile_notification:'phone',mobile_notification_yearly:'yearly',bundle:'bundle'};
export function applyCanonicalPricing(config:SiteConfig,data:PricingCatalog):SiteConfig {
  if(!Number.isFinite(Date.parse(data?.server_now))||!data.campaign||!Array.isArray(data.products)||!data.products.length) throw Error('pricing_unavailable');
  const packages=config.packages.map(p=>{
    const row=data.products.find(r=>r.product_key===productKeys[p.id]);
    if(!row||row.currency!=='myr'||!Number.isSafeInteger(row.regular_amount_minor)||row.enabled&&(!Number.isSafeInteger(row.effective_amount_minor)||(row.effective_amount_minor??0)<100)) throw Error('pricing_unavailable');
    return {...p,amount:row.regular_amount_minor,promotionalAmount:row.promotional_amount_minor,promotionEnabled:row.promotion_active,
      canonicalEffectiveAmount:row.effective_amount_minor??row.regular_amount_minor,enabled:row.enabled};
  });
  return {...config,packages,offer:{...config.offer,enabled:data.campaign.state==='active',startsAt:data.campaign.starts_at??'',endsAt:data.campaign.ends_at??''}};
}
