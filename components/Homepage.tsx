import type { SiteConfig } from '@/lib/site-config';
import { Hero } from './Hero';
import { HeroPurchaseCard } from './HeroPurchaseCard';
import { Landing } from './Landing';
import { LocaleProvider } from './LocaleProvider';
import { SiteConfigProvider } from './SiteConfigProvider';
import { MobilePurchase, MobilePurchaseBoundary } from './MobilePurchase';
import type { NotificationBillingPlan } from '@/lib/plans';

/** Shared server composition lets the authenticated draft preview use the exact storefront. */
export function Homepage({ config, preview = false, initialProduct = 'bundle', initialBillingPlan }: { config: SiteConfig; preview?: boolean; initialProduct?: 'bundle' | 'notification'; initialBillingPlan?: NotificationBillingPlan }) {
  const storefront = <MobilePurchaseBoundary><Landing><MobilePurchase initialProduct={initialProduct} /><Hero><HeroPurchaseCard initialProduct={initialProduct} /></Hero></Landing></MobilePurchaseBoundary>;
  return <SiteConfigProvider config={config} preview={preview} initialNow={Date.now()} initialBillingPlan={initialBillingPlan}>
    {preview ? <LocaleProvider defaultLocale={config.settings.defaultLocale} persist={false}>{storefront}</LocaleProvider> : storefront}
  </SiteConfigProvider>;
}
