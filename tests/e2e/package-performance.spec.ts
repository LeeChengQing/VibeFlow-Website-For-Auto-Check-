import { test, expect, type Page } from '@playwright/test';

// Parent rerenders create new JSX props for these expensive direct children.
// Compare the committed fibers' props identities without application instrumentation.
async function renderedChildren(page: Page, save = false) {
  return page.evaluate(save => {
    type Fiber = { type?: { name?: string }; memoizedProps: unknown; return?: Fiber; child?: Fiber; sibling?: Fiber; stateNode: { current: Fiber } };
    const element = document.querySelector('.landing')!;
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'))!;
    let fiber = (element as unknown as Record<string, Fiber>)[key];
    while (fiber.return) fiber = fiber.return;
    const props: Record<string, unknown> = {};
    const visit = (node?: Fiber) => {
      if (!node) return;
      const name = node.type?.name;
      if (name && ['HeroPurchaseCard', 'HeroAmbientLogo', 'Showcase'].includes(name)) props[name] = node.memoizedProps;
      visit(node.child); visit(node.sibling);
    };
    visit(fiber.stateNode.current);
    const probe = window as unknown as { savedRenderProps: Record<string, unknown> };
    if (save) probe.savedRenderProps = props;
    return Object.fromEntries(Object.entries(props).map(([name, value]) => [name, value === probe.savedRenderProps[name]]));
  }, save);
}

test('pricing billing changes leave Landing, hero and showcase out of the render cycle', async ({ page, baseURL }) => {
  test.skip(!!baseURL?.endsWith(':3002'), 'Fiber names are a development-only render probe');
  await page.goto('/');
  const pricing = page.locator('#pricing');
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.getByRole('tab', { name: 'Yearly', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await renderedChildren(page, true)).toEqual({ HeroPurchaseCard: true, HeroAmbientLogo: true, Showcase: true });
  await pricing.getByRole('tab', { name: 'Semester', exact: true }).click();
  await expect(pricing.getByRole('button', { name: 'Enable mobile notifications · Semester' })).toBeVisible();
  await expect(pricing.locator('.notification-current-price strong')).toHaveText('11.99');
  expect(await renderedChildren(page)).toEqual({ HeroPurchaseCard: true, HeroAmbientLogo: true, Showcase: true });
});

test('hero expansion animates only compositor properties and keeps keyboard selection usable', async ({ page }) => {
  await page.goto('/');
  const hero = page.locator('.hero-checkout');
  const panels = hero.locator('.mini-bundle-promo-expand,.mini-notification-details-expand');
  for (const panel of await panels.all()) {
    const properties = await panel.evaluate(el => getComputedStyle(el).transitionProperty.split(',').map(p => p.trim()));
    expect(properties.every(property => ['transform', 'opacity', 'none'].includes(property))).toBe(true);
  }
  await hero.getByRole('radio', { name: /Mobile notifications/ }).click();
  await hero.getByRole('tab', { name: 'Yearly', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(hero.getByRole('tab', { name: 'Semester', exact: true })).toHaveAttribute('aria-selected', 'true');
  await hero.getByRole('radio', { name: /Browser extension/ }).click();
  await expect(hero.getByRole('tab')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Buy browser extension' })).toBeVisible();
});

test('support video yields to scrolling and low effects, then resumes when idle', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('.orb-animated');
  const paused = () => video.evaluate(el => (el as HTMLVideoElement).paused);
  await expect.poll(paused).toBe(false);
  // A real sequence of scroll input keeps the shared idle deadline active.
  await page.mouse.move(400, 350);
  await page.mouse.wheel(0, 8);
  await expect.poll(paused, { intervals: [10], timeout: 1000 }).toBe(true);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 8);
    expect(await paused()).toBe(true);
  }
  await expect.poll(paused).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(paused).toBe(true);
  await expect(page.locator('.orb-static')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(paused).toBe(false);
});

test('limited hardware never downloads the support video', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-perf', 'low');
  expect(await page.locator('.orb-animated').getAttribute('src')).toBeNull();
  await expect(page.locator('.orb-static')).toBeVisible();
});

test('storefront email entry retains the document and correct purchase amount before hosted checkout', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => Object.assign(window, { navigationMarker: 'same-document' }));
  const hero = page.locator('.hero-checkout');
  await hero.getByRole('button', { name: 'Get complete bundle' }).click();
  await expect(hero.getByLabel('Delivery email', { exact: true })).toBeVisible();
  await expect(hero).toContainText('RM 30.00');
  expect(await page.evaluate(() => (window as unknown as { navigationMarker?: string }).navigationMarker)).toBe('same-document');
  await hero.getByLabel('Delivery email', { exact: true }).fill('performance@example.com');
  await hero.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(hero.getByRole('button', { name: 'Get complete bundle' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { navigationMarker?: string }).navigationMarker)).toBe('same-document');
});

