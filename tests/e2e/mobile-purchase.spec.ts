import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const output = `.local/mobile-optimization${process.env.MOBILE_BROWSER ? `/${process.env.MOBILE_BROWSER}` : ''}`;
mkdirSync(output, { recursive: true });

test('desktop mobile-redesign baseline captures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
  for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('.hero-checkout')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const options = { animations: 'disabled' as const, style: '.hero-ambient, .mini-bundle-countdown, .bundle-countdown time { visibility: hidden !important; }' };
    await page.screenshot({ ...options, path: `${output}/desktop-${width}-${process.env.MOBILE_CAPTURE ?? 'after'}.png` });
    await page.locator('#pricing').scrollIntoViewIfNeeded();
    await page.screenshot({ ...options, path: `${output}/pricing-${width}-${process.env.MOBILE_CAPTURE ?? 'after'}.png` });
  }
});

test('mobile decision, selected plan, sticky purchase and checkout stay connected', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 714 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
  await page.goto('/');
  const purchase = page.locator('.mobile-purchase');
  await expect(purchase.getByRole('radio', { name: 'Complete', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(purchase.getByRole('button', { name: /Get complete bundle · RM30/ })).toBeVisible();
  const cta = await purchase.locator('.mobile-inline-cta').boundingBox();
  expect(cta!.y + cta!.height).toBeLessThan(714);
  await expect(page.locator('.mobile-sticky-purchase')).not.toBeVisible();
  await purchase.getByRole('radio', { name: 'Extension', exact: true }).click();
  await expect(purchase).toContainText('RM24.99');
  await expect(purchase.getByRole('button', { name: /Get extension/ })).toBeEnabled();
  await purchase.getByRole('radio', { name: 'Mobile', exact: true }).click();
  await expect(purchase).toContainText('From RM11.99');
  await purchase.getByRole('button', { name: 'View notification plans' }).click();
  await expect(purchase.getByRole('tab', { name: 'Semester' })).toBeVisible();
  await purchase.getByRole('radio', { name: 'Complete', exact: true }).click();
  await page.locator('#workflow').scrollIntoViewIfNeeded();
  const sticky = page.locator('.mobile-sticky-purchase');
  await expect(sticky).toBeVisible();
  const support = await page.locator('.support-orb').boundingBox();
  const bar = await sticky.boundingBox();
  expect(support!.y + support!.height).toBeLessThan(bar!.y);
  await page.screenshot({ path: `${output}/mobile-sticky.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 1000, height: 714 });
  await expect(sticky).not.toBeVisible();
  await page.setViewportSize({ width: 402, height: 714 });
  await page.locator('#workflow').scrollIntoViewIfNeeded();
  await expect(sticky).toBeVisible();
  await sticky.getByRole('button', { name: 'Get bundle' }).focus();
  await sticky.getByRole('button', { name: 'Get bundle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Complete your purchase' });
  await expect(dialog.getByLabel('Delivery email')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByLabel('Delivery email')).toBeFocused();
  await expect(sticky).not.toBeVisible();
  await expect(page.locator('.support-orb')).not.toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(sticky.getByRole('button', { name: 'Get bundle' })).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-overlay', '');
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-editing', '');
});

for (const locale of ['en', 'zh'] as const) {
  test(`mobile viewport matrix and controls (${locale})`, async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(value => localStorage.setItem('vf-locale', value), locale);
    for (const [width, height] of [[360,800],[375,812],[384,832],[390,844],[393,852],[402,714],[402,754],[402,874],[412,915],[428,926],[430,932],[440,956]]) {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      const purchase = page.locator('.mobile-purchase');
      await expect(purchase.locator('.mobile-inline-cta button').first()).toBeVisible();
      const geometry = await purchase.evaluate(el => {
        const cta = el.querySelector('.mobile-inline-cta')!.getBoundingClientRect();
        const selectors = [...el.querySelectorAll('.mobile-plan-selector button')].map(button => button.getBoundingClientRect());
        return { overflow: document.documentElement.scrollWidth - innerWidth, bottom: cta.bottom, touch: selectors.every(rect => rect.width >= 44 && rect.height >= 44) };
      });
      expect(geometry.overflow).toBeLessThanOrEqual(0);
      expect(geometry.bottom).toBeLessThan(height);
      expect(geometry.touch).toBe(true);
      await page.screenshot({ path: `${output}/mobile-${width}x${height}-${locale}.png`, animations: 'disabled' });
      for (const radio of await purchase.getByRole('radio').all()) {
        await radio.click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const button = await purchase.locator('.mobile-inline-cta button').first().boundingBox();
        expect(button!.width).toBeGreaterThan(200);
        expect(button!.height).toBeGreaterThanOrEqual(52);
      }
    }
    expect(errors).toEqual([]);
  });
}

test('mobile expiry updates all purchase entries and checkout error is recoverable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
  await page.goto('/');
  const endsAt = await page.locator('.mobile-purchase .mobile-launch-countdown time').getAttribute('datetime');
  await page.clock.install({ time: new Date(Date.parse(endsAt!) - 60000) });
  await page.reload();
  await expect(page.locator('.mobile-purchase .mobile-price-line strong')).toHaveText('RM30');
  await page.locator('#workflow').scrollIntoViewIfNeeded();
  await expect(page.locator('.mobile-sticky-purchase')).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.locator('.mobile-purchase .mobile-price-line strong')).toHaveText('RM35');
  await expect(page.locator('.mobile-bundle-detail .mobile-price-line strong')).toHaveText('RM35');
  await expect(page.locator('.mobile-sticky-purchase strong')).toHaveText('RM35');
  await expect(page.locator('.mobile-launch-countdown')).toHaveCount(0);
  await expect(page.locator('.mobile-separate-value').first()).toContainText('RM36.98');
  let body: Record<string, unknown> | undefined;
  await page.route('**/api/checkout/stripe', async route => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'CHECKOUT_UNAVAILABLE' }) });
  });
  await page.locator('.mobile-sticky-purchase').getByRole('button', { name: 'Get bundle' }).click();
  const purchase = page.locator('.mobile-purchase');
  const dialog = page.getByRole('dialog', { name: 'Complete your purchase' });
  await dialog.getByLabel('Delivery email').fill('Mobile-Test@example.com');
  await dialog.getByRole('button', { name: 'Continue to Stripe' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please try again later');
  await expect(dialog.getByRole('button', { name: 'Continue to Stripe' })).toBeEnabled();
  expect(body).toEqual({ buyer_email: 'mobile-test@example.com', plan: 'bundle' });
  await expect(purchase.getByRole('radio', { name: 'Complete', exact: true })).toHaveAttribute('aria-checked', 'true');
});

test('menu focus, keyboard fallback, landscape and later purchase stay usable', async ({ page }) => {
  await page.setViewportSize({ width: 402, height: 714 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(page.getByRole('link', { name: 'Product', exact: true })).toBeFocused();
  await expect(page.locator('.support-orb')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeFocused();
  await page.locator('#workflow').scrollIntoViewIfNeeded();
  await expect(page.locator('.mobile-sticky-purchase')).toBeVisible();
  await page.setViewportSize({ width: 714, height: 402 });
  await expect(page.locator('.mobile-sticky-purchase')).not.toBeVisible();
  await expect(page.locator('.support-orb')).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 402, height: 714 });
  await page.locator('.mobile-bundle-detail').scrollIntoViewIfNeeded();
  await expect(page.locator('.mobile-sticky-purchase')).not.toBeVisible();
  await page.locator('.mobile-bundle-detail').screenshot({ path: `${output}/mobile-second-bundle.png` });
  await page.locator('.mobile-bundle-detail').getByRole('button', { name: /Get the complete bundle/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Delivery email')).toBeFocused();
  await expect(page.locator('.support-orb')).not.toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.mobile-bundle-detail').getByRole('button', { name: /Get the complete bundle/ })).toBeFocused();
  await page.locator('.final-cta').scrollIntoViewIfNeeded();
  await expect(page.locator('.mobile-sticky-purchase')).not.toBeVisible();
  await page.getByRole('button', { name: /Get your selected plan/ }).click();
  await expect(page.getByRole('dialog').getByLabel('Delivery email')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /Get your selected plan/ })).toBeFocused();
  const viewport = await page.locator('meta[name=viewport]').getAttribute('content');
  expect(viewport).toContain('viewport-fit=cover');
  expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1/);
});
