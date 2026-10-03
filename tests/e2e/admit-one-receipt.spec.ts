import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { createPaidOrder } from './helpers/orders';

test('paid receipt exposes the order ticket and a View Your Ticket action', async ({ page, request }) => {
  const origin = 'http://127.0.0.1:3001';
  const created = await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'bundle', locale: 'en' } });
  const { url } = await created.json();
  const token = url.split('/').pop();
  await request.post(`/api/orders/${token}`, { headers: { Origin: origin }, data: { action: 'complete', email: 'admit-one@example.com' } });
  await page.goto(`/order/${token}?replay=1`);

  await expect(page.getByRole('button', { name: 'View Your Ticket' })).toBeVisible();
  await expect(page.locator('.admit-one-ticket')).toContainText('Soton Auto-Check');
  await expect(page.locator('.admit-one-ticket')).toContainText('VF-');
  const ticket = page.locator('.admit-one-ticket');
  const box = await ticket.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs(box!.width / box!.height - 741 / 425)).toBeLessThan(0.08);
  await page.getByRole('button', { name: 'View Your Ticket' }).click();
  await expect(page.getByRole('dialog', { name: 'View Your Ticket' })).toBeVisible();
  await expect(page.locator('.admit-one-ticket')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Your Ticket' })).toBeFocused();
  for (const width of [640, 390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const card = page.locator('.admit-one-ticket');
    const bounds = await card.boundingBox();
    expect(bounds).not.toBeNull();
    expect(Math.abs(bounds!.width / bounds!.height - 741 / 425)).toBeLessThan(0.08);
    expect(await card.locator('h2').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
    expect(await card.locator('footer').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  }
});

test('non-paid orders do not show an admission ticket', async ({ page, request }) => {
  const created = await request.post('/api/checkout', { headers: { Origin: 'http://127.0.0.1:3001' }, data: { plan: 'extension', locale: 'en' } });
  const { url } = await created.json();
  await page.goto(url.replace('/checkout/', '/order/'));
  await expect(page.locator('.admit-one-ticket')).toHaveCount(0);
  await expect(page.locator('.order-plain-card')).toBeVisible();
});

test('new checkout rejects retired plan and degree period inputs', async ({ request }) => {
  const headers = { Origin: 'http://127.0.0.1:3001' };
  const retired = await request.post('/api/checkout', { headers, data: { plan: 'mobile_notification_degree_pass', locale: 'en' } });
  expect(retired.status()).toBe(400);
  const degreePeriod = await request.post('/api/checkout', { headers, data: { plan: 'mobile_notification', period: 'degree', locale: 'en' } });
  expect(degreePeriod.status()).toBe(400);
});

test('stored legacy orders render with a neutral label and keep their delivery data', async ({ page, request }) => {
  const origin = 'http://127.0.0.1:3001';
  const created = await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'mobile_notification', locale: 'en' } });
  const { url } = await created.json(); const token = url.split('/').pop();
  await request.post(`/api/orders/${token}`, { headers: { Origin: origin }, data: { action: 'complete', email: 'legacy@example.com' } });
  const response = await request.get(`/api/orders/${token}`); const order = await response.json();
  const db = new DatabaseSync('.local/e2e.sqlite');
  order.plan = 'mobile_notification_degree_pass';
  db.prepare('UPDATE orders SET data=? WHERE token=?').run(JSON.stringify(order), token);
  db.close();
  await page.goto(`/order/${token}`);
  await expect(page.locator('.admit-one-ticket')).toContainText('Degree Pass');
  await expect(page.locator('.admit-one-ticket')).toContainText('legacy');
  await expect(page.locator('.delivery-preview')).toContainText('DEMO-');
  await expect(page.locator('.receipt-counted-amount')).toHaveText('RM 11.99');
});

test('unsupported WebGL keeps the CSS graphite ticket visible without page errors', async ({ page, request }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext as unknown as (kind: string, options?: unknown) => RenderingContext | null;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: function (kind: string, options?: unknown) {
      if (kind === 'webgl2') return null;
      return original.call(this, kind, options);
    } });
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const order = await createPaidOrder(request, 'bundle', 'en');
  await page.goto(order.url);
  await expect(page.locator('.admit-one-ticket')).toBeVisible();
  await expect(page.locator('.admit-one-ticket canvas')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'View Your Ticket' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('capture localized hero, both billing periods, and checkout across viewport matrix', async ({ page, request }) => {
  test.setTimeout(240000);
  mkdirSync('.local/admit-one-screenshots', { recursive: true });
  await page.addInitScript(() => {
    const locale = new URL(location.href).searchParams.get('locale');
    if (locale === 'zh' || locale === 'en') localStorage.setItem('vf-locale', locale);
  });
  for (const locale of ['zh', 'en'] as const) {
    const created = await request.post('/api/checkout', { headers: { Origin: 'http://127.0.0.1:3001' }, data: { plan: 'bundle', locale } });
    const { url } = await created.json();
    for (const [width, height] of [[1366,768],[1440,900],[1536,864],[1920,1080],[390,844]] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?locale=${locale}`);
      await expect(page.locator('.hero-checkout')).toBeVisible();
      await page.locator('.hero-checkout').screenshot({ path: `.local/admit-one-screenshots/hero-${locale}-${width}x${height}.png` });
      await page.locator('#pricing').scrollIntoViewIfNeeded();
      for (const [period, label] of (locale === 'zh' ? [['semester','学期'],['yearly','年付']] : [['semester','Semester'],['yearly','Yearly']]) as [string,string][]) {
        const card = page.locator('.price-card.featured');
        await card.getByRole('tab', { name: label }).click();
        await card.screenshot({ path: `.local/admit-one-screenshots/pricing-${locale}-${period}-${width}x${height}.png` });
      }
      await page.goto(url);
      await expect(page.locator('.checkout-panel')).toBeVisible();
      await page.screenshot({ path: `.local/admit-one-screenshots/checkout-${locale}-${width}x${height}.png` });
    }
  }
});
