import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SITE_CONFIG, offerIsActive, packagePrice, purchaseAllowed, validateSiteConfig, malaysiaInput, malaysiaISO } from '../lib/site-config';

test('scheduled promotions include the start, exclude the end and honor both switches', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  const start = Date.parse(config.offer.startsAt), end = Date.parse(config.offer.endsAt);
  assert.equal(packagePrice(config, 'bundle', start - 1), 3500);
  assert.equal(packagePrice(config, 'bundle', start), 3000);
  assert.equal(packagePrice(config, 'bundle', end), 3500);
  config.offer.enabled = false;
  assert.equal(offerIsActive(config, start), false);
  assert.equal(packagePrice(config, 'bundle', start), 3500);
  config.offer.enabled = true;
  config.packages[0].promotionEnabled = false;
  assert.equal(packagePrice(config, 'bundle', start), 3500);
});
test('only valid integer-cent prices and complete allowlisted packages can be saved', () => {
  assert.deepEqual(validateSiteConfig(DEFAULT_SITE_CONFIG), DEFAULT_SITE_CONFIG);
  for (const amount of [-1, 0, 12.99, Infinity, 100_000_000]) {
    const config = structuredClone(DEFAULT_SITE_CONFIG); config.packages[0].amount = amount;
    assert.throws(() => validateSiteConfig(config), /INVALID_SITE_CONFIG/);
  }
  const config = structuredClone(DEFAULT_SITE_CONFIG); config.packages[0].promotionalAmount = 9000;
  assert.throws(() => validateSiteConfig(config), /INVALID_SITE_CONFIG/);
  config.packages.pop(); assert.throws(() => validateSiteConfig(config), /INVALID_SITE_CONFIG/);
});
test('maintenance and disabled or hidden packages cannot be purchased', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  assert.equal(purchaseAllowed(config, 'bundle'), true);
  config.settings.maintenance = true; assert.equal(purchaseAllowed(config, 'bundle'), false);
  config.settings.maintenance = false; config.settings.checkoutEnabled = false; assert.equal(purchaseAllowed(config, 'bundle'), false);
  config.settings.checkoutEnabled = true; config.packages[0].visible = false; assert.equal(purchaseAllowed(config, 'bundle'), false);
  config.packages[0].visible = true; config.packages[0].enabled = false; assert.equal(purchaseAllowed(config, 'bundle'), false);
});
test('dates require an explicit timezone and upload sources cannot inject remote or executable URLs', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.offer.endsAt = config.offer.startsAt; assert.throws(() => validateSiteConfig(config));
  config.offer.endsAt = '2026-10-13T23:59:59'; assert.throws(() => validateSiteConfig(config));
  config.offer.endsAt = DEFAULT_SITE_CONFIG.offer.endsAt;
  for (const src of ['https://evil.example/track.png', '/api/site/assets/../../secret', 'javascript:alert(1)']) {
    config.guides[0].src = src; assert.throws(() => validateSiteConfig(config));
  }
  assert.equal(malaysiaInput('2026-10-04T00:00:00Z'), '2026-10-04T08:00');
  assert.equal(malaysiaISO('2026-10-04T08:00'), '2026-10-04T00:00:00.000Z');
});
