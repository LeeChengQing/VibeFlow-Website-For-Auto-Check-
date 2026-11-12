import { devices, expect, test } from '@playwright/test';

const screens = [
  { name: 'compact iPhone', device: devices['iPhone SE'], width: 320, height: 568, locale: 'en', scheme: 'light' },
  { name: 'iPhone portrait', device: devices['iPhone 13'], width: 390, height: 844, locale: 'zh', scheme: 'dark' },
  { name: 'large iPhone landscape', device: devices['iPhone 13 Pro Max landscape'], width: 926, height: 428, locale: 'en', scheme: 'light' },
  { name: 'compact Android', device: devices['Pixel 7'], width: 360, height: 740, locale: 'zh', scheme: 'light' },
  { name: 'large Android', device: devices['Pixel 7'], width: 440, height: 956, locale: 'en', scheme: 'dark' },
] as const;

for (const screen of screens) {
  test(screen.name + ' keeps navigation, theme and checkout usable', async ({ browser, baseURL }) => {
    const { defaultBrowserType: _browserType, ...device } = screen.device;
    const context = await browser.newContext({
      ...device, isMobile: browser.browserType().name() !== 'firefox', baseURL, viewport: { width: screen.width, height: screen.height }, colorScheme: screen.scheme,
    });
    try {
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(locale => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        localStorage.setItem('vf-locale', locale);
      }, screen.locale);
      await page.goto('/');
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-intro', 'done', { timeout: 2000 });
      await expect(html).toHaveAttribute('data-perf', 'low');
      await expect(html).toHaveCSS('color-scheme', screen.scheme);
      await expect(page.locator('.mobile-purchase')).toBeVisible();
      const menu = page.locator('.menu-button');
      await menu.click();
      const nav = page.locator('#site-navigation');
      await expect(nav).toBeVisible();
      expect(await nav.evaluate(el => {
        const { left, top } = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(left + 30, top + 80));
      })).toBe(true);
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      const geometry = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(await geometry()).toBeLessThanOrEqual(0);

      await page.goto('/checkout?plan=bundle');
      const checkout = page.locator('[data-checkout-open]');
      await expect(checkout).toHaveCSS('color-scheme', screen.scheme);
      expect(await checkout.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
      const email = checkout.locator('input[type=email]');
      await expect(email).toHaveCSS('font-size', '16px');
      await email.fill('mobile@example.test');
      await expect(checkout.locator('button[type=submit]').locator('..')).toHaveCSS('position', 'static');
      const terms = checkout.locator('input[type=checkbox]');
      await terms.check();
      await expect(terms).toBeChecked();
      await expect(checkout.locator('button[type=submit]')).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
