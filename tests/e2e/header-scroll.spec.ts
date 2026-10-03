import { test, expect } from '@playwright/test';

test('the home logo smoothly returns to the top without navigating or resetting the package', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-page-transition]')).toHaveCSS('transform', 'none');
  const card = page.locator('.hero-checkout');
  const extension = card.getByRole('radio', { name: /Browser extension/ });
  await extension.click();
  await expect(extension).toHaveAttribute('aria-checked', 'true');
  const hero = await page.locator('#hero').elementHandle();
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await page.evaluate(() => {
    const probe = window as unknown as { logoScrollCalls: ScrollToOptions[] };
    probe.logoScrollCalls = [];
    const original = window.scrollTo.bind(window);
    window.scrollTo = ((...args: [ScrollToOptions] | [number, number]) => {
      if (typeof args[0] === 'object') probe.logoScrollCalls.push(args[0]);
      if (args.length === 1) original(args[0]);
      else original(args[0], args[1]);
    }) as typeof window.scrollTo;
  });

  await page.getByRole('link', { name: 'Auto-Check home' }).click();

  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { logoScrollCalls: ScrollToOptions[] }).logoScrollCalls,
  )).toContainEqual({ top: 0, behavior: 'smooth' });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(extension).toHaveAttribute('aria-checked', 'true');
  expect(await hero!.evaluate(element => element.isConnected)).toBe(true);
});
