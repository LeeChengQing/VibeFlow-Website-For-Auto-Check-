'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';
import { purchaseAllowed } from '@/lib/site-config';
import type { PlanCode } from '@/lib/plans';
import { isHitPaySandboxCheckoutURL } from '@/lib/hitpay-checkout-url';

const hitPayPlans = {
  bundle: 'bundle',
  extension: 'extension',
  mobile_notification: 'semester',
  mobile_notification_yearly: 'yearly',
} as const;

export function BuyButton({
  plan, children, className = 'button primary', triggerRef,
}: { plan: PlanCode; children: ReactNode; className?: string; triggerRef?: Ref<HTMLButtonElement> }) {
  const { t } = useLocale();
  const { config, preview } = useSiteConfig();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const formId = useId();
  const emailId = `${formId}-email`;
  const errorId = `${formId}-error`;
  const dialogTitleId = `${formId}-title`;
  const canonicalPlan = hitPayPlans[plan];
  const available = !preview && purchaseAllowed(config, plan);
  const unavailableMessage = preview
    ? t('预览模式无法结账', 'Checkout is disabled in preview')
    : t('此方案暂不可购买', 'This package is currently unavailable');

  useEffect(() => {
    if (!open || !available) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = returnFocusRef.current;
    document.body.style.overflow = 'hidden';
    emailInputRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting.current) {
        event.preventDefault();
        setOpen(false);
        setError('');
      }
      if (event.key === 'Tab') {
        const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), a[href], [tabindex="0"]') ?? [])];
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      // Let the shared floating controls restore a temporarily hidden sticky trigger first.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (previousFocus?.isConnected && !document.querySelector('[aria-modal=true], dialog[open]')) previousFocus.focus({ preventScroll: true });
      }));
    };
  }, [open, available]);

  function closeModal() {
    if (submitting.current) return;
    setOpen(false);
    setError('');
  }

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
      if (!isHitPaySandboxCheckoutURL(result.url)) throw new Error('INVALID_CHECKOUT_URL');
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
    <div className="buy-action" data-checkout-open={open && available ? '' : undefined}>
      <button
        ref={triggerRef} type="button" className={className} disabled={busy || !available}
        onClick={event => {
          returnFocusRef.current = !event.isTrusted && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : event.currentTarget;
          setError(''); setOpen(true);
        }}
        title={!available ? unavailableMessage : undefined}
      >
        {children}<span aria-hidden="true">↗</span>
      </button>

      {open && available && createPortal(
        <div
          className="checkout-modal fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
          onClick={event => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <div
            ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}
            className="checkout-modal-panel w-full max-w-md rounded-2xl border border-white/15 bg-[#111317] p-6 text-white shadow-2xl sm:p-8"
          >
            <form id={formId} className="form" onSubmit={buy} aria-busy={busy}>
              <h2 id={dialogTitleId} className="text-xl font-semibold">
                {t('完成购买', 'Complete your purchase')}
              </h2>
              <label htmlFor={emailId}>
                {t('接收邮箱', 'Delivery email')}
                <input
                  ref={emailInputRef}
                  id={emailId} name="email" type="email" autoComplete="email"
                  required maxLength={254} value={email} disabled={busy}
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
              <button type="button" className="button secondary" disabled={busy} onClick={closeModal}>
                {t('取消', 'Cancel')}
              </button>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
