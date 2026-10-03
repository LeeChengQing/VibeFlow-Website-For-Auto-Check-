'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { BUNDLE_OFFER_ENDS_AT, getPlanAmount, notificationPlanCodes, plans, price, type NotificationBillingPlan, type PlanCode } from '@/lib/plans';
import { formatPurchaseText, purchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { BuyButton } from './BuyButton';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { NotificationPriceDisplay } from './NotificationPriceDisplay';
import { subscribeBundleCountdown } from './useBundleCountdown';

type Product = 'bundle' | 'extension' | 'notification';
const products: readonly Product[] = ['bundle', 'extension', 'notification'];

function BundleUrgency({ expanded }: { expanded: boolean }) {
  const { locale, t } = useLocale();
  const fullTimerRef = useRef<HTMLTimeElement>(null);
  const compactTimerRef = useRef<HTMLSpanElement>(null);
  const [offerActive, setOfferActive] = useState(() => Date.now() < BUNDLE_OFFER_ENDS_AT);

  useEffect(() => {
    return subscribeBundleCountdown(remaining => {
      const days = Math.floor(remaining / 86400);
      const hours = Math.floor((remaining % 86400) / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      const seconds = remaining % 60;
      const values = { days, hours: String(hours).padStart(2, '0'), minutes: String(minutes).padStart(2, '0'), seconds: String(seconds).padStart(2, '0') };
      if (fullTimerRef.current) fullTimerRef.current.textContent = formatPurchaseText(locale, 'fullTimer', values);
      if (compactTimerRef.current) compactTimerRef.current.textContent = formatPurchaseText(locale, 'compactTimer', values);
      if (remaining === 0) setOfferActive(false);
    });
  }, [locale]);

  const saving = plans.bundle.originalAmount - getPlanAmount('bundle');

  return <>
    <span className={`mini-bundle-timer-chip ${expanded || !offerActive ? 'is-hidden' : ''}`} aria-hidden="true" ref={compactTimerRef}>
      {formatPurchaseText(locale, 'compactTimer', { days: 0, hours: '00' })}
    </span>
    <div className={`mini-bundle-promo-expand ${expanded ? 'is-open' : ''}`} aria-hidden={!expanded}>
      <div className={`mini-bundle-promo ${offerActive ? '' : 'ended'}`}>
        {offerActive ? <>
          <span className="mini-bundle-promo-copy"><strong>{t('限时优惠', 'LIMITED-TIME DEAL')}</strong><span>{formatPurchaseText(locale, 'bundleSave', { amount: price(saving) })}</span></span>
          <time ref={fullTimerRef} className="mini-bundle-countdown" dateTime={new Date(BUNDLE_OFFER_ENDS_AT).toISOString()} aria-label={purchaseText(locale, 'bundleTimerLabel')} />
        </> : <span className="mini-bundle-offer-ended">{t('优惠已结束，仍可购买完整体验包', 'Offer ended · Bundle still available')}</span>}
      </div>
    </div>
  </>;
}

export function HeroPurchaseCard() {
  const { t, locale } = useLocale();
  const [selectedProduct, setSelectedProduct] = useState<Product>('bundle');
  const [billingPlan, setBillingPlan] = useState<NotificationBillingPlan>('yearly');
  const [bundleAmount, setBundleAmount] = useState(() => getPlanAmount('bundle'));
  const [offerActive, setOfferActive] = useState(() => Date.now() < BUNDLE_OFFER_ENDS_AT);
  const productRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const notificationPlan = notificationPlanCodes[billingPlan];
  const lowestNotificationPrice = (Object.keys(notificationPlanCodes) as NotificationBillingPlan[])
    .map(period => ({ period, amount: getPlanAmount(notificationPlanCodes[period]) }))
    .reduce((lowest, current) => current.amount < lowest.amount ? current : lowest);

  useEffect(() => {
    const timeUntilOfferEnds = BUNDLE_OFFER_ENDS_AT - Date.now();
    if (timeUntilOfferEnds <= 0) {
      setOfferActive(false);
      setBundleAmount(getPlanAmount('bundle'));
      return;
    }
    const timeout = window.setTimeout(() => {
      setOfferActive(false);
      setBundleAmount(getPlanAmount('bundle'));
    }, timeUntilOfferEnds + 100);
    return () => window.clearTimeout(timeout);
  }, []);

  const checkoutPlan: PlanCode = selectedProduct === 'bundle'
    ? 'bundle'
    : selectedProduct === 'extension'
      ? 'extension'
      : notificationPlan;
  const cta = selectedProduct === 'bundle'
    ? t('购买完整体验包', 'Get complete bundle')
    : selectedProduct === 'extension'
      ? t('购买浏览器扩展', 'Buy browser extension')
      : purchaseText(locale, billingPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');

  function handleProductKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + products.length) % products.length;
    setSelectedProduct(products[nextIndex]);
    productRefs.current[nextIndex]?.focus();
  }

  return <div className="hero-checkout">
    <div className="checkout-card-content">
      <div className="window-label"><span>YOUR NEXT SEMESTER, SORTED.</span><span className="window-dots" aria-hidden>● ● ●</span></div>
      <div className="checkout-product">
        <Image src="/files/logo.png" alt="Auto-Check" width="64" height="64" sizes="64px" quality={100} loading="eager"/>
        <div><p className="eyebrow">AUTO-CHECK</p><h2>{t('让签到简单一点。', 'A simpler class routine.')}</h2></div>
      </div>
      <p className="checkout-subtitle">{t('选择你需要的服务。', 'Choose the service you need.')}</p>

      <div className="mini-plans" role="radiogroup" aria-label={t('选择产品', 'Choose a product')}>
        <div className="mini-bundle-group">
          <button
            ref={node => { productRefs.current[0] = node; }}
            type="button"
            role="radio"
            aria-checked={selectedProduct === 'bundle'}
            tabIndex={selectedProduct === 'bundle' ? 0 : -1}
            className={`mini-plan mini-bundle-plan ${selectedProduct === 'bundle' ? 'selected' : ''}`}
            onClick={() => setSelectedProduct('bundle')}
            onKeyDown={event => handleProductKeyDown(event, 0)}
          >
            <span className="selection-radio" aria-hidden="true"/>
            <span className="mini-bundle-copy"><strong>{t('完整体验包', 'Complete experience bundle')}</strong><small>{t('扩展 + 首学期通知', 'Extension + first semester notifications')}</small></span>
            <span className="mini-bundle-price">
              {offerActive && <span>{t('限时特惠', 'LIMITED-TIME OFFER')}</span>}
              {offerActive && <del className="mini-bundle-original-price">{price(plans.bundle.originalAmount)}</del>}
              <b>{price(bundleAmount)}</b>
            </span>
          </button>
          <BundleUrgency expanded={selectedProduct === 'bundle'}/>
        </div>

        <button
          ref={node => { productRefs.current[1] = node; }}
          type="button"
          role="radio"
          aria-checked={selectedProduct === 'extension'}
          tabIndex={selectedProduct === 'extension' ? 0 : -1}
          className={`mini-plan ${selectedProduct === 'extension' ? 'selected' : ''}`}
          onClick={() => setSelectedProduct('extension')}
          onKeyDown={event => handleProductKeyDown(event, 1)}
        >
          <span className="selection-radio" aria-hidden="true"/>
          <span><strong>{t('浏览器扩展', 'Browser extension')}</strong><small>{t('ZIP 安装包 · 一次购买', 'ZIP package · One-time purchase')}</small></span>
          <b>{price(plans.extension.amount)}</b>
        </button>

        <div className={`mini-notification-option ${selectedProduct === 'notification' ? 'selected' : ''}`}>
          <button
            ref={node => { productRefs.current[2] = node; }}
            type="button"
            role="radio"
            aria-checked={selectedProduct === 'notification'}
            tabIndex={selectedProduct === 'notification' ? 0 : -1}
            className="mini-plan mini-notification-choice"
            onClick={() => setSelectedProduct('notification')}
            onKeyDown={event => handleProductKeyDown(event, 2)}
          >
            <span className="selection-radio" aria-hidden="true"/>
            <span><strong>{t('手机通知服务', 'Mobile notifications')}</strong><small>{t('通知提醒 · 跨设备', 'Notifications · Across your devices')}</small></span>
            {selectedProduct !== 'notification' && <b className="mini-from-price">{purchaseText(locale, 'from')} {price(lowestNotificationPrice.amount)} {purchaseText(locale, lowestNotificationPrice.period === 'yearly' ? 'perYear' : 'perSemester')}</b>}
          </button>
          <div className={`mini-notification-details-expand ${selectedProduct === 'notification' ? 'is-open' : ''}`} aria-hidden={selectedProduct !== 'notification'}>
            <div className="mini-notification-details" inert={selectedProduct !== 'notification'}>
              <BillingSegmentedControl id="hero-notification" value={billingPlan} onChange={setBillingPlan}/>
              <NotificationPriceDisplay id="hero-notification-price" context="hero" billingPlan={billingPlan}/>
            </div>
          </div>
        </div>
      </div>

    </div>
    <div className="hero-checkout-footer">
      <BuyButton plan={checkoutPlan}>{cta}</BuyButton>
    </div>
  </div>;
}
