'use client';

import { useEffect, useRef } from 'react';
import { launchRemaining, mobileMoney, mobilePricing } from '@/lib/mobile-pricing';
import { useLocale } from './LocaleProvider';
import { useOfferActive, useSiteConfig } from './SiteConfigProvider';
import { subscribeBundleCountdown } from './useBundleCountdown';
import { BuyButton } from './BuyButton';

export function useMobilePricing() {
  const { config } = useSiteConfig();
  const active = useOfferActive();
  return mobilePricing(config, Date.parse(active ? config.offer.startsAt : config.offer.endsAt));
}

export function MobileLaunchCountdown() {
  const { t, locale } = useLocale();
  const { config, initialNow } = useSiteConfig();
  const { bundle } = useMobilePricing();
  const ref = useRef<HTMLTimeElement>(null);
  const endsAt = Date.parse(config.offer.endsAt);
  useEffect(() => {
    if (!bundle.discounted || !config.offer.showCountdown) return;
    return subscribeBundleCountdown(remaining => {
      const text = launchRemaining(locale, remaining);
      if (ref.current && ref.current.textContent !== text) ref.current.textContent = text;
    }, endsAt);
  }, [bundle.discounted, config.offer.showCountdown, endsAt, locale]);
  if (!bundle.discounted || !config.offer.showCountdown) return null;
  return <p className="mobile-launch-countdown">{t('首发优惠 · 剩余 ', 'Launch offer · Ends in ')}<time ref={ref} dateTime={config.offer.endsAt}>{launchRemaining(locale, Math.ceil((endsAt - initialNow) / 1000))}</time></p>;
}

export function MobileBundlePrice() {
  const { t } = useLocale();
  const { bundle } = useMobilePricing();
  return <div className="mobile-bundle-price">
    <div className="mobile-price-line"><strong>{mobileMoney(bundle.amount)}</strong>{bundle.discounted && <del aria-label={t('常规价格', 'Regular price')}>{mobileMoney(bundle.regular)}</del>}</div>
    <p className="mobile-price-caption">{bundle.discounted ? t('首发价格', 'Launch price') : t('完整体验包价格', 'Bundle price')}</p>
    <p className="mobile-separate-value">{mobileMoney(bundle.separate)} {t('为单独购买总价', 'if purchased separately')}</p>
    <MobileLaunchCountdown />
  </div>;
}

export function MobileBundleCard() {
  const { t, locale } = useLocale();
  const { config } = useSiteConfig();
  const plan = config.packages.find(p => p.id === 'bundle')!;
  const { bundle } = useMobilePricing();
  if (!plan.visible) return null;
  return <article className="mobile-only mobile-bundle-detail mobile-purchase-panel">
    <div className="mobile-panel-heading"><h3>{t('完整体验', 'Complete Experience')}</h3><span className="mobile-value-badge">{t('超值之选', 'BEST VALUE')}</span></div>
    <p className="mobile-plan-subtitle">{plan.description[locale]}</p>
    <MobileBundlePrice />
    <ul className="mobile-benefits"><li>{t('包含 Chrome 扩展', 'Chrome extension included')}</li><li>{t('包含首学期手机通知', 'First semester notifications included')}</li></ul>
    <div className="mobile-bundle-inline-cta"><BuyButton plan="bundle">{t('购买完整体验包', 'Get the complete bundle')} · {mobileMoney(bundle.amount)}</BuyButton></div>
    <details className="mobile-included"><summary>{t('查看全部包含内容', 'View everything included')}</summary><ul>{plan.features.map((feature, index) => <li key={index}>{feature[locale]}</li>)}</ul></details>
  </article>;
}
