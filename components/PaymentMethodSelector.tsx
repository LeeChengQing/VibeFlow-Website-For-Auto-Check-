'use client';

import { paymentMethods, type PaymentMethod } from '@/lib/payment-checkout';
import { useLocale } from './LocaleProvider';
import styles from './payment-method-selector.module.css';

export function PaymentMethodSelector({ value, onChange, disabled, name }: {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  disabled: boolean;
  name: string;
}) {
  const { t } = useLocale();
  return <fieldset className={styles.group} disabled={disabled}>
    <legend className={styles.legend}>{t('付款方式', 'Payment method')}</legend>
    <div className={styles.options}>
      {paymentMethods.map(method => <label key={method.id}
        className={`${styles.card} payment-method-card ${value === method.id ? `${styles.selected} is-selected` : ''} ${!method.enabled ? styles.unavailable : ''}`}>
        <input className={styles.radio} type="radio" name={name} value={method.id}
          checked={value === method.id} disabled={disabled || !method.enabled}
          onChange={() => { if (method.enabled) onChange(method.id); }} />
        <span className={styles.copy}>
          <span className={styles.title}>{method.label}</span>
          <span className={styles.provider}>{t(`由 ${method.provider} 提供支持`, `Powered by ${method.provider}`)}</span>
          {!method.enabled && <span className={styles.availability}>{t('暂不可用', 'Temporarily unavailable')}</span>}
        </span>
      </label>)}
    </div>
  </fieldset>;
}