test('hero selection reuses the static heading while updating the purchase action', async ({ page }) => {
  await page.goto('/');
  const headerUnchanged = (save: boolean) => page.locator('.checkout-product').evaluate((element, save) => {
    type Fiber = { return?: Fiber; child?: Fiber; sibling?: Fiber; memoizedProps: unknown; stateNode: unknown };
    const key = Object.keys(element).find(key => key.startsWith('__reactFiber$'))!;
    let root = (element as unknown as Record<string, Fiber>)[key];
    while (root.return) root = root.return;
    const find = (node?: Fiber): Fiber | undefined => {
      if (!node) return;
      if (node.stateNode === element) return node;
      return find(node.child) ?? find(node.sibling);
    };
    const props = find((root.stateNode as { current: Fiber }).current)!.memoizedProps;
    const probe = window as unknown as { savedHeadingProps: unknown };
    if (save) probe.savedHeadingProps = props;
    return probe.savedHeadingProps === props;
  }, save);
  expect(await headerUnchanged(true)).toBe(true);
  const hero = page.locator('.hero-checkout');
  await hero.getByRole('radio', { name: /Browser extension/ }).click();
  await expect(hero.getByRole('button', { name: 'Buy browser extension' })).toBeVisible();
  expect(await headerUnchanged(false)).toBe(true);
});

test('support is prefetched in production and opens without a document reload', async ({ page, baseURL }) => {
  test.skip(!baseURL?.endsWith(':3002'), 'Next.js enables prefetching only in production');
  const prefetched: string[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/support' && response.request().headers()['next-router-prefetch'] === '1' && response.ok()) prefetched.push(response.url());
  });
  await page.goto('/');
  await expect.poll(() => prefetched.length).toBeGreaterThan(0);
  await page.evaluate(() => Object.assign(window, { navigationMarker: 'prefetched-document' }));
  await page.locator('.support-orb').click();
  await expect(page).toHaveURL(/\/support$/);
  await expect(page.getByRole('heading', { name: 'Let’s sort it out.' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { navigationMarker?: string }).navigationMarker)).toBe('prefetched-document');
});

test('persistent support video pauses for a route transition at the top of the page', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('.orb-animated');
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
  const pausedDuringClick = await page.locator('.support-orb').evaluate(link => {
    (link as HTMLAnchorElement).click();
    return (document.querySelector('.orb-animated') as HTMLVideoElement).paused;
  });
  expect(pausedDuringClick).toBe(true);
  await expect(page).toHaveURL(/\/support$/);
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
});

test('ambient video yields immediately to a hero package change', async ({ page }) => {
  await page.goto('/');
  const video = page.locator('.orb-animated');
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
  const pausedDuringClick = await page.locator('.hero-checkout').getByRole('radio', { name: /Browser extension/ }).evaluate(button => {
    (button as HTMLButtonElement).click();
    return (document.querySelector('.orb-animated') as HTMLVideoElement).paused;
  });
  expect(pausedDuringClick).toBe(true);
  await expect.poll(() => video.evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
});

test('hero package details and purchase action fit desktop and mobile', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.hero-line').last()).toHaveCSS('transform', 'none');
  const hero = page.locator('.hero-checkout');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const product of [/Complete experience bundle/, /Browser extension/, /Mobile notifications/]) {
      await hero.getByRole('radio', { name: product }).click();
      const fits = await hero.evaluate(card => {
        const button = card.querySelector('.hero-checkout-footer .button')!;
        return button.getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom;
      });
      expect(fits).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await hero.screenshot({ path: testInfo.outputPath(`hero-${width}.png`) });
  }
});
