'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, CircleHelp, LoaderCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale } from './LocaleProvider';
import { PaymentFailure } from './PaymentFailure';
import { getOrderPlanDisplay, isNotificationPlan, type OrderPlanCode } from '@/lib/plans';

const ReceiptTicket = dynamic(() => import('./receipt/ReceiptTicket').then(module => module.ReceiptTicket), {
  loading: () => <div className="receipt-loading" role="status">Loading your ticket…</div>,
});

type ConfirmedReceipt = { reference: string; plan: OrderPlanCode; amount: number; maskedEmail: string; paidAt: string; paymentProvider: 'hitpay' | 'stripe' | 'toyyibpay' };

export type PaymentReturnStatus = 'success' | 'processing' | 'pending' | 'not_paid' | 'unverified' | 'unavailable';

export function PaymentReturn({ status, downloadExtension = false, downloadUrl, licenseKey, licensePlan, deliveryUnavailable = false, receipt }: {
  status: PaymentReturnStatus;
  downloadExtension?: boolean;
  downloadUrl?: string;
  licenseKey?: string;
  licensePlan?: 'semester' | 'yearly';
  deliveryUnavailable?: boolean;
  receipt?: ConfirmedReceipt;
}) {
  const router = useRouter();
  const { locale, t } = useLocale();
  const reducedMotion = useReducedMotion();
  const heading = useRef<HTMLHeadingElement>(null);
  const [copyResult, setCopyResult] = useState<'copied' | 'failed' | null>(null);
  const confirmed = status === 'success' || status === 'processing';
  const checking = status === 'processing';
  const receiptPlan = receipt ? getOrderPlanDisplay(receipt.plan, locale) : null;
  const includedItems = !receipt || !receiptPlan ? [] : receipt.plan === 'bundle'
    ? [t('课程签到浏览器扩展 · 一次买断', 'Class check-in browser extension · one-time'), t('手机通知服务 · 首学期已包含', 'Mobile notifications · first semester included')]
    : isNotificationPlan(receipt.plan)
      ? [receiptPlan.period ? `${receiptPlan.name} · ${receiptPlan.period}` : receiptPlan.name]
      : [t('Chrome 扩展 ZIP 安装包', 'Chrome extension ZIP package')];

  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!checking || pollingTimedOut) return;
    const startTime = Date.now();
    let timerId: any;

    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      let currentDelay = 2000;
      function poll() {
        const elapsed = Date.now() - startTime;
        if (elapsed >= 180000) {
          setPollingTimedOut(true);
          return;
        }
        router.refresh();
        currentDelay = Math.min(10000, Math.floor(currentDelay * 1.5));
        timerId = window.setTimeout(poll, currentDelay);
      }
      timerId = window.setTimeout(poll, currentDelay);
      return () => {
        if (timerId) window.clearTimeout(timerId);
      };
    } else if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
      timerId = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= 180000) {
          setPollingTimedOut(true);
          return;
        }
        router.refresh();
      }, 2000);
      return () => {
        if (timerId) window.clearInterval(timerId);
      };
    }
  }, [checking, pollingTimedOut, router]);

  // A pending order is not proof of payment, including after cancellation.
  // Keep its record unchanged so a delayed verified webhook can still fulfill it.
  if (!confirmed) return <PaymentFailure />;

  const title = status === 'success'
    ? t('付款成功！', 'Payment Successful!')
    : t('已收到付款', 'Payment received');

  const description = status === 'success'
    ? deliveryUnavailable
      ? t('付款已确认，但许可证暂时无法显示。请联系支持。', 'Your payment is confirmed, but the license could not be displayed. Please contact support.')
      : t('付款已确认。', 'Your payment is confirmed.')
    : pollingTimedOut
      ? t('订单正在后台加急履约中。许可证和下载链接将同步发送至您的邮箱，您可以随时关闭此页面。', 'Fulfillment is still in progress in the background. Your license key and download link will be delivered to your email. You may safely close this window.')
      : t('付款已确认，正在准备您的订单。', 'Your payment is confirmed and your order is being prepared.');

  function getDownloadUrl() {
    return new URL(downloadUrl || '/downloads/auto-check-extension.zip', window.location.origin).href;
  }

  async function copyDownloadLink() {
    const url = getDownloadUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopyResult('copied');
    } catch {
      setCopyResult('failed');
    }
  }

  const hasReceipt = status === 'success' && Boolean(receipt);
  const providerName = receipt?.paymentProvider === 'hitpay' ? t('HitPay 沙盒', 'HitPay sandbox')
    : receipt?.paymentProvider === 'toyyibpay' ? 'ToyyibPay' : 'Stripe';
  const providerVenue = receipt?.paymentProvider === 'hitpay' ? t('HitPay 沙盒付款', 'HITPAY SANDBOX PAYMENT')
    : receipt?.paymentProvider === 'toyyibpay' ? 'TOYYIBPAY' : t('Stripe 付款', 'STRIPE PAYMENT');
  const licenseError = deliveryUnavailable ? t('密钥暂时无法显示，请联系支持。', 'The license key is temporarily unavailable. Please contact support.') : '';

  return (
    <section className="grid min-h-[100dvh] place-items-center bg-[#080809] px-2 py-16 text-white sm:px-6" aria-labelledby="payment-return-title">
      <m.div
        initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25 }}
        className={`w-full rounded-3xl border border-white/10 bg-[#111317] shadow-2xl ${hasReceipt ? 'max-w-7xl grid grid-cols-1 gap-8 p-5 sm:p-8 lg:grid-cols-2 lg:items-center lg:gap-10 lg:p-10' : 'max-w-lg px-6 py-12 text-center sm:px-10'}`}
      >
        <div className={hasReceipt ? 'min-w-0 text-center lg:text-left' : ''}>
        <m.div
          key={confirmed ? 'confirmed' : 'waiting'}
          initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 22 }}
          className={`mx-auto mb-8 flex size-20 items-center justify-center rounded-full border ${confirmed ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/15 bg-white/5 text-white/70'} ${hasReceipt ? 'lg:mx-0' : ''}`}
          aria-hidden="true"
        >
          {confirmed ? <Check className="size-10" strokeWidth={2} />
            : checking ? <LoaderCircle className="size-9 animate-spin motion-reduce:animate-none" strokeWidth={1.5} />
              : <CircleHelp className="size-9" strokeWidth={1.5} />}
        </m.div>
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-white/45">AUTO-CHECK</p>
        <div role="status" aria-live="polite" aria-atomic="true">
          <h1 ref={heading} id="payment-return-title" tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl">{title}</h1>
          <p className="mt-4 text-sm leading-7 text-white/60">{description}</p>
        </div>
        {downloadExtension && status === 'success' && <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5 text-left">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-white/55">{t('扩展程序下载', 'Extension download')}</p>
          <div className="flex flex-col items-start gap-3">
            <a href={downloadUrl || '/downloads/auto-check-extension.zip'} download className="inline-flex min-h-14 items-center justify-center rounded-full bg-emerald-300 px-7 text-base font-bold text-[#07130e] shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200">
              {t('下载扩展程序（.zip）', 'Download Extension (.zip)')}
            </a>
            <button type="button" onClick={copyDownloadLink} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              {t('复制下载链接', 'Copy Download Link')}
            </button>
            {copyResult && <p className="break-all text-xs text-white/60" role="status">{copyResult === 'copied' ? t('链接已复制。', 'Download link copied.') : getDownloadUrl()}</p>}
          </div>
        </div>}
        {!checking && <Link href="/" className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111317] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          {t('立即返回首页', 'Return home')}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>}
        {(status !== 'success' || deliveryUnavailable) && <p className="mt-5 text-sm"><Link href="/support" className="text-white/60 underline underline-offset-4 hover:text-white">{t('联系支持', 'Contact support')}</Link></p>}
        </div>
        {hasReceipt && receipt && <aside className="mt-8 min-w-0 lg:mt-0">
          <ReceiptTicket order={{ reference: receipt.reference, plan: receipt.plan, amount: receipt.amount, paidAt: receipt.paidAt }}
            includedItems={includedItems} error={licenseError} onOpenSupport={`/support?reference=${encodeURIComponent(receipt.reference)}`}
            onRefresh={() => router.refresh()} refreshing={false} localTest={false}
            paymentLabel={providerName} venue={providerVenue} maskedEmail={receipt.maskedEmail}
            licenseKey={licenseKey} licensePlan={licensePlan} />
        </aside>}
      </m.div>
    </section>
  );
}
