'use client';

import { displayAmount, price } from '@/lib/plans';
import { formatPurchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { BuyButton } from './BuyButton';
import { useBundleCountdown } from './useBundleCountdown';
import { usePackagePrice, useSiteConfig } from './SiteConfigProvider';

export function BundleOfferCard() {
  const { locale, t } = useLocale();
  const { config } = useSiteConfig();
  const plan = config.packages.find(item => item.id === 'bundle')!;
  const amount = usePackagePrice('bundle');
  const { isOfferActive, remainingSeconds: remaining } = useBundleCountdown(plan.visible && plan.promotionEnabled && plan.promotionalAmount !== null && plan.promotionalAmount < plan.amount);
  const discounted = isOfferActive && amount < plan.amount;
  const values = { days: Math.floor(remaining / 86400), hours: String(Math.floor((remaining % 86400) / 3600)).padStart(2, '0'), minutes: String(Math.floor((remaining % 3600) / 60)).padStart(2, '0'), seconds: String(remaining % 60).padStart(2, '0') };
  if (!plan.visible) return null;

  return <article className="price-card bundle-card">
    <div className="bundle-card-heading">
      <div><p className="eyebrow">THE ALL-IN-ONE EXPERIENCE</p><h3>{plan.name[locale]}</h3><p>{plan.description[locale]}</p></div>
      {plan.badge[locale]&&<span className="bundle-badge">{plan.badge[locale]}</span>}
    </div>
    <div className="bundle-card-content">
      <div className="bundle-offer-summary">
        <div className="bundle-prices">
          {discounted && <del className="bundle-original-price">{price(plan.amount)}</del>}
          <strong className="bundle-current-price"><span>RM</span>{displayAmount(amount)}</strong>
          <small>{t('扩展买断 + 首学期通知','One-time extension + first semester notifications')}</small>
        </div>
        {discounted && config.offer.showCountdown && <div className="bundle-countdown">
          <span>{t('优惠倒计时','OFFER ENDS IN')}</span>
          <time dateTime={config.offer.endsAt} aria-label={t('优惠剩余时间','Time remaining in offer')}>{formatPurchaseText(locale,'fullTimer',values)}</time>
        </div>}
      </div>
      <ul className="bundle-features">{plan.features.map((item,index)=><li key={index}>{item[locale]}</li>)}</ul>
    </div>
    <BuyButton plan="bundle" className="button primary bundle-buy">{t('立即购买完整体验包','Get the complete bundle')}</BuyButton>
  </article>;
}
