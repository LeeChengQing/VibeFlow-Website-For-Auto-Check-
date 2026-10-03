'use client';

import { useState } from 'react';
import { notificationPlanCodes, type NotificationBillingPlan } from '@/lib/plans';
import { purchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { NotificationPriceDisplay } from './NotificationPriceDisplay';
import { BuyButton } from './BuyButton';

/** Billing updates stop at this card, leaving Landing and its artwork untouched. */
export function NotificationPricingCard() {
  const { t, locale } = useLocale();
  const [billingPlan, setBillingPlan] = useState<NotificationBillingPlan>('yearly');
  const cta = purchaseText(locale, billingPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');

  return <article className="price-card featured">
    <p className="eyebrow">STAY IN THE LOOP</p>
    <div className="plan-heading"><h3>{t('手机通知服务', 'Mobile notifications')}</h3><span className="plan-badge">{t('扩展附加服务', 'EXTENSION ADD-ON')}</span></div>
    <p>{t('不必一直看电脑，也能了解签到结果。', 'Check your phone, not your computer, for updates.')}</p>
    <BillingSegmentedControl id="pricing-notification" value={billingPlan} onChange={setBillingPlan}/>
    <NotificationPriceDisplay id="pricing-notification-price" context="pricing" billingPlan={billingPlan}/>
    <ul>{[
      t('执行、成功与失败提醒', 'Execution, success & failure updates'),
      t('错过时间与状态未知提醒', 'Missed & unknown-status alerts'),
      t('独立手机通知密钥', 'Your own notification key'),
      t('支持 iPhone 与 Android', 'For iPhone & Android'),
      t('配置教程与客服支持', 'Setup guides & customer support'),
    ].map(item => <li key={item}>{item}</li>)}</ul>
    <BuyButton plan={notificationPlanCodes[billingPlan]}>{cta}</BuyButton>
  </article>;
}
