import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';
import { mobilePricing, mobileMoney, launchRemaining } from '../lib/mobile-pricing';

test('launch, regular bundle and separate value remain distinct through expiry', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  const expiry = Date.parse(config.offer.endsAt);
  assert.deepEqual(mobilePricing(config, expiry - 1).bundle, { amount: 3000, regular: 3500, separate: 3698, discounted: true });
  assert.deepEqual(mobilePricing(config, expiry).bundle, { amount: 3500, regular: 3500, separate: 3698, discounted: false });
  config.packages.find(p => p.id === 'extension')!.amount = 2600;
  assert.equal(mobilePricing(config, expiry).bundle.separate, 3799);
});

test('mobile prices preserve cents and countdown stays compact and localized', () => {
  assert.equal(mobileMoney(3000), 'RM30');
  assert.equal(mobileMoney(2499), 'RM24.99');
  assert.equal(launchRemaining('en', 9 * 86400 + 17 * 3600 + 42 * 60), '9d 17h 42m');
  assert.equal(launchRemaining('zh', 3600 + 42 * 60), '1时 42分');
  assert.equal(launchRemaining('en', -1), '0h 0m');
});

test('notification starting price comes from a purchasable period when one is available', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.packages.find(p => p.id === 'mobile_notification')!.enabled = false;
  assert.equal(mobilePricing(config, Date.parse(config.offer.endsAt)).notification!.amount, 1999);
});
