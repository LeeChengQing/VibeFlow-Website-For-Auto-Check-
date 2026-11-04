'use client';

import { useRef, type ReactNode, type Ref } from 'react';
import { useRouter } from 'next/navigation';
import { gsap } from 'gsap';
import type { PlanCode } from '@/lib/plans';
import { purchaseAllowed } from '@/lib/site-config';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';

export function BuyButton({ plan, children, className = 'button primary', triggerRef }: {
  plan: PlanCode; children: ReactNode; className?: string; triggerRef?: Ref<HTMLButtonElement>;
}) {
  const router = useRouter();
  const { t } = useLocale();
  const { config, preview, providers } = useSiteConfig();
  const navigating = useRef(false);
  const available = !preview && purchaseAllowed(config, plan) && providers.length > 0;
  function navigate() {
    if (navigating.current) return;
    navigating.current = true;
    const push = () => { router.push('/checkout?plan=' + plan); navigating.current = false; };
    const main = document.getElementById('main');
    // Keep the current screen visible while the mobile checkout route loads.
    // Fading #main to zero exposes a blank black frame on small viewports.
    const mobileLayout = window.matchMedia('(max-width: 900px)').matches;
    if (main && !mobileLayout && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.to(main, { opacity: 0, duration: 0.2, onComplete: push });
    } else push();
  }
  return <div className="buy-action"><button ref={triggerRef} type="button" className={className}
    disabled={!available} onClick={navigate}
    title={!available ? preview ? t('预览模式无法结账', 'Checkout is disabled in preview') : t('此方案暂不可购买', 'This package is currently unavailable') : undefined}>
    {children}<span aria-hidden="true">↗</span>
  </button></div>;
}
