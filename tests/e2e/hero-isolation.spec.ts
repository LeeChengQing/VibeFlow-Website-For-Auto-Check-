import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
test(`package selection preserves the hero text and canvas at ${viewport.width}px`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => {
    const probe = window as unknown as { heroCanvasResizes: number };
    probe.heroCanvasResizes = 0;
    for (const property of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property)!;
      Object.defineProperty(HTMLCanvasElement.prototype, property, {
        ...descriptor,
        set(value: number) {
          if ((this as HTMLCanvasElement).closest('.hero-ambient')) probe.heroCanvasResizes++;
          descriptor.set!.call(this, value);
        },
      });
    }
  });
  await page.goto('/');
  const canvas = page.locator('.hero-ambient canvas');
  await expect(canvas).toBeAttached();
  await expect(page.locator('.hero-line').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('[data-page-transition]')).toHaveCSS('transform', 'none');
  await page.waitForTimeout(300);
  const background = await canvas.elementHandle();
  const text = await page.locator('.hero-copy').elementHandle();
  const geometry = () => page.locator('.hero-copy').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top + scrollY, height: rect.height };
  });
  const initial = await geometry();
  await page.evaluate(() => { (window as unknown as { heroCanvasResizes: number }).heroCanvasResizes = 0; });

  const card = page.locator('.hero-checkout');
  for (const name of [/Browser extension/, /Mobile notifications/, /Complete experience bundle/]) {
    await card.getByRole('radio', { name }).click();
    await expect(card.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(450);
    const next = await geometry();
    expect(Math.abs(next.top - initial.top)).toBeLessThan(1);
    expect(next.height).toBe(initial.height);
    expect(await background!.evaluate(element => element.isConnected)).toBe(true);
    expect(await text!.evaluate(element => element.isConnected)).toBe(true);
  }
  expect(await page.evaluate(() => (window as unknown as { heroCanvasResizes: number }).heroCanvasResizes)).toBe(0);
});
}

test('the isolated hero still follows language changes without replacing its canvas', async ({ page }) => {
  await page.goto('/');
  const canvas = await page.locator('.hero-ambient canvas').elementHandle();
  expect(canvas).not.toBeNull();
  await page.getByRole('button', { name: '切换中文' }).click();
  await expect(page.locator('#hero-title')).toHaveAttribute('aria-label', '一次配置， 告别签到遗漏。');
  await expect(page.locator('.hero-checkout').getByRole('radio', { name: /浏览器扩展/ })).toBeVisible();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.locator('#hero-title')).toHaveAttribute('aria-label', 'Set it up. Stay on track.');
});
