import { test, expect, type Page } from '@playwright/test';
import { createPaidOrder } from '../e2e/helpers/orders';
import { DatabaseSync } from 'node:sqlite';

const origin = 'http://127.0.0.1:3103';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGLsAAAAASUVORK5CYII=', 'base64');
const zip = Buffer.from('504b0506000000000000000000000000000000000000', 'hex');
test.beforeEach(async ({ request }) => { await request.post('http://127.0.0.1:54330/__reset'); });

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin password', { exact: true }).fill('admin-browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
async function section(page: Page, name: string) {
  await page.getByRole('navigation', { name: 'Site management sections' }).getByRole('button', { name, exact: false }).click();
  await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
}
async function publish(page: Page, note: string) {
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish saved draft' });
  await dialog.getByLabel('Publication note').fill(note);
  await dialog.getByRole('button', { name: 'Publish now', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeVisible();
}

test('draft preview, published pricing, guides, release delivery, rollback and checkout switches', async ({ page, context, request }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await login(page);
  await section(page, 'Pricing & Offers');
  await page.getByLabel('Enable promotional offer', { exact: true }).check();
  await page.getByLabel('Starts · Malaysia time').fill('2020-01-01T00:00');
  await page.getByLabel('Ends · Malaysia time').fill('2099-01-01T00:00');
  const bundle = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Complete experience bundle', exact: true }) });
  await bundle.getByLabel('Regular price (RM)', { exact: true }).fill('41.50');
  await bundle.getByLabel('Promotional price (RM)', { exact: true }).fill('32.10');
  // Dirty edits cannot be silently lost by switching sections.
  await page.getByRole('navigation', { name: 'Site management sections' }).getByRole('button', { name: 'Content' }).click();
  await expect(page.getByRole('dialog', { name: 'Unsaved changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await save(page);
  await section(page, 'Content');
  await page.getByLabel('Headline line 1 · English', { exact: true }).fill('A managed storefront.');
  await save(page);
  const preview = await context.newPage();
  await preview.goto('/admin/preview');
  await expect(preview.locator('.hero-copy h1')).toContainText('A managed storefront.');
  await expect(preview.locator('.mini-bundle-price b')).toHaveText('RM 32.10');
  const live = await context.newPage();
  await live.goto('/');
  await expect(live.locator('.hero-copy h1')).not.toContainText('A managed storefront.');
  await expect(live.locator('.mini-bundle-price b')).toHaveText('RM 30.00');
  await preview.close();
  await section(page, 'Guides');
  const guide = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Chrome extension · Windows', exact: true }) });
  await guide.getByLabel('Replace guide image', { exact: true }).setInputFiles({ name: 'setup.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('status').filter({ hasText: 'Upload complete.' })).toBeVisible();
  const assetSrc = await guide.locator('img').getAttribute('src');
  expect(assetSrc).toMatch(/^\/api\/site\/assets\/[0-9a-f-]{36}$/);
  expect((await request.get(assetSrc!)).status()).toBe(404);
  expect((await page.request.get(assetSrc!)).status()).toBe(200);
  await guide.getByLabel('Guide title · English', { exact: true }).fill('Updated installation guide');
  await page.getByLabel('Image alternative text · English', { exact: true }).first().fill('New setup instructions');
  await save(page);
  await section(page, 'Site Settings');
  await page.getByLabel('Upload extension ZIP', { exact: true }).setInputFiles({ name: 'extension.zip', mimeType: 'application/x-zip-compressed', buffer: zip });
  await expect(page.getByRole('status').filter({ hasText: 'Upload complete.' })).toBeVisible();
  await save(page);
  await publish(page, 'Managed pricing, copy, guide and release');
  expect((await request.get(assetSrc!)).status()).toBe(200);
  await live.reload();
  await expect(live.locator('.hero-copy h1')).toContainText('A managed storefront.');
  await expect(live.locator('.mini-bundle-price b')).toHaveText('RM 32.10');
  await expect(live.getByRole('button', { name: /Updated installation guide/ })).toBeVisible();
  const paid = await createPaidOrder(request, 'bundle', 'en', origin);
  const order = await (await request.get(`/api/orders/${paid.token}`)).json();
  expect(order.amount).toBe(3210);
  expect(order.extensionRelease.label).toBe('extension.zip');
  expect((await request.get(`/api/site/assets/${order.extensionRelease.assetId}`)).status()).toBe(404);
  const delivered = await request.get(`/api/site/download/${paid.token}`);
  expect(delivered.status()).toBe(200);
  expect(await delivered.body()).toEqual(zip);
  // Hiding countdown does not change prices; switching the offer off does.
  await section(page, 'Pricing & Offers');
  await page.getByLabel('Show offer countdown', { exact: true }).uncheck();
  await save(page); await publish(page, 'Hide countdown');
  await live.reload();
  await expect(live.locator('.mini-bundle-countdown')).toHaveCount(0);
  await expect(live.locator('.mini-bundle-price b')).toHaveText('RM 32.10');
  await page.getByLabel('Enable promotional offer', { exact: true }).uncheck();
  await save(page); await publish(page, 'Offer off');
  await live.reload();
  await expect(live.locator('.mini-bundle-price b')).toHaveText('RM 41.50');
  const next = await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'bundle', locale: 'en', amount: 1 } });
  expect(next.status()).toBe(200);
  const nextToken = (await next.json()).url.split('/').pop();
  expect((await (await request.get(`/api/orders/${nextToken}`)).json()).amount).toBe(4150);
  expect((await (await request.get(`/api/orders/${paid.token}`)).json()).amount).toBe(3210);
  await section(page, 'Site Settings');
  await page.getByLabel('Enable checkout', { exact: true }).uncheck();
  await save(page); await publish(page, 'Pause checkout');
  expect((await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'bundle' } })).status()).toBe(400);
  // A history restore affects draft only until explicitly published.
  await section(page, 'History');
  const initial = page.locator('article').filter({ hasText: 'Initial website' });
  await initial.getByRole('button', { name: 'Restore to draft', exact: true }).click();
  await page.getByRole('dialog', { name: 'Restore publication to draft' }).getByRole('button', { name: 'Restore to draft', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Version restored to draft.' })).toBeVisible();
  expect((await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'bundle' } })).status()).toBe(400);
  await publish(page, 'Restore initial website');
  expect((await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan: 'bundle' } })).status()).toBe(200);
  expect((await request.get(assetSrc!)).status()).toBe(404);
  // Existing paid orders keep their captured release after it is removed from live settings.
  expect((await request.get(`/api/site/download/${paid.token}`)).status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.local/site-management-mobile.png', fullPage: true });
  await live.close();
  expect(errors).toEqual([]);
});

