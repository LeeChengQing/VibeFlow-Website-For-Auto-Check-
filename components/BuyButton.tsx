'use client';

import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';
import { purchaseAllowed } from '@/lib/site-config';
import type { PlanCode } from '@/lib/plans';

const hitPayPlans = {
  bundle: 'bundle',
  mobile_notification: 'semester',
  mobile_notification_yearly: 'yearly',
} as const;

export function BuyButton({
  plan, children, className = 'button primary',
}: { plan: PlanCode; children: ReactNode; className?: string }) {
  const { t } = useLocale();
  const { config, preview } = useSiteConfig();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const formId = useId();
  const emailId = `${formId}-email`;
  const errorId = `${formId}-error`;
  const canonicalPlan = plan === 'extension' ? null : hitPayPlans[plan];
  const available = !preview && !!canonicalPlan && purchaseAllowed(config, plan);
  const unavailableMessage = preview
    ? t('预览模式无法结账', 'Checkout is disabled in preview')
    : !canonicalPlan
      ? t('扩展单独购买暂不可用，请选择完整体验包。', 'Standalone extension checkout is unavailable. Choose the complete bundle.')
      : t('此方案暂不可购买', 'This package is currently unavailable');

  function checkoutError(code: unknown) {
    if (code === 'INVALID_EMAIL' || code === 'INVALID_CHECKOUT') {
      return t('请输入有效的邮箱地址。', 'Please enter a valid email address.');
    }
    if (code === 'CHECKOUT_UNAVAILABLE' || code === 'HITPAY_NOT_CONFIGURED' || code === 'INVALID_PRICE') {
      return t('结账暂不可用，请稍后再试。', 'Checkout is currently unavailable. Please try again later.');
    }
    return t('暂时无法打开付款页面，请稍后重试。', 'Could not open checkout. Please try again later.');
  }

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    let redirecting = false;

    try {
      const response = await fetch('/api/hitpay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyer_email: email.trim().toLowerCase(), plan: canonicalPlan }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(checkoutError(result?.error));
        return;
      }
      if (typeof result?.url !== 'string' || typeof result.reference !== 'string' || !result.reference) {
        throw new Error('INVALID_CHECKOUT_RESPONSE');
      }
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'securecheckout.sandbox.hit-pay.com' ||
          url.port || url.username || url.password) throw new Error('INVALID_CHECKOUT_URL');
      window.location.assign(result.url);
      redirecting = true;
    } catch {
      setError(checkoutError(undefined));
    } finally {
      // Keep the form disabled while the browser leaves for hosted checkout.
      if (!redirecting) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="buy-action">
      {open && available ? (
        <form id={formId} className="form" onSubmit={buy} aria-busy={busy}>
          <label htmlFor={emailId}>
            {t('接收邮箱', 'Delivery email')}
            <input
              id={emailId} name="email" type="email" autoComplete="email"
              required maxLength={254} autoFocus value={email} disabled={busy}
              onChange={event => { setEmail(event.target.value); setError(''); }}
              aria-describedby={error ? errorId : undefined}
              placeholder="you@example.com"
            />
          </label>
          {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
          <button type="submit" className={className} disabled={busy}>
            {busy ? t('正在打开…', 'Opening…') : t('前往 HitPay 付款', 'Continue to HitPay')}
            <span aria-hidden="true">↗</span>
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => { setOpen(false); setError(''); }}>
            {t('取消', 'Cancel')}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button" className={className} disabled={busy || !available}
            onClick={() => { setError(''); setOpen(true); }}
            title={!available ? unavailableMessage : undefined}
            aria-describedby={!available && !canonicalPlan ? errorId : undefined}
          >
            {children}<span aria-hidden="true">↗</span>
          </button>
          {!canonicalPlan && <p id={errorId} className="notice">{unavailableMessage}</p>}
        </>
      )}
    </div>
  );
}
