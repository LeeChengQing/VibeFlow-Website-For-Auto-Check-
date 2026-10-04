import type { SiteConfig } from '@/lib/site-config';
import { Hero } from './Hero';
import { HeroPurchaseCard } from './HeroPurchaseCard';
import { Landing } from './Landing';
import { LocaleProvider } from './LocaleProvider';
import { SiteConfigProvider } from './SiteConfigProvider';
import { MobilePurchase, MobilePurchaseBoundary } from './MobilePurchase';

/** Shared server composition lets the authenticated draft preview use the exact storefront. */
export function Homepage({ config, preview = false }: { config: SiteConfig; preview?: boolean }) {
  const storefront = <MobilePurchaseBoundary><Landing><MobilePurchase /><Hero><HeroPurchaseCard /></Hero></Landing></MobilePurchaseBoundary>;
  return <SiteConfigProvider config={config} preview={preview} initialNow={Date.now()}>
    {preview ? <LocaleProvider defaultLocale={config.settings.defaultLocale} persist={false}>{storefront}</LocaleProvider> : storefront}
  </SiteConfigProvider>;
}
