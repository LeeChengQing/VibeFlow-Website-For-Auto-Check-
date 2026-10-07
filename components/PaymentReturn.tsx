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

export function PaymentReturn({ status, downloadExtension = false, downloadUrl, licenseKey, licensePlan, deliveryUnavailable = false, receipt, orderAccessToken }: {
  status: PaymentReturnStatus;
  downloadExtension?: boolean;
  downloadUrl?: string;
  licenseKey?: string;
  licensePlan?: 'semester' | 'yearly';
  deliveryUnavailable?: boolean;
  receipt?: ConfirmedReceipt;
  orderAccessToken?: string;
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
  const [credentialCopyResult, setCredentialCopyResult] = useState<'token_copied' | 'url_copied' | 'failed' | null>(null);

  function downloadCredential() {
    if (!orderAccessToken) return;
    const content = [
      '========================================',
      '       AUTO-CHECK 订单凭证 / ORDER CREDENTIAL',
      '========================================',
      '',
      `订单编号 (Order Reference): ${receipt?.reference || 'N/A'}`,
      `付款时间 (Paid At): ${receipt?.paidAt || new Date().toISOString()}`,
      `购买套餐 (Plan): ${receipt?.plan || 'N/A'}`,
      licenseKey ? `许可证密钥 (License Key): ${licenseKey}` : '',
      '',
      '----------------------------------------',
      `凭证代码 (Access Token): ${orderAccessToken}`,
      `在线提取链接 (Access URL): ${typeof window !== 'undefined' ? `${window.location.origin}/order/${orderAccessToken}` : `/order/${orderAccessToken}`}`,
      '----------------------------------------',
      '',
      '【重要提示 / Notice】',
      '本平台运行于零成本模式，未配置付费企业发信域名，通知邮件可能存在延迟或被校园网拦截进垃圾箱。',
      '请妥善保管本凭证文件或截图。您可凭此凭证代码随时在官网「找回页 (/recover)」或上方链接重新提取卡密与下载链接。',
      '',
      '如需帮助请访问: /support',
      '========================================',
    ].filter(Boolean).join('\r\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auto-check-credential-${receipt?.reference || 'order'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function copyToken() {
    if (!orderAccessToken) return;
    try {
      await navigator.clipboard.writeText(orderAccessToken);
      setCredentialCopyResult('token_copied');
    } catch {
      setCredentialCopyResult('failed');
    }
  }

  async function copyOrderUrl() {
    if (!orderAccessToken || typeof window === 'undefined') return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/order/${orderAccessToken}`);
      setCredentialCopyResult('url_copied');
    } catch {
      setCredentialCopyResult('failed');
    }
  }

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
        {status === 'success' && orderAccessToken && (
          <div className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-left text-amber-200">
            <div className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">⚠️</span>
              <div className="space-y-1 text-xs leading-relaxed text-amber-200/90">
                <p className="font-semibold text-amber-100">
                  {t('零成本模式提示：请务必保存订单凭证', 'Zero-Cost Delivery Notice: Please save your credential')}
                </p>
                <p>
                  {t(
                    '为节省运营成本，系统未配置付费发信域名，邮件可能延迟或被学校邮箱拦截进入垃圾箱。请务必保存此凭证文件或截图，凭此凭证在「找回页」可随时提取卡密。',
                    'To keep costs zero, no paid email domain is configured. Emails may be delayed or filtered into spam by school mailboxes. Please save this credential file or screenshot to recover your license key anytime.'
                  )}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs text-white/90">
              <div className="text-[11px] uppercase tracking-wider text-white/50">{t('凭证代码 / ACCESS TOKEN', 'CREDENTIAL / ACCESS TOKEN')}</div>
              <div className="mt-1 break-all select-all font-semibold text-emerald-400">{orderAccessToken}</div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadCredential}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-400 px-4 text-xs font-bold text-black transition-colors hover:bg-amber-300"
              >
                {t('下载凭证文件 (.txt)', 'Download Credential (.txt)')}
              </button>
              <button
                type="button"
                onClick={copyToken}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10"
              >
                {t('复制凭证代码', 'Copy Credential Token')}
              </button>
              <button
                type="button"
                onClick={copyOrderUrl}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 transition-colors hover:bg-white/10"
              >
                {t('复制提取链接', 'Copy Order Link')}
              </button>
            </div>
            {credentialCopyResult && (
              <p className="mt-2 text-xs text-emerald-300" role="status">
                {credentialCopyResult === 'token_copied' && t('凭证代码已复制。', 'Credential token copied.')}
                {credentialCopyResult === 'url_copied' && t('提取链接已复制。', 'Order URL copied.')}
                {credentialCopyResult === 'failed' && t('复制失败，请手动选取上方代码。', 'Copy failed. Please select the code above manually.')}
              </p>
            )}
          </div>
        )}
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
