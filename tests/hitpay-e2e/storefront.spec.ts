import { test, expect } from '@playwright/test';

test('bundle checkout collects email, posts only the canonical payload and navigates to HitPay', async ({ page }) => {
  const requests: unknown[] = [];
  let legacyCalls = 0;
  await page.route('**/api/checkout', route => { legacyCalls++; return route.fulfill({ status: 503, json: { error: 'LEGACY_DISABLED' } }); });
  const url = 'https://securecheckout.sandbox.hit-pay.com/payment-request/test/checkout';
  await page.route('**/api/hitpay/checkout', route => {
    expect(route.request().method()).toBe('POST'); requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { url, reference: 'test-reference' } });
  });
  await page.route('https://securecheckout.sandbox.hit-pay.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Hosted checkout</h1>' }));
  await page.goto('/');
  const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  await hero.getByLabel('Delivery email', { exact: true }).fill(' Buyer@Example.com ');
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(page).toHaveURL(url);
  expect(requests).toEqual([{ buyer_email: 'buyer@example.com', plan: 'bundle' }]);
  expect(legacyCalls).toBe(0);
});

test('checkout errors stay in the form and allow retry without exposing backend details', async ({ page }) => {
  await page.route('**/api/checkout', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ status: 409, json: { error: 'CHECKOUT_UNAVAILABLE' } }));
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  await hero.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('alert')).toContainText('Checkout is currently unavailable');
  await expect(hero.getByRole('button', { name: 'Continue to HitPay' })).toBeEnabled();
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ status: 500, json: { error: 'PRIVATE_DB_STACK_TRACE' } }));
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('alert')).toContainText('Could not open checkout');
  await expect(hero.getByRole('alert')).not.toContainText('PRIVATE_DB_STACK_TRACE');
});

test('network failure and malformed success show a safe error without navigating', async ({ page }) => {
  await page.route('**/api/checkout', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/hitpay/checkout', route => route.abort('failed'));
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  await hero.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('alert')).toContainText('Could not open checkout');
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ json: { url: 'javascript:alert(1)', reference: 'test' } }));
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('alert')).toContainText('Could not open checkout');
  await expect(page).toHaveURL('http://127.0.0.1:3148/');
});

test('notification billing choices send semester and yearly rather than legacy package codes', async ({ page }) => {
  const plans: string[] = [];
  await page.route('**/api/hitpay/checkout', route => {
    plans.push(route.request().postDataJSON().plan);
    return route.fulfill({ status: 400, json: { error: 'INVALID_EMAIL' } });
  });
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('radio', { name: /Mobile notifications/ }).click();
  await hero.getByRole('tab', { name: /Semester/ }).click();
  await hero.locator('.buy-action > button').click();
  await hero.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('alert')).toHaveText('Please enter a valid email address.');
  await hero.getByRole('tab', { name: /Yearly/ }).click();
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect.poll(() => plans).toEqual(['semester', 'yearly']);
});

test('pending checkout prevents repeated submissions and cancellation closes the email form', async ({ page }) => {
  let calls = 0;
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/hitpay/checkout', async route => {
    calls++; await waiting; await route.fulfill({ status: 502, json: { error: 'PAYMENT_PROVIDER_UNAVAILABLE' } });
  });
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  await hero.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await hero.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(hero.getByRole('button', { name: 'Opening…' })).toBeDisabled();
  await hero.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(calls).toBe(1); finish();
  await expect(hero.getByRole('alert')).toContainText('Could not open checkout');
  await hero.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(hero.getByLabel('Delivery email', { exact: true })).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Get complete bundle' })).toBeEnabled();
});

test('unsupported extension checkout is disabled and never falls back to simulated orders', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/checkout', route => { calls++; return route.fulfill({ status: 503, json: {} }); });
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('radio', { name: /Browser extension/ }).click();
  await expect(hero.getByRole('button', { name: 'Buy browser extension' })).toBeDisabled();
  await expect(hero.locator('.buy-action')).toContainText('Standalone extension checkout is unavailable');
  expect(calls).toBe(0);
});
