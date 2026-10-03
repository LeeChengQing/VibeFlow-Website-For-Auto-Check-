import { test, expect } from '@playwright/test';
import { createPaidOrder } from './helpers/orders';

test('home, checkout and paid order have no horizontal overflow at target widths', async ({ page, request }) => {
  test.setTimeout(120000);
  const paid = await createPaidOrder(request, 'bundle', 'en');
  const checkout = await request.post('/api/checkout', { headers: { Origin: 'http://127.0.0.1:3001' }, data: { plan: 'bundle', locale: 'en' } });
  const { url: checkoutUrl } = await checkout.json();
  const routes = ['/', checkoutUrl, paid.url];
  for (const width of [1366, 1536, 1920, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      const report = await page.evaluate(() => {
        const offenders = [...document.querySelectorAll('body *')].map(el => ({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className : '',
          right: Math.round(el.getBoundingClientRect().right),
          left: Math.round(el.getBoundingClientRect().left),
        })).filter(el => el.right > innerWidth + 1 || el.left < -1).slice(0, 12);
        return { width: document.documentElement.scrollWidth, viewport: innerWidth, offenders };
      });
      expect(report.width, `${route} at ${width}px: ${JSON.stringify(report.offenders)}`).toBeLessThanOrEqual(report.viewport);
    }
  }
});
