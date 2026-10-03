'use client';

import { AnimatePresence, useReducedMotion } from 'framer-motion';
import * as m from 'framer-motion/m';
import { displayAmount, notificationPlanCodes, price, type NotificationBillingPlan } from '@/lib/plans';
import { formatPurchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { usePackagePrice, useSiteConfig } from './SiteConfigProvider';
import { billingPeriodText } from '@/lib/purchaseLocale';

export function NotificationPriceDisplay({
  billingPlan,
  id,
  context,
}: {
  billingPlan: NotificationBillingPlan;
  id: string;
  context: 'hero' | 'pricing';
}) {
  const { locale } = useLocale();
  const shouldReduceMotion = useReducedMotion();
  const { config } = useSiteConfig();
  const plan = config.packages.find(item => item.id === notificationPlanCodes[billingPlan])!;
  const amount = usePackagePrice(plan.id);
  const originalAmount = plan.amount;
  const hasDiscount = originalAmount > amount;
  const savingsAmount = hasDiscount ? originalAmount - amount : undefined;
  const discountLabel = savingsAmount && originalAmount
    ? formatPurchaseText(locale, 'savingsPercent', { percent: Math.round((savingsAmount / originalAmount) * 100) })
    : undefined;
  const period = billingPeriodText(locale, billingPlan);

  return <div id={id} className={`notification-price-stage notification-price-${context}`} aria-live="polite" aria-atomic="true">
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={billingPlan}
        className="notification-price-content"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
      >
        <div className="notification-price-meta">
          {hasDiscount ? <s>{price(originalAmount)}</s> : <span className="notification-price-meta-placeholder" aria-hidden="true">&nbsp;</span>}
          {discountLabel && <span className="notification-savings">{discountLabel}</span>}
        </div>
        <p className="notification-current-price"><span>RM</span>{' '}<strong>{displayAmount(amount)}</strong>{period && <small>/ {period}</small>}</p>
        <p className="notification-price-note" />
      </m.div>
    </AnimatePresence>
  </div>;
}
