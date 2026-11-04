'use client';

import { useTransition, type ReactNode, type Ref } from 'react';
import { useRouter } from 'next/navigation';
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
  const [navigating, startTransition] = useTransition();
  const available = !preview && purchaseAllowed(config, plan) && providers.length > 0;
  function navigate() {
    if (navigating) return;
    startTransition(() => router.push('/checkout?plan=' + plan));
  }
  return <div className="buy-action"><button ref={triggerRef} type="button" className={className}
    disabled={!available || navigating} aria-busy={navigating} onClick={navigate}
    title={!available ? preview ? t('预览模式无法结账', 'Checkout is disabled in preview') : t('此方案暂不可购买', 'This package is currently unavailable') : undefined}>
    {children}<span aria-hidden="true">↗</span>
  </button></div>;
}
