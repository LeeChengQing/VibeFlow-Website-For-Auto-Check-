export type PaymentMethod = 'stripe' | 'toyyibpay';

export const paymentMethods = [
  {
    id: 'stripe', provider: 'Stripe', endpoint: '/api/checkout/stripe', enabled: true,
    label: 'Bank, Alipay',
  },
  {
    id: 'toyyibpay', provider: 'ToyyibPay', endpoint: '/api/checkout/toyyibpay', enabled: true,
    label: 'Touch n go',
  },
] as const;

/** Only accept HTTPS checkout pages belonging to the selected gateway. */
export function isPaymentCheckoutURL(value: unknown, method: PaymentMethod): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const hosts = method === 'stripe'
      ? ['checkout.stripe.com']
      : ['toyyibpay.com', 'www.toyyibpay.com', 'dev.toyyibpay.com'];
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      hosts.includes(url.hostname) && url.pathname !== '/';
  } catch { return false; }
}
