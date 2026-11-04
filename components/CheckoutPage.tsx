'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, Landmark, LoaderCircle, LockKeyhole, QrCode } from 'lucide-react';
import { gsap } from 'gsap';
import { price, uiPlanToDbPlan, type PlanCode } from '@/lib/plans';
import { packagePrice, purchaseAllowed } from '@/lib/site-config';
import { CURRENT_TERMS_VERSION } from '@/lib/terms';
import { isPaymentCheckoutURL, paymentMethods, type PaymentMethod } from '@/lib/payment-checkout';
import { useLocale } from './LocaleProvider';
import { useOfferActive, useSiteConfig } from './SiteConfigProvider';
import styles from './checkout.module.css';

export function CheckoutPage({ plan }: { plan: PlanCode }) {
  const router = useRouter();
  const { t } = useLocale();
  const { config, preview, providers } = useSiteConfig();
  const offerActive = useOfferActive();
  const product = config.packages.find(item => item.id === plan)!;
  const amount = price(packagePrice(config, plan, Date.parse(offerActive ? config.offer.startsAt : config.offer.endsAt)));
  const [email, setEmail] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [termsError, setTermsError] = useState('');
  const submitting = useRef(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const selectedMethod = paymentMethods.find(method => method.id === paymentMethod)!;
  const canonicalPlan = uiPlanToDbPlan(plan);
  const available = !preview && purchaseAllowed(config, plan) && providers.length > 0;

  useEffect(() => {
    if (providers.length && !providers.includes(paymentMethod)) setPaymentMethod(providers[0] as PaymentMethod);
  }, [providers, paymentMethod]);
  useEffect(() => {
    gsap.set('#main', { clearProps: 'opacity' });
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.from('[data-checkout-topbar]', { opacity: 0, duration: 0.25, clearProps: 'all' });
      gsap.from('[data-checkout-enter]', { opacity: 0, y: 12, stagger: 0.04, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
      gsap.from('[data-checkout-summary]', { opacity: 0, y: 12, delay: 0.08, duration: 0.35, ease: 'power2.out', clearProps: 'all' });
    }, rootRef);
    return () => context.revert();
  }, []);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { submitting.current = false; setBusy(false); }
    };
    window.addEventListener('pageshow', restore);
    return () => window.removeEventListener('pageshow', restore);
  }, []);

  function checkoutError(detail: unknown) {
    console.error('Checkout submission failed', detail);
    return t('付款暂时无法使用，请稍后再试。', 'Payment is temporarily unavailable. Please try again.');
  }


  async function buy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setError(''); setEmailError(''); setTermsError('');
    if (!emailInputRef.current?.validity.valid || !email.trim()) {
      setEmailError(t('请输入有效的邮箱地址。', 'Please enter a valid email address.'));
      emailInputRef.current?.focus();
      return;
    }
    if (!termsAccepted) {
      setTermsError(t('请阅读并勾选同意服务条款与退款政策。', 'Please agree to the Terms of Service & Refund Policy.'));
      termsRef.current?.focus();
      termsRef.current?.scrollIntoView({ block: 'center' });
      return;
    }
    if (canonicalPlan === 'semester' || canonicalPlan === 'yearly') { setError(checkoutError('USE_EXTENSION_FOR_PHONE')); return; }
    if (!available || !selectedMethod.enabled) { setError(checkoutError('CHECKOUT_UNAVAILABLE')); return; }
    submitting.current = true;
    setBusy(true);
    let redirecting = false;
    try {
      const token = sessionStorage.getItem('auto-check-device-token');
      if (!providers.includes(paymentMethod)) { setError(checkoutError('CHECKOUT_UNAVAILABLE')); return; }
      const response = await fetch(selectedMethod.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({ buyer_email: email.trim().toLowerCase(), plan: canonicalPlan, terms_accepted: true, terms_version: CURRENT_TERMS_VERSION }),
        signal: AbortSignal.timeout(30_000),
      });
      const result = await response.json();
      if (!response.ok) { setError(checkoutError({ status: response.status, response: result })); return; }
      if (!isPaymentCheckoutURL(result?.url, paymentMethod)) throw new Error('INVALID_CHECKOUT_URL');
      window.location.href = result.url;
      redirecting = true;
    } catch (error) {
      setError(checkoutError(error));
    } finally {
      if (!redirecting) { submitting.current = false; setBusy(false); }
    }
  }

  const note = t('付款经安全加密传输', 'Payments are securely encrypted');
  return <div ref={rootRef} className={styles.root}>
    <header className={styles.topbar} data-checkout-topbar>
      <button type="button" className={styles.back} onClick={() => window.history.length > 1 ? router.back() : router.push('/#pricing')}>
        <ArrowLeft size={16} aria-hidden="true" />{t('返回', 'Back')}
      </button>
      <div className={styles.brand}><Image src="/files/logo.png" alt="" width={26} height={26} />Auto-Check</div>
      <span className={styles.secure}><LockKeyhole size={14} aria-hidden="true" />{t('安全加密付款', 'Secure payment')}</span>
    </header>
    <div className={styles.container}>
      <div className={styles.title} data-checkout-enter><h1>{t('完成购买', 'Complete purchase')}</h1><p>{t('激活信息将发送到你的邮箱。', 'Activation details are sent to your email.')}</p></div>
      <form className={styles.grid} onSubmit={buy} noValidate aria-busy={busy}>
        <fieldset className={styles.fields} disabled={busy}>
          <div className={styles.emailRow} data-checkout-enter>
            <label className={styles.label} htmlFor={id + '-email'}>{t('接收邮箱', 'Email')}</label>
            <input ref={emailInputRef} className={styles.email} id={id + '-email'} name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} placeholder="you@example.com" value={email}
              aria-invalid={!!emailError} aria-describedby={emailError ? id + '-email-error' : undefined}
              onChange={event => { setEmail(event.target.value); setEmailError(''); setError(''); }} />
            {emailError && <p id={id + '-email-error'} className={styles.error} role="alert">{emailError}</p>}
          </div>
          <div data-checkout-enter>
            <p id={id + '-methods'} className={styles.label}>{t('付款方式', 'Payment method')}</p>
            <div className={styles.methods} role="radiogroup" aria-labelledby={id + '-methods'}>
              {paymentMethods.map(method => {
                const stripe = method.id === 'stripe';
                const Icon = stripe ? Landmark : QrCode;
                return <label key={method.id} className={styles.method} data-selected={paymentMethod === method.id}>
                  <span className={styles.methodTop}><Icon size={22} strokeWidth={1.6} aria-hidden="true" /><input type="radio" name={id + '-method'} value={method.id} checked={paymentMethod === method.id}
                    onChange={() => { setPaymentMethod(method.id); setError(''); }} /></span>
                  <strong>{stripe ? t('网银 / 支付宝', 'Bank & Alipay') : "Touch 'n Go"}</strong>
                  <span className={styles.methodSub}>{stripe ? t('使用网银或支付宝付款', 'Pay with online banking or Alipay') : t("使用 Touch 'n Go eWallet 付款", "Pay with Touch 'n Go eWallet")}</span>
                  <span className={styles.chips}>{(stripe ? ['Online Banking', 'Alipay'] : ['TNG eWallet']).map(chip => <span key={chip}>{chip}</span>)}</span>
                </label>;
              })}
            </div>
            <p className={styles.hint} aria-live="polite">{t('点击付款后将跳转到安全支付页面完成付款。', 'You will be redirected to a secure payment page to complete your payment.')}</p>
          </div>
          <div className={styles.termsGroup} data-checkout-enter>
            <label className={styles.terms} htmlFor={id + '-terms'}>
              <input ref={termsRef} id={id + '-terms'} type="checkbox" checked={termsAccepted} aria-invalid={!!termsError} aria-describedby={termsError ? id + '-terms-error' : undefined}
                onChange={event => { setTermsAccepted(event.target.checked); setTermsError(''); setError(''); }} />
              <span>{t('我已阅读并同意', 'I agree to the')}{' '}<a href="/terms" target="_blank" rel="noopener noreferrer">{t('服务条款', 'Terms of Service')}</a>{t(' 与 ', ' & ')}<a href="/terms" target="_blank" rel="noopener noreferrer">{t('退款政策', 'Refund Policy')}</a></span>
            </label>
            {termsError && <p id={id + '-terms-error'} className={styles.error} role="alert">{termsError}</p>}
          </div>
        </fieldset>
        <aside className={styles.summary} data-checkout-summary aria-label={t('订单摘要', 'Order summary')}>
          <p className={styles.summaryLabel}>{t('订单摘要', 'Order summary')}</p>
          <div className={styles.product}><span className={styles.tile}><Image src="/files/logo.png" alt="" width={30} height={30} /></span><div className={styles.productCopy}><strong>{t(product.name.zh, product.name.en)}</strong><p>{t(product.description.zh, product.description.en)}</p></div><strong className={styles.productPrice}>{amount}</strong></div>
          <div className={styles.divider} />
          <div className={styles.total}><strong>{t('今日应付', 'Due today')}</strong><span>{amount}</span></div>
          <div className={styles.actions}>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.pay} disabled={busy}>{busy ? <><LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />{t('正在打开…', 'Opening…')}</> : <>{t('前往付款', 'Continue to payment')} · {amount}<ArrowUpRight size={20} aria-hidden="true" /></>}</button>
            <p className={styles.note}>{note}</p>
          </div>
        </aside>
      </form>
    </div>
  </div>;
}
