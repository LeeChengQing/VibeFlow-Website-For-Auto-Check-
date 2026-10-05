'use client';

import { useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RotateCw, TriangleAlert, X } from 'lucide-react';
import { useLocale } from './LocaleProvider';
import styles from './PaymentFailure.module.css';

export function PaymentFailure({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const { t } = useLocale();
  const heading = useRef<HTMLHeadingElement>(null);
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  return <section data-payment-failure="true" data-minimal-payment-return={compact || undefined}
    className="grid min-h-[100dvh] place-items-center bg-[#080809] px-5 py-10 text-white"
    aria-labelledby="payment-failure-title">
    <div className={`w-full rounded-3xl border border-white/10 bg-[#111317] px-6 py-10 text-center ${compact ? 'max-w-sm' : 'max-w-lg sm:px-10 sm:py-12'}`}>
      <div className="mx-auto mb-6 grid size-20 place-items-center rounded-full border border-rose-400/20 bg-rose-400/15 text-rose-300" aria-hidden="true">
        <X className="size-10" strokeWidth={2.5} />
      </div>
      <p className={`${styles.brand} text-xs font-medium tracking-[0.2em] text-white/60`}>AUTO-CHECK</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h1 ref={heading} id="payment-failure-title" tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl">
          {t('付款失败', 'Payment failed')}
        </h1>
        <p className={`${styles.description} text-white/70`}>
          {t('付款已取消、失败，或尚未通过验证。', 'Your payment was cancelled, failed, or could not be verified.')}
        </p>
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-left text-amber-200">
        <TriangleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
        <p className={styles.warningText}>
          {t('若已扣款，请重新检查付款状态或联系支持，勿重复付款。', 'If you were charged, check payment status or contact support. Please do not pay again.')}
        </p>
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <button type="button" disabled={refreshing} aria-busy={refreshing}
          onClick={() => startTransition(() => router.refresh())}
          className={`${styles.recheck} inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-full px-5 py-3 transition-opacity hover:opacity-85`}>
          <RotateCw className="size-5 shrink-0" aria-hidden="true" />
          {refreshing ? t('正在重新检查…', 'Checking payment status…') : t('重新检查付款状态', 'Check payment status')}
        </button>
        <Link href="/" className={`${styles.home} inline-flex min-h-14 w-full items-center justify-center rounded-full border border-white/30 px-5 py-3 transition-colors hover:bg-white/5`}>
          {t('返回首页', 'Return home')}
        </Link>
      </div>
      <p className={styles.support}>
        <Link href="/support" className={styles.supportLink}>
          {t('联系支持', 'Contact support')}
        </Link>
      </p>
    </div>
  </section>;
}
