import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vf-locale', 'en'));
});

for (const width of [1440, 402]) {
  test(`direct visits default to bundle and extension entry selects semester notifications at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    const purchase = page.locator(width < 768 ? '.mobile-purchase' : '.hero-checkout');

    await page.goto('/');
    await expect(purchase.getByRole('radio', { name: /Complete/ })).toHaveAttribute('aria-checked', 'true');

    await page.goto('/?product=mobile_notification&billing=semester');
    await expect(purchase.getByRole('radio', { name: /Mobile notifications|Mobile/ })).toHaveAttribute('aria-checked', 'true');
    if (width < 768) await purchase.getByRole('button', { name: /View notification plans/ }).click();
    await expect(purchase.getByRole('tab', { name: /Semester/ })).toHaveAttribute('aria-selected', 'true');

    await page.goto('/');
    await expect(purchase.getByRole('radio', { name: /Complete/ })).toHaveAttribute('aria-checked', 'true');
  });
}
