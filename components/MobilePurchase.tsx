'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import type { PlanCode } from '@/lib/plans';
import { notificationPlanCodes } from '@/lib/plans';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { mobileMoney } from '@/lib/mobile-pricing';
import { useLocale } from './LocaleProvider';
import { useNotificationBilling, useOfferActive, useSiteConfig } from './SiteConfigProvider';
import { MobileBundlePrice, useMobilePricing } from './MobileBundleCard';
import { BillingSegmentedControl } from './BillingSegmentedControl';
import { BuyButton } from './BuyButton';

type Product = 'bundle' | 'extension' | 'notification';
const ActionContext = createContext<{ current: ((origin?: HTMLElement) => void) | null }>({ current: null });

export function MobilePurchaseBoundary({ children }: { children: ReactNode }) {
  const action = useRef<((origin?: HTMLElement) => void) | null>(null);
  return <ActionContext.Provider value={action}>{children}</ActionContext.Provider>;
}

export function MobileFinalPurchase() {
  const action = useContext(ActionContext);
  const { t } = useLocale();
  return <button type="button" className="mobile-only mobile-final-purchase button primary" onClick={event => action.current?.(event.currentTarget)}>{t('继续购买所选方案', 'Get your selected plan')} <span aria-hidden>↗</span></button>;
}

