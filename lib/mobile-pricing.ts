import type { Locale } from './plans';
import { packagePrice, type SiteConfig } from './site-config';
import { formatPurchaseText } from './purchaseLocale';

/** Presentation only; cents and schedule always come from the published checkout config. */
export function mobilePricing(config: SiteConfig, now: number) {
  const bundle = config.packages.find(p => p.id === 'bundle')!;
  const extension = config.packages.find(p => p.id === 'extension')!;
  const semester = config.packages.find(p => p.id === 'mobile_notification')!;
  const amount = packagePrice(config, 'bundle', now);
  const notifications = config.packages.filter(p => p.visible && (p.id === 'mobile_notification' || p.id === 'mobile_notification_yearly'));
  const purchasable = notifications.filter(p => p.enabled);
  const starting = [...(purchasable.length ? purchasable : notifications)].sort((a, b) => packagePrice(config, a.id, now) - packagePrice(config, b.id, now))[0];
  return {
    bundle: { amount, regular: bundle.amount, separate: extension.amount + semester.amount, discounted: amount < bundle.amount },
    extension: packagePrice(config, 'extension', now),
    notification: starting ? { id: starting.id, amount: packagePrice(config, starting.id, now) } : null,
  };
}

export function mobileMoney(amount: number) { return `RM${(amount / 100).toFixed(2).replace(/\.00$/, '')}`; }

export function launchRemaining(locale: Locale, seconds: number) {
  const remaining = Math.max(0, seconds);
  const values = { days: Math.floor(remaining / 86400), hours: Math.floor((remaining % 86400) / 3600), minutes: Math.floor((remaining % 3600) / 60) };
  return formatPurchaseText(locale, remaining >= 86400 ? 'mobileTimer' : 'mobileShortTimer', values);
}