test('local orders/support actions and key revocation share the authenticated workspace', async ({ page, request }) => {
  const paid = await createPaidOrder(request, 'extension', 'en', origin);
  const ticketResponse = await request.post('/api/support', { headers: { Origin: origin }, data: { email: paid.email, reference: paid.reference, subject: 'Managed support test', message: 'Please help with my installation.', locale: 'en' } });
  expect(ticketResponse.status()).toBe(200);
  const ticketToken = (await ticketResponse.json()).url.split('/').pop();
  await login(page);
  await section(page, 'Orders & Support');
  await page.getByRole('button', { name: paid.reference, exact: true }).click();
  await page.getByLabel('Correct delivery email & refresh link').fill('corrected@example.com');
  await page.getByRole('button', { name: 'Refresh local delivery', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Local delivery refreshed' })).toBeVisible();
  expect((await (await request.get(`/api/orders/${paid.token}`)).json()).email).toBe('corrected@example.com');
  await page.getByRole('button', { name: 'Support tickets', exact: true }).click();
  await page.getByRole('button', { name: 'Managed support test', exact: true }).click();
  await page.getByLabel('Reply to customer', { exact: true }).fill('Follow the updated guide in the tutorials section.');
  await page.getByRole('button', { name: 'Save reply', exact: true }).click();
  await expect(page.getByLabel('Ticket conversation')).toContainText('Follow the updated guide');
  await page.getByRole('button', { name: 'Close ticket', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reopen ticket', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reopen ticket', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close ticket', exact: true })).toBeVisible();
  expect((await (await request.get(`/api/support/${ticketToken}`)).json()).status).toBe('open');
  await request.post('http://127.0.0.1:54330/__reset');
  await section(page, 'Key Inventory');
  await page.getByRole('button', { name: 'Revoke', exact: true }).first().click();
  await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const rows = await (await request.get('http://127.0.0.1:54330/__rows')).json();
  expect(rows.filter((row: {status:string}) => row.status === 'revoked')).toHaveLength(3);
});

test('settings outages retain one-time codes and stale sessions cannot overwrite another draft', async ({ page, context, request }) => {
  await login(page);
  await section(page, 'Pricing & Offers');
  const other = await context.newPage();
  await other.goto('/admin');
  await section(other, 'Pricing & Offers');
  const first = page.getByLabel('Regular price (RM)', { exact: true }).first();
  await first.fill('36.00');
  await other.getByLabel('Regular price (RM)', { exact: true }).first().fill('37.00');
  await save(other);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Another change was saved');
  await expect(first).toHaveValue('36.00');
  await page.getByRole('button', { name: 'Reload saved draft' }).click();
  await page.getByRole('button', { name: 'Discard and continue' }).click();
  await expect(first).toHaveValue('37.00');
  await section(page, 'Key Inventory');
  const db = new DatabaseSync(process.env.SITE_MANAGEMENT_TEST_DB!);
  const old = db.prepare('SELECT draft FROM site_state WHERE id=1').get()!.draft as string;
  try {
    await page.route('**/admin', async route => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) db.prepare('UPDATE site_state SET draft=? WHERE id=1').run('{}');
      await route.continue();
    });
    await page.getByRole('button', { name: 'Generate keys', exact: true }).click();
    const codes = page.getByRole('dialog').getByLabel('Generated activation codes');
    await expect(codes).toHaveValue(/^AC-/);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Site settings could not be loaded');
    await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Copy to Clipboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download as CSV' })).toBeVisible();
  } finally {
    db.prepare('UPDATE site_state SET draft=? WHERE id=1').run(old); db.close();
    await page.unroute('**/admin');
  }
  await other.close();
  const guest = await context.browser()!.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(`${origin}/admin/preview`);
  await expect(guestPage).toHaveURL(`${origin}/admin`);
  await guest.close();
});
