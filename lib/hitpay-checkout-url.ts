/** Exact sandbox hosts observed in HitPay responses; shared by server and browser. */
export function isHitPaySandboxCheckoutURL(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      ['checkout.sandbox.hit-pay.com', 'securecheckout.sandbox.hit-pay.com'].includes(url.hostname) &&
      !url.port && !url.username && !url.password;
  } catch { return false; }
}
