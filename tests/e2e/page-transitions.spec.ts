import { test, expect, type Page } from '@playwright/test';

const transitionSelector = '#main > [data-page-transition]';

async function expectSettled(page: Page) {
  const transition = page.locator(transitionSelector);
  await expect(transition).toHaveCSS('opacity', '1');
  await expect(transition).toHaveCSS('transform', 'none');
  await expect(transition).toHaveCSS('will-change', 'auto');
}

test('Link navigation animates the page while shared navigation stays mounted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const probe = window as unknown as { transitionProperties: string[] };
    probe.transitionProperties = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) {
      const animation = animate.apply(this, args);
      if (this.matches('[data-page-transition]')) {
        const frames = (animation.effect as KeyframeEffect).getKeyframes();
        for (const frame of frames) {
          for (const property of Object.keys(frame)) {
            if (!['offset', 'computedOffset', 'easing', 'composite'].includes(property)) {
              probe.transitionProperties.push(property);
            }
          }
        }
      }
      return animation;
    };
  });
  await page.goto('/support');
  await expectSettled(page);
  const animatedProperties = await page.evaluate(() =>
    [...new Set((window as unknown as { transitionProperties: string[] }).transitionProperties)].sort());
  expect(animatedProperties).toEqual(['opacity', 'transform']);
  const header = await page.locator('.site-header').elementHandle();
  const oldPage = await page.locator(transitionSelector).elementHandle();

  await page.getByRole('link', { name: 'Auto-Check home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expectSettled(page);
  expect(await oldPage!.evaluate(element => element.isConnected)).toBe(false);
  expect(await header!.evaluate(element => element.isConnected)).toBe(true);

  await page.locator('.nav-links a[href="/support"]').click();
  await expect(page).toHaveURL(/\/support$/);
  await expectSettled(page);
  await expect(page.locator('input[name="email"]')).toBeEditable();
  expect(errors).toEqual([]);
});

test('deeper segment navigation and browser back get fresh entries', async ({ page }) => {
  await page.goto('/support/transition-probe');
  await expectSettled(page);
  const oldPage = await page.locator(transitionSelector).elementHandle();

  await page.locator('.back-link[href="/support"]').click();
  await expect(page).toHaveURL(/\/support$/);
  await expectSettled(page);
  expect(await oldPage!.evaluate(element => element.isConnected)).toBe(false);
  const supportPage = await page.locator(transitionSelector).elementHandle();

  await page.goBack();
  await expect(page).toHaveURL(/\/support\/transition-probe$/);
  await expectSettled(page);
  expect(await supportPage!.evaluate(element => element.isConnected)).toBe(false);
});

test('reduced motion keeps server-rendered and hydrated content visible', async ({ page, browser, baseURL }) => {
  const staticContext = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(`${baseURL}/support`);
  await expectSettled(staticPage);
  await staticContext.close();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/support');
  await expectSettled(page);
  await page.getByRole('link', { name: 'Auto-Check home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expectSettled(page);
});
