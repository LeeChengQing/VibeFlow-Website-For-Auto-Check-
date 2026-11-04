import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadServerModule } from './helpers/server-module';
import { LocaleProvider, useLocale } from '../components/LocaleProvider';
import { getOrderPlanDisplay, isNotificationPlan } from '../lib/plans';
import type { PaymentReturnStatus } from '../components/PaymentReturn';

// Mock only Next's request context and browser timers; render the real UI and
// React hooks. Running registered effects models mounting without a live order.
function fixture() {
  const effects: Array<() => void | (() => void)> = [];
  let intervalCount = 0;
  const dependencies: Record<string, unknown> = {
    react: { ...React, useEffect: (effect: () => void | (() => void)) => effects.push(effect) },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    './LocaleProvider': { useLocale },
    './PaymentFailure.module.css': {},
    '@/lib/plans': { getOrderPlanDisplay, isNotificationPlan },
    'next/dynamic': () => () => null,
  };
  const globals = { window: {
    setInterval: () => { intervalCount++; return intervalCount; }, clearInterval() {},
  } };
  if (existsSync('components/PaymentFailure.tsx')) {
    dependencies['./PaymentFailure'] = loadServerModule('components/PaymentFailure.tsx', dependencies, globals);
  }
  const desktop = loadServerModule<any>('components/PaymentReturn.tsx', dependencies, globals).PaymentReturn;
  const mobile = loadServerModule<any>('components/MinimalPaymentReturn.tsx', dependencies, globals).MinimalPaymentReturn;
  return {
    render(status: PaymentReturnStatus, variant: 'desktop' | 'mobile', locale: 'en' | 'zh' = 'en', receipt?: any) {
      effects.length = 0;
      const html = renderToStaticMarkup(React.createElement(LocaleProvider, {
        defaultLocale: locale, persist: false,
        children: React.createElement(variant === 'desktop' ? desktop : mobile, {
          status, downloadExtension: true, licenseKey: 'SHOULD-NOT-LEAK', receipt,
        }),
      }));
      // LocaleProvider's DOM effects are not intercepted, only target effects.
      for (const effect of effects) effect();
      return html;
    },
    intervals: () => intervalCount,
  };
}

test('unconfirmed returns show the failure recovery UI instead of spinning on desktop and mobile', () => {
  for (const variant of ['desktop', 'mobile'] as const) {
    for (const status of ['pending', 'not_paid', 'unverified', 'unavailable'] as const) {
      const f = fixture();
      const html = f.render(status, variant);
      assert.match(html, /<h1[^>]*>Payment failed<\/h1>/);
      assert.match(html, /Check payment status/);
      assert.match(html, /href="\/"[^>]*>Return home/);
      assert.match(html, /href="\/support"/);
      assert.match(html, /Please do not pay again/);
      assert.doesNotMatch(html, /Confirming your payment|animate-spin|Download Extension|SHOULD-NOT-LEAK/);
      assert.equal(f.intervals(), 0, 'Unconfirmed returns must not poll indefinitely');
    }
  }
});

test('failure recovery is translated for Chinese desktop and in-app returns', () => {
  for (const variant of ['desktop', 'mobile'] as const) {
    const html = fixture().render('pending', variant, 'zh');
    assert.match(html, /付款失败/);
    assert.match(html, /重新检查付款状态/);
    assert.match(html, /返回首页/);
    assert.match(html, /勿重复付款/);
    assert.doesNotMatch(html, /Confirming your payment|Payment failed/);
  }
});

test('verified payments retain success or fulfillment processing rather than a failure', () => {
  for (const variant of ['desktop', 'mobile'] as const) {
    for (const status of ['success', 'processing'] as const) {
      const f = fixture();
      const html = f.render(status, variant);
      assert.match(html, status === 'success' ? /Payment Successful/ : /Payment received/);
      assert.doesNotMatch(html, /Payment failed|Check payment status/);
      assert.equal(f.intervals(), status === 'processing' ? 1 : 0);
    }
  }
});

test('receipt renders correctly across all 4 plans in both English and Chinese without throwing', () => {
  const plans = ['extension', 'semester', 'yearly', 'bundle'] as const;
  for (const plan of plans) {
    for (const locale of ['en', 'zh'] as const) {
      const receipt = {
        reference: 'VF-TEST-1234',
        plan,
        amount: 3000,
        maskedEmail: 't•••••@example.com',
        paidAt: new Date().toISOString(),
        paymentProvider: 'stripe' as const,
      };

      const f = fixture();
      const html = f.render('success', 'desktop', locale, receipt);
      assert.ok(html.length > 0);
      assert.doesNotMatch(html, /Payment failed/);
      assert.match(html, locale === 'zh' ? /付款成功/ : /Payment Successful/);
    }
  }
});

