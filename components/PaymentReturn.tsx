'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, CircleHelp, LoaderCircle } from 'lucide-react';
import { useLocale } from './LocaleProvider';

export type PaymentReturnStatus = 'success' | 'processing' | 'pending' | 'not_paid' | 'unverified' | 'unavailable';

export function PaymentReturn({ status }: { status: PaymentReturnStatus }) {
  const router = useRouter();
  const { t } = useLocale();
  const reducedMotion = useReducedMotion();
  const [countdown, setCountdown] = useState(5);
  const navigationStarted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmed = status === 'success' || status === 'processing';
  const checking = countdown > 0 && ['pending', 'processing', 'unavailable'].includes(status);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, 5 - Math.floor((Date.now() - startedAt) / 1000));
      setCountdown(remaining);
      if (remaining === 0) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!checking) return;
    const interval = window.setInterval(() => router.refresh(), 1000);
    return () => window.clearInterval(interval);
  }, [checking, router]);

  useEffect(() => {
    if (countdown !== 0 || navigationStarted.current) return;
    navigationStarted.current = true;
    router.push('/');
  }, [countdown, router]);

  const title = status === 'success'
    ? t('付款成功！', 'Payment Successful!')
    : status === 'processing'
      ? t('已收到付款', 'Payment received')
      : status === 'pending'
        ? t('正在确认付款…', 'Confirming your payment...')
        : status === 'not_paid'
          ? t('付款未完成', 'Payment is not complete')
          : t('付款确认', 'Payment confirmation');

  const description = status === 'success'
    ? t('付款已确认，您的许可证已签发。', 'Your payment is confirmed and your license has been issued.')
    : status === 'processing'
      ? t('付款已确认，您的许可证正在准备中。如需帮助，请联系支持。', 'Your payment is confirmed. Your license is being prepared. Contact support if you need help.')
      : status === 'pending'
        ? t('我们正在等待 HitPay 的安全付款确认。请勿重复付款。', 'We are waiting for secure payment confirmation from HitPay. Please do not pay again.')
        : status === 'not_paid'
          ? t('此订单未显示为已付款。如您已被扣款，请联系支持。', 'This order is not marked as paid. Contact support if you were charged.')
          : t('目前无法确认此付款。如您已付款，请联系支持，勿重复付款。', 'We could not confirm this payment yet. If you have paid, contact support rather than paying again.');

  return (
    <section className="grid min-h-[100dvh] place-items-center bg-[#080809] px-2 py-16 text-white sm:px-6" aria-labelledby="payment-return-title">
      <m.div
        initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#111317] px-6 py-12 text-center shadow-2xl sm:px-10"
      >
        <m.div
          key={confirmed ? 'confirmed' : 'waiting'}
          initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22 }}
          className={`mx-auto mb-8 flex size-24 items-center justify-center rounded-full border ${confirmed ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-white/5 text-white/70'}`}
          aria-hidden="true"
        >
          {confirmed ? <Check className="size-12" strokeWidth={2} />
            : checking ? <LoaderCircle className="size-10 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
              : <CircleHelp className="size-10" strokeWidth={1.5} />}
        </m.div>
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-white/45">AUTO-CHECK</p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 ref={heading} id="payment-return-title" tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>
        </div>
        <div className="my-8 h-px bg-white/10" aria-hidden="true" />
        <p className="text-sm tabular-nums text-white/50" aria-live="polite" aria-atomic="true">
          {t(`${countdown} 秒后返回首页…`, `Returning to homepage in ${countdown}s...`)}
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111317] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          {t('立即返回首页', 'Return to homepage now')}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        {status !== 'success' && <p className="mt-5 text-sm"><Link href="/support" className="text-white/60 underline underline-offset-4 hover:text-white">{t('联系支持', 'Contact support')}</Link></p>}
      </m.div>
    </section>
  );
}
