export interface ProviderStatusResult {
  enabled: boolean;
  reason?: string;
}

export function publicSalesEnabled(env:Record<string,string|undefined>=process.env) {
  return env.PUBLIC_SALES_ENABLED==='true'||(env.NODE_ENV!=='production'&&env.COMMERCE_TEST_MODE==='true');
}

export function configuredPaymentProviders(env:Record<string,string|undefined>=process.env):('stripe'|'toyyibpay')[] {
  const providers:('stripe'|'toyyibpay')[]=[];
  if(checkPaymentProviderEnabled('stripe',env).enabled&&env.STRIPE_LIVE_MODE?.trim()==='true'&&/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY?.trim()??'')&&env.STRIPE_WEBHOOK_SECRET?.trim())providers.push('stripe');
  else console.info('[payment-config]',{provider:'stripe',keyMode:/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY?.trim()??'')?'live':/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY?.trim()??'')?'test':'missing_or_invalid',liveMode:env.STRIPE_LIVE_MODE?.trim()==='true',webhookConfigured:!!env.STRIPE_WEBHOOK_SECRET?.trim()});
  if(checkPaymentProviderEnabled('toyyibpay',env).enabled&&env.TOYYIBPAY_SANDBOX==='false'&&env.TOYYIBPAY_SECRET_KEY?.trim()&&env.TOYYIBPAY_CATEGORY_CODE?.trim())providers.push('toyyibpay');
  return providers;
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
