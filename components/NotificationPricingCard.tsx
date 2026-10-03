'use client';

import { notificationPlanCodes } from '@/lib/plans';
import { purchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { NotificationPriceDisplay } from './NotificationPriceDisplay';
import { BuyButton } from './BuyButton';
import { notificationOptions, useNotificationBilling, useSiteConfig } from './SiteConfigProvider';

/** Billing updates stop at this card, leaving Landing and its artwork untouched. */
export function NotificationPricingCard() {
  const { locale } = useLocale();
  const { config } = useSiteConfig();
  const { billingPlan, setBillingPlan, plan } = useNotificationBilling();
  const cta = purchaseText(locale, billingPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');
  if (!notificationOptions(config).length) return null;

  return <article className="price-card featured">
    <p className="eyebrow">STAY IN THE LOOP</p>
    <div className="plan-heading"><h3>{plan.name[locale]}</h3>{plan.badge[locale]&&<span className="plan-badge">{plan.badge[locale]}</span>}</div>
    <p>{plan.description[locale]}</p>
    <BillingSegmentedControl id="pricing-notification" value={billingPlan} onChange={setBillingPlan}/>
    <NotificationPriceDisplay id="pricing-notification-price" context="pricing" billingPlan={billingPlan}/>
    <ul>{plan.features.map((item,index) => <li key={index}>{item[locale]}</li>)}</ul>
    <BuyButton plan={notificationPlanCodes[billingPlan]}>{cta}</BuyButton>
  </article>;
}
