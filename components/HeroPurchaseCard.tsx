'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { notificationPlanCodes, price, type PlanCode } from '@/lib/plans';
import { packagePrice } from '@/lib/site-config';
import { formatPurchaseText, purchaseText } from '@/lib/purchaseLocale';
import { useLocale } from './LocaleProvider';
import { BuyButton } from './BuyButton';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { NotificationPriceDisplay } from './NotificationPriceDisplay';
import { subscribeBundleCountdown } from './useBundleCountdown';
import { notificationOptions, useNotificationBilling, useOfferActive, useSiteConfig } from './SiteConfigProvider';

type Product = 'bundle' | 'extension' | 'notification';

function BundleUrgency({ expanded }: { expanded: boolean }) {
  const { locale, t } = useLocale();
  const { config, initialNow } = useSiteConfig();
  const offerActive = useOfferActive();
  const fullTimerRef = useRef<HTMLTimeElement>(null);
  const compactTimerRef = useRef<HTMLSpanElement>(null);
  const plan = config.packages.find(item => item.id === 'bundle')!;
  const saving = offerActive && plan.promotionEnabled && plan.promotionalAmount !== null ? plan.amount - plan.promotionalAmount : 0;
  const endsAt = Date.parse(config.offer.endsAt);

  function timerValues(remaining: number) {
    return { days: Math.floor(remaining / 86400), hours: String(Math.floor((remaining % 86400) / 3600)).padStart(2, '0'), minutes: String(Math.floor((remaining % 3600) / 60)).padStart(2, '0'), seconds: String(remaining % 60).padStart(2, '0') };
  }
  useEffect(() => {
    if (!offerActive || !saving || !config.offer.showCountdown) return;
    return subscribeBundleCountdown(remaining => {
      const values = timerValues(remaining);
      if (fullTimerRef.current) fullTimerRef.current.textContent = formatPurchaseText(locale, 'fullTimer', values);
      if (compactTimerRef.current) compactTimerRef.current.textContent = formatPurchaseText(locale, 'compactTimer', values);
    }, endsAt);
  }, [locale, offerActive, saving, config.offer.showCountdown, endsAt]);

  if (!offerActive || !saving) return null;
  const values = timerValues(Math.max(0, Math.ceil((endsAt - (initialNow || Date.now())) / 1000)));
  return <>
    {config.offer.showCountdown && <span className={`mini-bundle-timer-chip ${expanded ? 'is-hidden' : ''}`} aria-hidden="true" ref={compactTimerRef}>
      {formatPurchaseText(locale, 'compactTimer', values)}
    </span>}
    <div className={`mini-bundle-promo-expand ${expanded ? 'is-open' : ''}`} aria-hidden={!expanded}>
      <div className="mini-bundle-promo">
        <span className="mini-bundle-promo-copy"><strong>{t('限时优惠', 'LIMITED-TIME DEAL')}</strong><span>{formatPurchaseText(locale, 'bundleSave', { amount: price(saving) })}</span></span>
        {config.offer.showCountdown && <time ref={fullTimerRef} className="mini-bundle-countdown" dateTime={config.offer.endsAt} aria-label={purchaseText(locale, 'bundleTimerLabel')}>{formatPurchaseText(locale, 'fullTimer', values)}</time>}
      </div>
    </div>
  </>;
}

