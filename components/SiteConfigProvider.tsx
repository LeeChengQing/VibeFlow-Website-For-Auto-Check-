'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { notificationPlanCodes, type NotificationBillingPlan, type PlanCode } from '@/lib/plans';
import { DEFAULT_SITE_CONFIG, offerIsActive, packagePrice, type SiteConfig } from '@/lib/site-config';
import { applyCanonicalPricing, type PricingCatalog } from '@/lib/canonical-pricing';
import { setPricingClock } from './useBundleCountdown';

const Context = createContext({ config: DEFAULT_SITE_CONFIG, preview: false, initialNow: 0, initialBillingPlan: undefined as NotificationBillingPlan | undefined, pricingReady:false, pricingFailed:false, catalog:null as PricingCatalog|null, provided:false, providers:[] as string[] });

/** The context contains settings only. Product, billing and clock state stay in their own components. */
export function SiteConfigProvider({ config, preview = false, initialNow, initialBillingPlan, children }: {
  config: SiteConfig; preview?: boolean; initialNow: number; initialBillingPlan?: NotificationBillingPlan; children: React.ReactNode;
}) {
  const parent=useContext(Context);
  const inherited=!preview&&parent.provided&&!parent.preview;
  const [catalog,setPricing]=useState<PricingCatalog|null>(null);
  const [failed,setPricingFailed]=useState(false);
  const pricing=inherited?parent.catalog:catalog;
  const pricingFailed=inherited?parent.pricingFailed:failed;
  useEffect(()=>{
    if(preview||inherited)return;
    const fragment=new URLSearchParams(location.hash.slice(1));
    const token=fragment.get('device_token');
    if(token&&/^[a-f0-9]{48,128}$/i.test(token)){sessionStorage.setItem('auto-check-device-token',token);history.replaceState(null,'',location.pathname+location.search);}
    let cancelled=false,timer:ReturnType<typeof setTimeout>,generation=0;
    async function refresh(){
      const version=++generation;clearTimeout(timer);
      try{const r=await fetch('/api/pricing',{cache:'no-store',headers:{Authorization:'Bearer '+(sessionStorage.getItem('auto-check-device-token')??'')},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('pricing_unavailable');const data=await r.json();applyCanonicalPricing(config,data);if(cancelled||version!==generation)return;setPricingClock(Date.parse(data.server_now));setPricingFailed(false);setPricing(data);
        const now=Date.parse(data.server_now),next=[Date.parse(data.campaign.starts_at),Date.parse(data.campaign.ends_at)].filter(t=>t>now);
        timer=setTimeout(()=>{setPricing(null);void refresh();},Math.max(100,Math.min(30000,...next.map(t=>t-now))));
      }catch{if(!cancelled&&version===generation){setPricing(null);setPricingFailed(true);timer=setTimeout(refresh,15000);}}
    }
    const onVisibility=()=>{if(!document.hidden){setPricing(null);void refresh();}};
    document.addEventListener('visibilitychange',onVisibility);
    void refresh();return()=>{cancelled=true;clearTimeout(timer);document.removeEventListener('visibilitychange',onVisibility);};
  },[config,preview,inherited]);
  const effective=useMemo(()=>preview?config:pricing?{...applyCanonicalPricing(config,pricing),settings:{...config.settings,checkoutEnabled:config.settings.checkoutEnabled&&pricing.checkout_allowed===true}}:{...config,offer:{...config.offer,enabled:false},settings:{...config.settings,checkoutEnabled:false},packages:config.packages.map(p=>({...p,promotionalAmount:null,promotionEnabled:false,enabled:false}))},[config,preview,pricing]);
  const value = useMemo(() => ({ config:effective, preview, initialNow:pricing?Date.parse(pricing.server_now):initialNow, initialBillingPlan,pricingReady:!!pricing,pricingFailed,catalog:pricing,provided:true,providers:pricing?.providers??[] }), [effective, preview, initialNow, initialBillingPlan,pricing,pricingFailed]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSiteConfig() { return useContext(Context); }

/** Updates at schedule boundaries and visibility changes, never on every countdown tick. */
export function useOfferActive() {
  const { config, initialNow, preview } = useSiteConfig();
  const [active, setActive] = useState(() => offerIsActive(config, initialNow || Date.now()));
  useEffect(() => {
    if(!preview){setActive(config.offer.enabled);return;}
    let timer: ReturnType<typeof setTimeout> | undefined;
    function update() {
      if (timer) clearTimeout(timer);
      const now = Date.now();
      setActive(offerIsActive(config, now));
      if (!config.offer.enabled) return;
      const next = [Date.parse(config.offer.startsAt), Date.parse(config.offer.endsAt)].find(time => time > now);
      if (next) timer = setTimeout(update, Math.min(next - now + 1, 2_147_483_647));
    }
    update();
    document.addEventListener('visibilitychange', update);
    return () => { if (timer) clearTimeout(timer); document.removeEventListener('visibilitychange', update); };
  }, [config,preview]);
  return preview?active:config.offer.enabled;
}

export function usePackagePrice(id: PlanCode) {
  const { config } = useSiteConfig();
  const active = useOfferActive();
  // Use the same calculation as checkout; a representative timestamp avoids another clock subscription.
  return packagePrice(config, id, active ? Date.parse(config.offer.startsAt) : Date.parse(config.offer.endsAt));
}

export function notificationOptions(config: SiteConfig) {
  return config.packages.filter(item => item.visible && (item.id === 'mobile_notification' || item.id === 'mobile_notification_yearly'))
    .sort((a, b) => a.order - b.order)
    .map(item => ({ id: item.id === 'mobile_notification_yearly' ? 'yearly' as const : 'semester' as const, enabled: item.enabled }));
}

export function resolveBillingPlan(config: SiteConfig, value: NotificationBillingPlan): NotificationBillingPlan {
  const options = notificationOptions(config);
  if (options.some(item => item.id === value && item.enabled)) return value;
  return options.find(item => item.enabled)?.id ?? options.find(item => item.id === value)?.id ?? options[0]?.id ?? 'yearly';
}

export function useNotificationBilling() {
  const { config, initialBillingPlan } = useSiteConfig();
  const [selected, setSelected] = useState<NotificationBillingPlan>(initialBillingPlan ?? 'yearly');
  const billingPlan = resolveBillingPlan(config, selected);
  return { billingPlan, setBillingPlan: setSelected, plan: config.packages.find(item => item.id === notificationPlanCodes[billingPlan])! };
}
