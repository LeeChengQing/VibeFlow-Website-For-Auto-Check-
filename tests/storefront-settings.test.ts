import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SITE_CONFIG } from '../lib/site-config';
import { notificationOptions, resolveBillingPlan, SiteConfigProvider, useNotificationBilling } from '../components/SiteConfigProvider';
import { LocaleProvider } from '../components/LocaleProvider';
import { LeftHeroText } from '../components/HeroText';
import { NotificationPriceDisplay } from '../components/NotificationPriceDisplay';
import { BillingSegmentedControl } from '../components/BillingSegmentedControl';

function BillingSelection() {
  const { billingPlan, setBillingPlan } = useNotificationBilling();
  return createElement(BillingSegmentedControl, { value: billingPlan, onChange: setBillingPlan, id: 'billing-test' });
}

test('hidden or disabled billing packages cannot remain the active purchase selection', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.packages.find(item => item.id === 'mobile_notification_yearly')!.visible = false;
  assert.deepEqual(notificationOptions(config), [{ id: 'semester', enabled: true }]);
  assert.equal(resolveBillingPlan(config, 'yearly'), 'semester');
  config.packages.find(item => item.id === 'mobile_notification_yearly')!.visible = true;
  config.packages.find(item => item.id === 'mobile_notification_yearly')!.enabled = false;
  assert.equal(resolveBillingPlan(config, 'yearly'), 'semester');
  config.packages.find(item => item.id === 'mobile_notification')!.enabled = false;
  assert.equal(resolveBillingPlan(config, 'yearly'), 'yearly');
});

test('billing tabs follow configured display order without altering the saved configuration', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.packages.find(item => item.id === 'mobile_notification_yearly')!.order = 0;
  const original = JSON.stringify(config);
  assert.deepEqual(notificationOptions(config).map(item => item.id), ['yearly', 'semester']);
  assert.equal(JSON.stringify(config), original);
});

test('notification billing can start from the requested link selection and still respects package availability', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  const render = (initialBillingPlan: 'semester' | 'yearly' | undefined, options = config) => renderToStaticMarkup(createElement(SiteConfigProvider, {
    config: options, initialNow: Date.parse(options.offer.startsAt), initialBillingPlan,
    children: createElement(BillingSelection),
  }));

  assert.match(render('semester'), /id="billing-test-semester"[^>]*aria-selected="true"/);
  assert.match(render('yearly'), /id="billing-test-yearly"[^>]*aria-selected="true"/);
  assert.match(render(undefined), /id="billing-test-yearly"[^>]*aria-selected="true"/);

  config.packages.find(item => item.id === 'mobile_notification')!.enabled = false;
  assert.match(render('semester'), /id="billing-test-yearly"[^>]*aria-selected="true"/);
});

test('Hero server markup uses the configured copy and default locale', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.hero.line1.zh = '测试标题';
  const html = renderToStaticMarkup(createElement(SiteConfigProvider, { config, initialNow: Date.parse(config.offer.startsAt), children:
    createElement(LocaleProvider, { defaultLocale: 'zh', persist: false, children: createElement(LeftHeroText) })
  }));
  assert.match(html, /测试标题/);
  assert.match(html, /选择你的方案/);
  assert.doesNotMatch(html, /Set it up\./);
});

test('notification prices use per-package offers only inside their configured schedule', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  const yearly = config.packages.find(item => item.id === 'mobile_notification_yearly')!;
  yearly.amount = 4800;
  yearly.promotionalAmount = 3200;
  yearly.promotionEnabled = true;
  const render = (initialNow: number) => renderToStaticMarkup(createElement(SiteConfigProvider, { config, initialNow, children:
    createElement(NotificationPriceDisplay, { billingPlan: 'yearly', id: 'test-price', context: 'pricing' })
  }));
  const active = render(Date.parse(config.offer.startsAt));
  assert.match(active, /<strong>32\.00<\/strong>/);
  assert.match(active, /RM 48\.00/);
  const ended = render(Date.parse(config.offer.endsAt));
  assert.match(ended, /<strong>48\.00<\/strong>/);
  assert.doesNotMatch(ended, /<s>/);
});

test('a hidden billing period disappears and an unavailable visible period is disabled', () => {
  const config = structuredClone(DEFAULT_SITE_CONFIG);
  config.packages.find(item => item.id === 'mobile_notification_yearly')!.visible = false;
  config.packages.find(item => item.id === 'mobile_notification')!.enabled = false;
  const html = renderToStaticMarkup(createElement(SiteConfigProvider, { config, initialNow: Date.parse(config.offer.startsAt), children:
    createElement(BillingSegmentedControl, { value: 'semester', id: 'test-billing', onChange: () => {} })
  }));
  assert.match(html, /disabled=""/);
  assert.match(html, /Semester/);
  assert.doesNotMatch(html, /Yearly/);
});
