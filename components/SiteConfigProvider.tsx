'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { notificationPlanCodes, type NotificationBillingPlan, type PlanCode } from '@/lib/plans';
import { DEFAULT_SITE_CONFIG, offerIsActive, packagePrice, type SiteConfig } from '@/lib/site-config';

const Context = createContext({ config: DEFAULT_SITE_CONFIG, preview: false, initialNow: 0, initialBillingPlan: undefined as NotificationBillingPlan | undefined });

/** The context contains settings only. Product, billing and clock state stay in their own components. */
export function SiteConfigProvider({ config, preview = false, initialNow, initialBillingPlan, children }: {
  config: SiteConfig; preview?: boolean; initialNow: number; initialBillingPlan?: NotificationBillingPlan; children: React.ReactNode;
}) {
  const value = useMemo(() => ({ config, preview, initialNow, initialBillingPlan }), [config, preview, initialNow, initialBillingPlan]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSiteConfig() { return useContext(Context); }

/** Updates at schedule boundaries and visibility changes, never on every countdown tick. */
export function useOfferActive() {
  const { config, initialNow } = useSiteConfig();
  const [active, setActive] = useState(() => offerIsActive(config, initialNow || Date.now()));
  useEffect(() => {
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
  }, [config]);
  return active;
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
