import {getPublishedSiteConfig} from '@/lib/site-settings';
import {packagePrice,purchaseAllowed,offerIsActive} from '@/lib/site-config';
export async function GET(){
  try{
    const config=await getPublishedSiteConfig(),active=offerIsActive(config);
    const mapping:Record<string,string>={extension:'extension',mobile_notification:'phone',mobile_notification_yearly:'yearly',bundle:'bundle'};
    const providers=[...(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET?['stripe']:[]),...(process.env.TOYYIBPAY_SECRET_KEY&&process.env.TOYYIBPAY_CATEGORY_CODE?['toyyibpay']:[])];
    return Response.json({server_now:new Date().toISOString(),checkout_allowed:config.settings.checkoutEnabled&&!config.settings.maintenance,providers,products:config.packages.map(p=>({product_key:mapping[p.id],regular_amount_minor:p.amount,effective_amount_minor:packagePrice(config,p.id),enabled:purchaseAllowed(config,p.id),promotion_active:active&&p.promotionEnabled,campaign_ends_at:config.offer.endsAt||null})),campaign:{state:active?'active':'inactive',starts_at:config.offer.startsAt||null,ends_at:config.offer.endsAt||null}},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'pricing_unavailable'},{status:503});}
}
