import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const fixture = 'http://127.0.0.1:54330';
test.beforeEach(async ({ request }) => { await request.post(`${fixture}/__reset`); });
async function login(page: import('@playwright/test').Page) {
  await page.goto('/admin');
  await page.getByLabel('Admin password', { exact: true }).fill('admin-browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Key Inventory', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'Key inventory', exact: true })).toBeVisible();
}

test('login, filtered inventory, one-time copy/CSV, closure and logout', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
  await page.getByLabel('Admin password', { exact: true }).fill('wrong-password');
  const started = Date.now();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Incorrect password');
  expect(Date.now() - started).toBeGreaterThanOrEqual(1950);
  await login(page);
  await expect(page.getByRole('main').getByTestId('total-count')).toHaveText('32');
  await expect(page.locator('tbody:visible tr')).toHaveCount(25);
  await page.getByRole('heading', { name: 'Key inventory', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.local/admin-dashboard-desktop.png', fullPage: true });
  await page.getByRole('link', { name: 'Next', exact: true }).click();
  await expect(page.locator('tbody:visible tr')).toHaveCount(7);
  await expect(page.getByRole('navigation', { name: 'Key inventory pagination' })).toContainText('Previous');
  await page.getByLabel('Filter by plan').selectOption('yearly');
  await page.getByLabel('Filter by status').selectOption('redeemed');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/plan=yearly.*status=redeemed/);
  await expect(page.locator('tbody:visible tr')).toHaveCount(1);
  await expect(page.getByRole('main').getByTestId('total-count')).toHaveText('32');
  await page.getByLabel('Provisioning plan').selectOption('semester');
  await page.getByLabel('Number of keys').fill('3');
  await page.getByRole('button', { name: 'Generate keys', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const plaintext = await dialog.getByLabel('Generated activation codes').inputValue();
  const codes = plaintext.split('\n');
  expect(codes).toHaveLength(3);
  codes.forEach(code => expect(code).toMatch(/^AC-(?:[0-9A-F]{4}-){11}[0-9A-F]{4}$/));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy to Clipboard' }).click();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(plaintext);
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download as CSV' }).click();
  const download = await downloaded;
  expect(await readFile((await download.path())!, 'utf8')).toBe('code,plan_type\r\n' + codes.map(code => `${code},semester`).join('\r\n') + '\r\n');
  await page.screenshot({ path: '.local/admin-codes-modal.png' });
  const stored = await (await request.get(`${fixture}/__rows`)).json();
  expect(stored).toHaveLength(35);
  expect(JSON.stringify(stored)).not.toContain('AC-');
  await dialog.getByLabel('I have saved these codes').check();
  await dialog.getByRole('button', { name: 'Close and discard codes' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('main').getByTestId('total-count')).toHaveText('35');
  expect(await page.locator('body').textContent()).not.toContain(codes[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: 'Key inventory', exact: true }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: '.local/admin-dashboard-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Key inventory', exact: true })).not.toBeVisible();
});

test('failed provisioning and reads show safe states without revealing secrets', async ({ page, request }) => {
  await login(page);
  await request.post(`${fixture}/__fail-insert`);
  await page.getByRole('button', { name: 'Generate keys', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Could not create');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await request.post(`${fixture}/__fail-read`);
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Inventory is unavailable');
  expect(await page.locator('body').textContent()).not.toMatch(/private-database|service-role-only/);
});

test('local demo moved and production cookies never authorize local APIs', async ({ page, request }) => {
  await login(page);
  expect((await page.request.get('/api/admin')).status()).toBe(401);
  await page.getByRole('link', { name: 'Local demo' }).click();
  await expect(page).toHaveURL(/\/admin\/local$/);
  await expect(page.getByLabel('Admin password', { exact: true })).toBeVisible();
});

test('codes survive a read failure but unauthorized action replay cannot create more', async ({ page, context, request }) => {
  await login(page);
  await request.post(`${fixture}/__fail-read`);
  const submitted = page.waitForRequest(req => req.method() === 'POST' && Boolean(req.headers()['next-action']));
  await page.getByRole('button', { name: 'Generate keys', exact: true }).click();
  const actionRequest = await submitted;
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Inventory is unavailable');
  const code = await dialog.getByLabel('Generated activation codes').inputValue();
  expect(code).toMatch(/^AC-/);
  await context.clearCookies();
  const replay = await page.request.post('/admin', {
    headers: { 'next-action': actionRequest.headers()['next-action'],
      'content-type': actionRequest.headers()['content-type'], origin: 'http://127.0.0.1:3103' },
    data: actionRequest.postDataBuffer()!,
  });
  expect(await replay.text()).not.toContain('AC-');
  expect(await (await request.get(`${fixture}/__rows`)).json()).toHaveLength(33);
  page.on('dialog', alert => { void alert.accept(); });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Admin access' })).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain(code);
});