export function HeroPurchaseCard() {
  const { t, locale } = useLocale();
  const { config } = useSiteConfig();
  const offerActive = useOfferActive();
  const [selected, setSelectedProduct] = useState<Product>('bundle');
  const { billingPlan, setBillingPlan } = useNotificationBilling();
  const productRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkoutCardRef = useRef<HTMLDivElement>(null);
  const notificationPlan = notificationPlanCodes[billingPlan];
  const notificationPackages = config.packages.filter(item => item.visible && (item.id === 'mobile_notification' || item.id === 'mobile_notification_yearly')).sort((a,b)=>a.order-b.order);
  const notificationMetadata = notificationPackages[0];
  const products = config.packages.filter(item => item.visible && (item.id === 'bundle' || item.id === 'extension')).map(item=>({ product: item.id as Product, metadata:item, enabled:item.enabled }));
  if (notificationMetadata) products.push({ product:'notification', metadata:notificationMetadata, enabled:notificationPackages.some(item=>item.enabled) });
  products.sort((a,b)=>a.metadata.order-b.metadata.order);
  const selectedProduct = products.some(item=>item.product===selected&&item.enabled) ? selected : products.find(item=>item.enabled)?.product ?? products[0]?.product;
  const now = Date.parse(offerActive ? config.offer.startsAt : config.offer.endsAt);
  const amount = (id: PlanCode) => packagePrice(config,id,now);
  const lowestNotificationPrice = notificationOptions(config).map(item=>({period:item.id,amount:amount(notificationPlanCodes[item.id])})).sort((a,b)=>a.amount-b.amount)[0];

  // Reuse the static JSX subtree on product/billing updates; translate on locale changes.
  const heading = useMemo(() => <>
    <div className="window-label"><span>YOUR NEXT SEMESTER, SORTED.</span><span className="window-dots" aria-hidden>● ● ●</span></div>
    <div className="checkout-product">
      <Image src="/files/logo.png" alt="Auto-Check" width="64" height="64" sizes="64px" quality={100} loading="eager"/>
      <div><p className="eyebrow">AUTO-CHECK</p><h2>{t('让签到简单一点。', 'A simpler class routine.')}</h2></div>
    </div>
    <p className="checkout-subtitle">{t('选择你需要的服务。', 'Choose the service you need.')}</p>
  </>, [t]);

  useEffect(() => {
    if (selectedProduct !== 'notification') return;
    const timeout = window.setTimeout(() => {
      const card = checkoutCardRef.current;
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const orbRect = document.querySelector<HTMLElement>('.support-orb')?.getBoundingClientRect();
      const visibleBottom = orbRect && cardRect.right > orbRect.left && cardRect.left < orbRect.right ? orbRect.top - 16 : viewportHeight - 20;
      const scrollDistance = cardRect.bottom - visibleBottom;
      if (scrollDistance > 0) window.scrollBy({ top: scrollDistance, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [selectedProduct]);

  const checkoutPlan: PlanCode = selectedProduct === 'notification' ? notificationPlan : selectedProduct === 'extension' ? 'extension' : 'bundle';
  const cta = selectedProduct === 'bundle' ? t('购买完整体验包', 'Get complete bundle') : selectedProduct === 'extension' ? t('购买浏览器扩展', 'Buy browser extension') : purchaseText(locale, billingPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');

  function handleProductKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    for (let offset=1;offset<=products.length;offset++) {
      const nextIndex = (index + direction*offset + products.length) % products.length;
      if (!products[nextIndex].enabled) continue;
      setSelectedProduct(products[nextIndex].product);
      productRefs.current[nextIndex]?.focus();
      break;
    }
  }

  return <div ref={checkoutCardRef} className="hero-checkout">
    <div className="checkout-card-content">
      {heading}
      <div className="mini-plans" role="radiogroup" aria-label={t('选择产品', 'Choose a product')}>
        {products.map(({product,metadata,enabled},index)=> {
          const isSelected=selectedProduct===product;
          const isBundle=product==='bundle';
          const isNotification=product==='notification';
          const discounted=amount(metadata.id)<metadata.amount;
          const choice=<button ref={node=>{productRefs.current[index]=node;}} type="button" role="radio" disabled={!enabled} aria-checked={isSelected} tabIndex={isSelected&&enabled?0:-1}
            className={`mini-plan ${isBundle?'mini-bundle-plan':isNotification?'mini-notification-choice':''} ${isSelected?'selected':''}`} style={{width:'100%'}}
            onClick={()=>setSelectedProduct(product)} onKeyDown={event=>handleProductKeyDown(event,index)}>
            <span className="selection-radio" aria-hidden="true"/>
            <span className={isBundle?'mini-bundle-copy':undefined}><strong>{metadata.name[locale]}</strong><small>{metadata.description[locale]}</small></span>
            {isNotification ? !isSelected&&lowestNotificationPrice&&<b className="mini-from-price">{purchaseText(locale,'from')} {price(lowestNotificationPrice.amount)} {purchaseText(locale,lowestNotificationPrice.period==='yearly'?'perYear':'perSemester')}</b> : <span className={isBundle?'mini-bundle-price':undefined} style={{marginLeft:'auto'}}>
              {isBundle&&discounted&&<span>{t('限时特惠','LIMITED-TIME OFFER')}</span>}
              {discounted&&<del className="mini-bundle-original-price">{price(metadata.amount)}</del>}
              <b>{price(amount(metadata.id))}</b>
            </span>}
          </button>;
          if(isBundle)return <div key={product} className="mini-bundle-group">{choice}<BundleUrgency expanded={isSelected}/></div>;
          if(isNotification)return <div key={product} className={`mini-notification-option ${isSelected?'selected':''}`}>{choice}
            <div className={`mini-notification-details-expand ${isSelected?'is-open':''}`} aria-hidden={!isSelected}>
              <div className="mini-notification-details" inert={!isSelected}>
                <BillingSegmentedControl id="hero-notification" value={billingPlan} onChange={setBillingPlan}/>
                <NotificationPriceDisplay id="hero-notification-price" context="hero" billingPlan={billingPlan}/>
              </div>
            </div>
          </div>;
          return <div key={product}>{choice}</div>;
        })}
      </div>
    </div>
    <div className="hero-checkout-footer">{selectedProduct?<BuyButton plan={checkoutPlan}>{cta}</BuyButton>:<p>{t('暂无可用方案','No packages available')}</p>}</div>
  </div>;
}
