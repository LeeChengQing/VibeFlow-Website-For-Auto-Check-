'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { m, useReducedMotion } from 'framer-motion';
import { LoaderCircle, LockKeyhole } from 'lucide-react';
import { Bouncy } from 'ldrs/react';
import Checkbox from '@mui/material/Checkbox';
import 'ldrs/react/Bouncy.css';
import { useLocale } from './LocaleProvider';
import { useSiteConfig } from './SiteConfigProvider';
import { purchaseAllowed, packagePrice } from '@/lib/site-config';
import { price } from '@/lib/plans';
import type { PlanCode } from '@/lib/plans';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { isPaymentCheckoutURL, paymentMethods, type PaymentMethod } from '@/lib/payment-checkout';
import { PaymentMethodSelector } from './PaymentMethodSelector';

const checkoutPlans = {
  bundle: 'bundle',
  extension: 'extension',
  mobile_notification: 'semester',
  mobile_notification_yearly: 'yearly',
} as const;

export function BuyButton({
  plan, children, className = 'button primary', triggerRef,
}: { plan: PlanCode; children: ReactNode; className?: string; triggerRef?: Ref<HTMLButtonElement> }) {
  const { t } = useLocale();
  const { config, preview, providers } = useSiteConfig();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [error, setError] = useState('');
  const [redirectCountdown, setRedirectCountdown] = useState(3);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const redirectAttempted = useRef(false);
  const submitting = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const formId = useId();
  const emailId = `${formId}-email`;
  const errorId = `${formId}-error`;
  const consentId = `${formId}-consent`;
  const dialogTitleId = `${formId}-title`;
  const canonicalPlan = checkoutPlans[plan];
  const selectedMethod = paymentMethods.find(method => method.id === paymentMethod)!;
  const available = !preview && purchaseAllowed(config, plan) && providers.length>0;
  const unavailableMessage = preview
    ? t('预览模式无法结账', 'Checkout is disabled in preview')
    : t('此方案暂不可购买', 'This package is currently unavailable');
  useEffect(()=>{if(providers.length&&!providers.includes(paymentMethod))setPaymentMethod(providers[0] as PaymentMethod);},[providers,paymentMethod]);

  useEffect(() => {
    if (!open || (!available && !isRedirecting)) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = returnFocusRef.current;
    document.body.style.overflow = 'hidden';
    if (isRedirecting) dialogRef.current?.focus();
    else emailInputRef.current?.focus();

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
  }, [open, available, isRedirecting]);

  useEffect(() => {
    if (!isRedirecting || !checkoutUrl) return;
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, 3 - Math.floor((Date.now() - startedAt) / 1000));
      setRedirectCountdown(remaining);
      if (remaining === 0) window.clearInterval(interval);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isRedirecting, checkoutUrl]);

  useEffect(() => {
    if (!isRedirecting || redirectCountdown !== 0 || !checkoutUrl || redirectAttempted.current) return;
    redirectAttempted.current = true;
    try {
      window.location.href = checkoutUrl;
    } catch {
      setIsRedirecting(false);
      setCheckoutUrl(null);
      submitting.current = false;
      setBusy(false);
      setError(t('暂时无法打开付款页面，请稍后重试。', 'Could not open checkout. Please try again later.'));
    }
  }, [isRedirecting, redirectCountdown, checkoutUrl, t]);

  useEffect(() => {
    // A browser Back navigation may restore the pre-redirect modal from bfcache.
    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return;
      redirectAttempted.current = false;
      submitting.current = false;
      setIsRedirecting(false);
      setCheckoutUrl(null);
      setRedirectCountdown(3);
      setBusy(false);
    }
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  function closeModal() {
    if (submitting.current) return;
    setOpen(false);
    setError('');
  }

  function checkoutError(code: unknown) {
    if(code==='USE_EXTENSION_FOR_PHONE')return t('请在插件的手机通知页面选择方案，付款后自动开通当前设备。','Choose your phone plan in the extension to activate notifications on that device.');
    if (code === 'TERMS_ACCEPTANCE_REQUIRED' || code === 'INVALID_TERMS_VERSION') {
      return t('请阅读并勾选同意服务条款与退款政策。', 'Please agree to the Terms of Service & Refund Policy.');
    }
    if (code === 'INVALID_EMAIL' || code === 'INVALID_CHECKOUT') {
      return t('请输入有效的邮箱地址。', 'Please enter a valid email address.');
    }
    if (code === 'CHECKOUT_UNAVAILABLE' || code === 'PROVIDER_NOT_CONFIGURED' || code === 'STRIPE_NOT_CONFIGURED' || code === 'TOYYIBPAY_NOT_CONFIGURED' || code === 'INVALID_PRICE') {
      return t('结账暂不可用，请稍后再试。', 'Checkout is currently unavailable. Please try again later.');
    }
    return t('暂时无法打开付款页面，请稍后重试。', 'Could not open checkout. Please try again later.');
  }

  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(canonicalPlan==='semester'||canonicalPlan==='yearly'){setError(checkoutError('USE_EXTENSION_FOR_PHONE'));return;}
    if (!available || !selectedMethod.enabled || submitting.current) return;
    if (!termsAccepted) {
      setError(checkoutError('TERMS_ACCEPTANCE_REQUIRED'));
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    let redirecting = false;

    try {
      const token=sessionStorage.getItem('auto-check-device-token');
      if(!providers.includes(paymentMethod)){setError(checkoutError('CHECKOUT_UNAVAILABLE'));return;}
      const response = await fetch(selectedMethod.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token?{Authorization:'Bearer '+token}:{}) },
        body: JSON.stringify({ buyer_email: email.trim().toLowerCase(), plan: canonicalPlan, terms_accepted: true, terms_version: CURRENT_TERMS_VERSION }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(checkoutError(result?.error));
        return;
      }
      if (!isPaymentCheckoutURL(result?.url, paymentMethod)) throw new Error('INVALID_CHECKOUT_URL');
      redirectAttempted.current = false;
      setCheckoutUrl(result.url);
      setRedirectCountdown(3);
      setIsRedirecting(true);
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
    <div className="buy-action" data-checkout-open={open && (available || isRedirecting) ? '' : undefined}>
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

      {open && (available || isRedirecting) && createPortal(
        <div
          className="checkout-modal fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
          onClick={event => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <div
            ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}
            className="checkout-modal-panel w-full max-w-md rounded-2xl border border-white/15 bg-[#111317] p-6 text-white shadow-2xl sm:p-8"
          >
            {isRedirecting ? (
              <m.div
                initial={{ opacity: reducedMotion ? 1 : 0 }} animate={{ opacity: 1 }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                className="flex min-h-64 flex-col items-center justify-center gap-5 py-6 text-center"
              >
                <div className="relative flex size-20 items-center justify-center rounded-full border border-white/10 bg-white/5" aria-hidden="true">
                  <Bouncy size={45} speed={1.75} color="white" />
                  <LockKeyhole className="size-5 text-white" strokeWidth={1.5} />
                </div>
                <h2 id={dialogTitleId} className="text-xl font-semibold tracking-tight" role="status">
                  {t('正在安全跳转至付款页面…', 'Securely directing to payment...')}
                </h2>
                <p className="text-sm tabular-nums text-white/60" aria-live="polite" aria-atomic="true">
                  {t(`${redirectCountdown} 秒后跳转`, `Redirecting in ${redirectCountdown}s`)}
                </p>
              </m.div>
            ) : <form id={formId} className="form" onSubmit={buy} aria-busy={busy}>
              <p>{t('当前价格','Current price')} · {price(packagePrice(config,plan))}</p>
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
              <PaymentMethodSelector value={paymentMethod} disabled={busy} name={`${formId}-payment-method`} availableProviders={providers}
                onChange={method => { setPaymentMethod(method); setError(''); }} />
              <div className="checkbox-consent text-xs text-white/80" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span id={consentId} className="leading-relaxed" style={{ flex: 1, minWidth: 0 }}>
                  {t('我已阅读并同意', 'I agree to the')}{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline text-blue-400 hover:text-blue-300">
                    {t('服务条款与退款政策', 'Terms of Service & Refund Policy')}
                  </a>
                </span>
                <Checkbox
                  name={`${formId}-terms`} checked={termsAccepted} disabled={busy} required disableRipple={false}
                  onChange={event => { setTermsAccepted(event.target.checked); setError(''); }}
                  slotProps={{ input: { 'aria-labelledby': consentId, 'aria-describedby': error ? errorId : undefined } }}
                  sx={{ flexShrink: 0, color: 'rgba(255,255,255,0.5)', '&.Mui-checked': { color: '#5eead4' }, '&.Mui-focusVisible': { outline: '2px solid #5eead4', outlineOffset: 2 } }}
                />
              </div>
              {error && <p id={errorId} className="form-error" role="alert">{error}</p>}
              <button type="submit" className={className} disabled={busy || !termsAccepted}>
                {busy ? t('正在打开…', 'Opening…') : t('前往付款', 'Continue to payment')}
                {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <span aria-hidden="true">↗</span>}
              </button>
              <button type="button" className="button secondary" disabled={busy} onClick={closeModal}>
                {t('取消', 'Cancel')}
              </button>
            </form>}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
