'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { m, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, CircleHelp, LoaderCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useLocale } from './LocaleProvider';
import { getOrderPlanDisplay, isNotificationPlan, type OrderPlanCode } from '@/lib/plans';

const ReceiptTicket = dynamic(() => import('./receipt/ReceiptTicket').then(module => module.ReceiptTicket), {
  loading: () => <div className="receipt-loading" role="status">Loading your ticket…</div>,
});

type ConfirmedReceipt = { reference: string; plan: OrderPlanCode; amount: number; maskedEmail: string; paidAt: string; paymentProvider: 'hitpay' | 'stripe' };

export type PaymentReturnStatus = 'success' | 'processing' | 'pending' | 'not_paid' | 'unverified' | 'unavailable';

export function PaymentReturn({ status, downloadExtension = false, licenseKey, licensePlan, deliveryUnavailable = false, receipt }: {
  status: PaymentReturnStatus;
  downloadExtension?: boolean;
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
  const checking = ['pending', 'processing', 'unavailable'].includes(status);
  const receiptPlan = receipt ? getOrderPlanDisplay(receipt.plan, locale) : null;
  const includedItems = !receipt || !receiptPlan ? [] : receipt.plan === 'bundle'
    ? [t('课程签到浏览器扩展 · 一次买断', 'Class check-in browser extension · one-time'), t('手机通知服务 · 首学期已包含', 'Mobile notifications · first semester included')]
    : isNotificationPlan(receipt.plan)
      ? [receiptPlan.period ? `${receiptPlan.name} · ${receiptPlan.period}` : receiptPlan.name]
      : [t('Chrome 扩展 ZIP 安装包', 'Chrome extension ZIP package')];

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!checking) return;
    const interval = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(interval);
  }, [checking, router]);

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
    ? deliveryUnavailable
      ? t('付款已确认，但许可证暂时无法显示。请联系支持。', 'Your payment is confirmed, but the license could not be displayed. Please contact support.')
      : t('付款已确认。', 'Your payment is confirmed.')
    : status === 'processing'
      ? t('付款已确认，正在准备您的订单。', 'Your payment is confirmed and your order is being prepared.')
      : status === 'pending'
        ? t('我们正在等待支付服务的安全付款确认。请勿重复付款。', 'We are waiting for secure confirmation from the payment provider. Please do not pay again.')
        : status === 'not_paid'
          ? t('此订单未显示为已付款。如您已被扣款，请联系支持。', 'This order is not marked as paid. Contact support if you were charged.')
          : t('目前无法确认此付款。如您已付款，请联系支持，勿重复付款。', 'We could not confirm this payment yet. If you have paid, contact support rather than paying again.');

  function getDownloadUrl() {
    return new URL('/downloads/auto-check-extension.zip', window.location.origin).href;
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
        {status === 'success' && receipt && <div className="mx-auto mb-8 w-full max-w-xl text-left">
          <ReceiptTicket order={{ reference: receipt.reference, plan: receipt.plan, amount: receipt.amount, paidAt: receipt.paidAt }}
            includedItems={includedItems} error="" onOpenSupport={`/support?reference=${encodeURIComponent(receipt.reference)}`}
            onRefresh={() => router.refresh()} refreshing={false} localTest={false}
            paymentLabel={receipt.paymentProvider === 'hitpay' ? t('HitPay 沙盒', 'HitPay sandbox') : 'Stripe'}
            venue={receipt.paymentProvider === 'hitpay' ? t('HitPay 沙盒付款', 'HITPAY SANDBOX PAYMENT') : t('Stripe 付款', 'STRIPE PAYMENT')}
            maskedEmail={receipt.maskedEmail} />
        </div>}
        {licenseKey && status === 'success' && <div className="mb-6 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-5 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/75">
            {licensePlan === 'yearly' ? t('年度手机通知许可证密钥', 'Yearly notification license key') : t('学期手机通知许可证密钥', 'Semester notification license key')}
          </p>
          <code className="mt-3 block select-all break-all rounded-lg bg-black/30 px-4 py-3 font-mono text-lg font-semibold leading-7 text-white" aria-label={t('许可证密钥', 'License key')}>
            {licenseKey}
          </code>
        </div>}
        {downloadExtension && status === 'success' && <div className="mt-6 flex flex-col items-center gap-3">
          <a href="/downloads/auto-check-extension.zip" download className="inline-flex min-h-14 items-center justify-center rounded-full bg-emerald-300 px-8 text-base font-bold text-[#07130e] shadow-lg shadow-emerald-950/40 transition-colors hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-200">
            {t('下载扩展程序（.zip）', 'Download Extension (.zip)')}
          </a>
          <button type="button" onClick={copyDownloadLink} className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/20 bg-white/5 px-6 text-sm font-semibold text-white/85 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            {t('复制下载链接', 'Copy Download Link')}
          </button>
          <p className="max-w-sm text-xs leading-5 text-white/50">
            {t('注意：如果您正在使用电子钱包应用（例如 TNG）且下载没有开始，请复制链接并在 Chrome 或 Safari 中打开。', 'Note: If you are inside an e-wallet app (like TNG) and the download doesn\'t start, please copy the link and open it in Chrome or Safari.')}
          </p>
          {copyResult && <div className="max-w-sm text-xs text-white/70" role="status" aria-live="polite">
            {copyResult === 'copied'
              ? t('链接已复制。', 'Download link copied.')
              : <>
                <span>{t('无法自动复制，请长按此链接并选择复制：', 'Could not copy automatically. Press and hold this link to copy it:')}</span>
                <code className="mt-2 block select-all break-all rounded-lg bg-black/30 px-3 py-2 text-left text-emerald-100">
                    {getDownloadUrl()}
                </code>
              </>}
          </div>}
        </div>}
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#111317] transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          {t('立即返回首页', 'Return to homepage now')}<ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        {(status !== 'success' || deliveryUnavailable) && <p className="mt-5 text-sm"><Link href="/support" className="text-white/60 underline underline-offset-4 hover:text-white">{t('联系支持', 'Contact support')}</Link></p>}
      </m.div>
    </section>
  );
}
