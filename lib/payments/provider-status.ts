export interface ProviderStatusResult {
  enabled: boolean;
  reason?: string;
}

export function checkPaymentProviderEnabled(
  provider: 'stripe' | 'toyyibpay' | 'hitpay',
  env: Record<string, string | undefined> = process.env
): ProviderStatusResult {
  if (provider === 'stripe') {
    const val = env.PAYMENTS_STRIPE_ENABLED;
    if (val === 'false' || val === '0' || val === 'disabled') {
      return {
        enabled: false,
        reason: 'PROVIDER_TEMPORARILY_DISABLED',
      };
    }
    return { enabled: true };
  }

  if (provider === 'toyyibpay') {
    const val = env.PAYMENTS_TOYYIBPAY_ENABLED;
    if (val === 'false' || val === '0' || val === 'disabled') {
      return {
        enabled: false,
        reason: 'PROVIDER_TEMPORARILY_DISABLED',
      };
    }
    return { enabled: true };
  }

  if (provider === 'hitpay') {
    const val = env.PAYMENTS_HITPAY_ENABLED;
    if (val === 'false' || val === '0' || val === 'disabled') {
      return {
        enabled: false,
        reason: 'PROVIDER_TEMPORARILY_DISABLED',
      };
    }
    return { enabled: true };
  }

  return { enabled: true };
}
