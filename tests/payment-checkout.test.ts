import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPaymentCheckoutURL } from '../lib/payment-checkout';

test('checkout redirects stay on the selected provider over HTTPS', () => {
  assert.equal(isPaymentCheckoutURL('https://checkout.stripe.com/c/pay/cs_test_123', 'stripe'), true);
  assert.equal(isPaymentCheckoutURL('https://toyyibpay.com/testbill', 'toyyibpay'), true);
  assert.equal(isPaymentCheckoutURL('https://dev.toyyibpay.com/testbill', 'toyyibpay'), true);
  for (const value of [null, {}, '', 'javascript:alert(1)', '/checkout/local',
    'http://checkout.stripe.com/test', 'https://checkout.stripe.com.attacker.com/test',
    'https://user:password@checkout.stripe.com/test', 'https://checkout.stripe.com:8443/test',
    'https://toyyibpay.com/testbill', 'https://checkout.stripe.com/']) {
    assert.equal(isPaymentCheckoutURL(value, 'stripe'), false);
  }
  assert.equal(isPaymentCheckoutURL('https://checkout.stripe.com/c/pay/test', 'toyyibpay'), false);
});
