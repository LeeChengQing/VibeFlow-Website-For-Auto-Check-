'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CircleHelp, LoaderCircle } from 'lucide-react';
import { useLocale } from './LocaleProvider';
import { PaymentFailure } from './PaymentFailure';
import type { PaymentReturnStatus } from './PaymentReturn';

export function MinimalPaymentReturn({ status }: { status: PaymentReturnStatus }) {
  const router = useRouter();
  const { t } = useLocale();
  const checking = status === 'processing';
  const paid = status === 'success';

  useEffect(() => {
    if (!checking) return;
    const interval = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(interval);
  }, [checking, router]);

  if (!paid && !checking) return <PaymentFailure compact />;

  function closeOrGoBack() {
    window.close();
    window.setTimeout(() => {
      if (!window.closed) {
        if (window.history.length > 1) window.history.back();
        else window.location.replace('/');
      }
    }, 150);
  }

  return <div data-minimal-payment-return="true" className="grid min-h-[100dvh] place-items-center bg-[#080809] px-5 text-white">
    <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#111317] px-7 py-10 text-center shadow-2xl" aria-live="polite">
      <div className={`mx-auto mb-6 grid size-20 place-items-center rounded-full border ${paid ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-white/5 text-white/70'}`} aria-hidden="true">
        {paid ? <Check className="size-10" strokeWidth={2} />
          : checking ? <LoaderCircle className="size-9 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
            : <CircleHelp className="size-9" strokeWidth={1.5} />}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        {paid ? t('付款成功', 'Payment Successful')
          : t('已收到付款', 'Payment received')}
      </h1>
      {checking && <p className="mt-4 text-base leading-7 text-white/70">
        {t('付款已确认，正在准备您的订单。', 'Your payment is confirmed and your order is being prepared.')}
      </p>}
      <button type="button" onClick={closeOrGoBack} className="mt-8 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white px-6 text-sm font-semibold text-[#111317] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
        {t('关闭 / 返回应用', 'Close / Back to App')}
      </button>
    </section>
  </div>;
}
