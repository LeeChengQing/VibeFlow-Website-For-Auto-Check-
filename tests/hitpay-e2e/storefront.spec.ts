import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
});

for (const [host, width] of [['securecheckout.sandbox.hit-pay.com', 1440], ['checkout.sandbox.hit-pay.com', 402]] as const) {
test(`bundle checkout collects email and navigates to ${host}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 874 });
  const requests: unknown[] = [];
  let legacyCalls = 0;
  await page.route('**/api/checkout', route => { legacyCalls++; return route.fulfill({ status: 503, json: { error: 'LEGACY_DISABLED' } }); });
  const url = `https://${host}/payment-request/test/checkout`;
  await page.route('**/api/hitpay/checkout', route => {
    expect(route.request().method()).toBe('POST'); requests.push(route.request().postDataJSON());
    return route.fulfill({ json: { url, reference: 'test-reference' } });
  });
  await page.route(`https://${host}/**`, route => route.fulfill({ contentType: 'text/html', body: '<h1>Hosted checkout</h1>' }));
  await page.goto('/');
  const hero = page.locator(width < 768 ? '.mobile-purchase' : '.hero-checkout');
  await hero.getByRole('button', { name: /Get complete bundle/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Delivery email', { exact: true }).fill(' Buyer@Example.com ');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(page).toHaveURL(url);
  expect(requests).toEqual([{ buyer_email: 'buyer@example.com', plan: 'bundle' }]);
  expect(legacyCalls).toBe(0);
});
}

test('checkout errors stay in the form and allow retry without exposing backend details', async ({ page }) => {
  await page.route('**/api/checkout', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ status: 409, json: { error: 'CHECKOUT_UNAVAILABLE' } }));
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Checkout is currently unavailable');
  await expect(dialog.getByRole('button', { name: 'Continue to HitPay' })).toBeEnabled();
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ status: 500, json: { error: 'PRIVATE_DB_STACK_TRACE' } }));
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not open checkout');
  await expect(dialog.getByRole('alert')).not.toContainText('PRIVATE_DB_STACK_TRACE');
});

test('network failure and malformed success show a safe error without navigating', async ({ page }) => {
  await page.route('**/api/checkout', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/hitpay/checkout', route => route.abort('failed'));
  await page.goto('/'); const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not open checkout');
  await page.route('**/api/hitpay/checkout', route => route.fulfill({ json: { url: 'javascript:alert(1)', reference: 'test' } }));
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not open checkout');
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
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Please enter a valid email address.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await hero.getByRole('tab', { name: /Yearly/ }).click();
  await hero.locator('.buy-action > button').click();
  await dialog.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
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
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Delivery email', { exact: true }).fill('buyer@example.com');
  await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
  await expect(dialog.getByRole('button', { name: 'Opening…' })).toBeDisabled();
  await dialog.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(calls).toBe(1); finish();
  await expect(dialog.getByRole('alert')).toContainText('Could not open checkout');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Get complete bundle' })).toBeEnabled();
});

for (const width of [1440, 402]) {
  test(`standalone extension checkout collects email and redirects at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    let legacyCalls = 0;
    const requests: unknown[] = [];
    const url = 'https://checkout.sandbox.hit-pay.com/payment-request/extension/checkout';
    await page.route('**/api/checkout', route => { legacyCalls++; return route.fulfill({ status: 503, json: {} }); });
    await page.route('**/api/hitpay/checkout', route => {
      requests.push(route.request().postDataJSON());
      return route.fulfill({ json: { url, reference: 'extension-reference' } });
    });
    await page.route('https://checkout.sandbox.hit-pay.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Hosted extension checkout</h1>' }));
    await page.goto('/');
    const hero = page.locator(width < 768 ? '.mobile-purchase' : '.hero-checkout');
    await hero.getByRole('radio', { name: width < 768 ? 'Extension' : /Browser extension/ }).click();
    const buy = hero.locator('.buy-action > button');
    await expect(buy).toBeEnabled();
    await buy.click();
    const dialog = page.getByRole('dialog');
    const email = dialog.getByLabel('Delivery email', { exact: true });
    await expect(email).toBeFocused();
    await email.fill(' Buyer@Example.com ');
    await dialog.getByRole('button', { name: 'Continue to HitPay' }).click();
    await expect(page).toHaveURL(url);
    expect(requests).toEqual([{ buyer_email: 'buyer@example.com', plan: 'extension' }]);
    expect(legacyCalls).toBe(0);
  });
}