export function MobilePurchase() {
  const { t, locale } = useLocale();
  const { config, preview } = useSiteConfig();
  const pricing = useMobilePricing();
  const active = useOfferActive();
  const { billingPlan, setBillingPlan } = useNotificationBilling();
  const [selected, setSelected] = useState<Product>('bundle');
  const [viewPlans, setViewPlans] = useState(false);
  const [sticky, setSticky] = useState(false);
  const action = useContext(ActionContext);
  const inlineRef = useRef<HTMLDivElement>(null);
  const buyRef = useRef<HTMLButtonElement>(null);
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const products = (['bundle', 'extension', 'notification'] as const).filter(product => product === 'notification'
    ? !!pricing.notification : config.packages.find(p => p.id === product)?.visible);
  const enabled = (product: Product) => product === 'notification'
    ? config.packages.some(p => p.visible && p.enabled && (p.id === 'mobile_notification' || p.id === 'mobile_notification_yearly'))
    : !!config.packages.find(p => p.id === product)?.enabled;
  const product = products.includes(selected) && enabled(selected) ? selected : products.find(enabled) ?? products[0];
  const plan: PlanCode = product === 'notification' ? notificationPlanCodes[billingPlan] : product ?? 'bundle';
  const metadata = config.packages.find(p => p.id === plan)!;
  const displayedMetadata = product === 'notification' && !viewPlans ? config.packages.find(p => p.id === pricing.notification?.id)! : metadata;
  const amount = packagePrice(config, plan, Date.parse(active ? config.offer.startsAt : config.offer.endsAt));
  const cta = product === 'bundle' ? `${t('购买完整体验包', 'Get complete bundle')} · ${mobileMoney(amount)}`
    : product === 'extension' ? `${t('购买扩展', 'Get extension')} · ${mobileMoney(amount)}`
    : `${t('开通手机通知', 'Get notifications')} · ${mobileMoney(amount)}`;
  const label = (value: Product) => value === 'bundle' ? t('完整体验', 'Complete') : value === 'extension' ? t('扩展', 'Extension') : t('手机通知', 'Mobile');
  const available = !preview && product !== 'extension' && purchaseAllowed(config, plan);

  function select(value: Product) { setSelected(value); }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowUp', 'End'].includes(event.key) ? -1 : 1;
    let next = event.key === 'Home' ? 0 : event.key === 'End' ? products.length - 1 : (index + direction + products.length) % products.length;
    for (let i = 0; i < products.length; i++, next = (next + direction + products.length) % products.length) {
      if (enabled(products[next])) { select(products[next]); radioRefs.current[next]?.focus(); break; }
    }
  }

  function requestPurchase(origin?: HTMLElement) {
    // Safari pointer activation may leave the body focused; preserve this entry point.
    origin?.focus({ preventScroll: true });
    if (product === 'notification' && !viewPlans) setViewPlans(true);
    else buyRef.current?.click();
    // Open the existing form immediately; scroll only to bring that form into reach.
    requestAnimationFrame(() => {
      if (!document.querySelector('.checkout-modal')) inlineRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }
  useEffect(() => { action.current = requestPurchase; return () => { action.current = null; }; });

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    if (!inlineRef.current || !('IntersectionObserver' in window)) return;
    let passed = false;
    const visible = new Set<Element>();
    const primary = inlineRef.current;
    const observer = new IntersectionObserver(entries => {
      if (!media.matches) { setSticky(false); return; }
      for (const entry of entries) {
        if (entry.target === primary) passed = !entry.isIntersecting && entry.boundingClientRect.bottom < (entry.rootBounds?.top ?? 64);
        else if (entry.isIntersecting) visible.add(entry.target); else visible.delete(entry.target);
      }
      setSticky(passed && visible.size === 0);
    }, { rootMargin: '-64px 0px 0px 0px', threshold: 0 });
    function observeTargets() {
      observer.disconnect(); visible.clear(); passed = false; setSticky(false);
      if (!media.matches) return;
      observer.observe(primary);
      document.querySelectorAll('.mobile-bundle-inline-cta, .final-cta').forEach(el => observer.observe(el));
    }
    observeTargets();
    const resize = observeTargets;
    media.addEventListener('change', resize);
    return () => { observer.disconnect(); media.removeEventListener('change', resize); setSticky(false); };
  }, []);

  if (!products.length) return <section className="mobile-only mobile-purchase shell"><p>{t('暂无可用方案', 'No packages available')}</p></section>;
  return <section className="mobile-only mobile-purchase shell" aria-labelledby="mobile-hero-title">
    <div className="mobile-hero"><p className="eyebrow">{t('新学期，安排好了。', 'YOUR NEXT SEMESTER, SORTED.')}</p><h1 id="mobile-hero-title">{t('让签到简单一点。', 'A simpler class routine.')}</h1><p>{t('选择你需要的服务。', 'Choose the service you need.')}</p></div>
    <div className="mobile-plan-selector" role="radiogroup" aria-label={t('选择产品', 'Choose a product')}>
      {products.map((value, index) => <button type="button" role="radio" key={value} ref={node => { radioRefs.current[index] = node; }} disabled={!enabled(value)} aria-checked={product === value} tabIndex={product === value ? 0 : -1} onClick={() => select(value)} onKeyDown={event => keyDown(event, index)}>{label(value)}{product === value && <span aria-hidden>✓</span>}</button>)}
    </div>
    <div className="mobile-purchase-panel">
      <div className="mobile-panel-heading"><h2>{product === 'bundle' ? t('完整体验包', 'Complete Bundle') : product === 'extension' ? t('浏览器扩展', 'Browser Extension') : t('手机通知服务', 'Mobile Notifications')}</h2>{product === 'bundle' && <span className="mobile-value-badge">{t('超值之选', 'BEST VALUE')}</span>}</div>
      <p className="mobile-plan-subtitle">{product === 'bundle' ? metadata.description[locale] : product === 'extension' ? t('一次买断，持续使用', 'One-time purchase') : t('支持 iPhone 和 Android 通知', 'For iPhone + Android notifications')}</p>
      {product === 'bundle' ? <MobileBundlePrice /> : <div className="mobile-individual-price"><div className="mobile-price-line">{product === 'notification' && !viewPlans && <span>{t('低至', 'From')} </span>}<strong>{mobileMoney(product === 'notification' && !viewPlans ? pricing.notification!.amount : amount)}</strong></div>{product === 'notification' && <p className="mobile-price-caption">/ {(!viewPlans ? pricing.notification!.id === 'mobile_notification_yearly' : billingPlan === 'yearly') ? t('年', 'year') : t('学期', 'semester')}</p>}</div>}
      {product === 'notification' && viewPlans && <div className="mobile-billing-plans"><BillingSegmentedControl id="mobile-notification" value={billingPlan} onChange={setBillingPlan} /><p id="mobile-notification-price" role="tabpanel" aria-labelledby={`mobile-notification-${billingPlan}`} className="mobile-plan-subtitle">{t('手机通知为扩展附加服务，需要已有扩展。', 'Notifications are an add-on. An existing extension is required.')}</p></div>}
      <ul className="mobile-benefits">{product === 'bundle' ? <><li>{t('包含 Chrome 扩展', 'Chrome extension included')}</li><li>{t('包含手机通知', 'Mobile alerts included')}</li></> : product === 'extension' ? <><li>{t('导入课表，管理课程任务', 'Import your timetable and class tasks')}</li><li>{t('二维码与 Microsoft Forms 支持', 'QR & Microsoft Forms support')}</li></> : <><li>{t('实时签到状态提醒', 'Real-time status alerts')}</li><li>{t('独立手机通知密钥', 'Your own notification key')}</li></>}</ul>
      <div className="mobile-inline-cta" ref={inlineRef}>{product === 'notification' && !viewPlans ? <button type="button" className="button primary" onClick={() => setViewPlans(true)}>{t('查看通知方案', 'View notification plans')} <span aria-hidden>↗</span></button> : <BuyButton key={plan} plan={plan} triggerRef={buyRef}>{cta}</BuyButton>}</div>
      <details className="mobile-included"><summary>{t('查看全部包含内容', 'View everything included')}</summary><ul>{displayedMetadata.features.map((feature, index) => <li key={index}>{feature[locale]}</li>)}</ul></details>
    </div>
    <div className="mobile-sticky-purchase" hidden={!sticky} aria-label={t('快捷购买', 'Quick purchase')}>
      <div><strong>{mobileMoney(product === 'notification' && !viewPlans ? pricing.notification!.amount : amount)}</strong><small>{product === 'bundle' ? pricing.bundle.discounted ? t('首发价格', 'Launch price') : t('完整体验包', 'Complete bundle') : product === 'notification' ? t('手机通知', 'Mobile notifications') : t('一次买断', 'One-time')}</small></div>
      <button type="button" className="button primary" disabled={!(product === 'notification' && !viewPlans) && !available} onClick={event => requestPurchase(event.currentTarget)}>{product === 'bundle' ? t('购买体验包', 'Get bundle') : product === 'extension' ? t('购买扩展', 'Get extension') : t('继续', 'Continue')} <span aria-hidden>↗</span></button>
    </div>
  </section>;
}
