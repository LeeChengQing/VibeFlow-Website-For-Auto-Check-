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

test('hero purchase card keeps CTA and ambient toggle in a padded flow footer', async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
    { width: 820, height: 1180 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#hero-ambient-toggle-slot .ambient-toggle').waitFor();

    const layout = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>('.hero-checkout');
      const cta = card?.querySelector<HTMLElement>('.buy-action button');
      const pause = card?.querySelector<HTMLElement>('.ambient-toggle');
      const footer = card?.querySelector<HTMLElement>('.hero-checkout-footer');
      if (!card || !cta || !pause) return {
        missing: [!card && 'card', !cta && 'CTA', !pause && 'pause toggle'].filter(Boolean),
        cardClasses: card?.className ?? null,
        buttons: [...(card?.querySelectorAll('button') ?? [])].map(button => button.className),
        ambientToggleCount: document.querySelectorAll('.ambient-toggle').length,
      };
      const cardBounds = card.getBoundingClientRect();
      const ctaBounds = cta.getBoundingClientRect();
      const pauseBounds = pause.getBoundingClientRect();
      const cardStyle = getComputedStyle(card);
      const cardBottomPadding = Number.parseFloat(cardStyle.paddingBottom);
      return {
        display: cardStyle.display,
        flexDirection: cardStyle.flexDirection,
        overflow: cardStyle.overflow,
        cardPosition: cardStyle.position,
        ctaPosition: getComputedStyle(cta).position,
        pausePosition: getComputedStyle(pause).position,
        footerContainsBoth: Boolean(footer?.contains(cta) && footer.contains(pause)),
        ctaClearsPadding: ctaBounds.bottom <= cardBounds.bottom - cardBottomPadding + 1,
        pauseBelowCta: pauseBounds.top >= ctaBounds.bottom + 4,
        pauseClearsPadding: pauseBounds.bottom <= cardBounds.bottom - cardBottomPadding + 1,
      };
    });

    expect(layout).toMatchObject({
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      cardPosition: 'relative',
      ctaPosition: 'static',
      pausePosition: 'static',
      footerContainsBoth: true,
      ctaClearsPadding: true,
      pauseBelowCta: true,
      pauseClearsPadding: true,
    });
  }
});
