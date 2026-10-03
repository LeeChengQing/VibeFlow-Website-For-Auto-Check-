import { expect, test, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

async function measureTicket(page: Page) {
  return page.evaluate(() => new Promise<{ entrance: number[]; idle: number[]; longTasks: number[] }>(resolve => {
    const entrance: number[] = []; const idle: number[] = []; const longTasks: number[] = [];
    const startedAt = performance.now(); let previous = startedAt;
    let observer: PerformanceObserver | undefined;
    try { observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); }); observer.observe({ type: 'longtask', buffered: true }); } catch { /* unsupported in this browser */ }
    const sample = (time: number) => {
      const elapsed = time - startedAt; const interval = time - previous; previous = time;
      if (elapsed <= 1600) entrance.push(interval);
      if (elapsed >= 2500 && elapsed <= 5500) idle.push(interval);
      if (elapsed >= 5500) { observer?.disconnect(); resolve({ entrance, idle, longTasks }); return; }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}

function summarize(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { frames: values.length, p95FrameMs: Number((sorted[Math.floor(Math.max(0, sorted.length - 1) * 0.95)] ?? 0).toFixed(2)), framesOver20ms: values.filter(value => value > 20).length };
}

function seedPaidOrder() {
  const now = new Date(); const token = randomBytes(32).toString('hex');
  const order = {
    id: randomUUID(), token, reference: `VF-PERF-${randomBytes(4).toString('hex').toUpperCase()}`,
    plan: 'bundle', amount: 3000, locale: 'en', email: 'perf@example.com', status: 'paid',
    createdAt: now.toISOString(), paidAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString(),
    delivery: 'DEMO-PERFORMANCE-KEY', resends: 0,
  };
  return { url: `/order/${token}`, order };
}

test('ticket entrance and idle frame budget at normal and 4x CPU with paid-route JS transfer', async ({ page, request }) => {
  test.setTimeout(60000);
  const session = await page.context().newCDPSession(page);
  const readings: Record<string, unknown> = {};
  for (const [label, rate] of [['normal', 1], ['4x', 4]] as const) {
    await session.send('Emulation.setCPUThrottlingRate', { rate });
    const fixture = seedPaidOrder();
    await page.route(`**/api/orders/${fixture.order.token}`, route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture.order) }));
    await page.goto(`${fixture.url}?replay=1`, { waitUntil: 'networkidle' });
    await expect(page.locator('.admit-one-ticket')).toBeVisible();
    const transfer = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/_next/static/') && entry.name.endsWith('.js')) as PerformanceResourceTiming[];
      const unique = new Map(entries.map(entry => [entry.name, entry.transferSize || entry.encodedBodySize]));
      return [...unique.values()].reduce((sum, bytes) => sum + bytes, 0);
    });
    const measured = await measureTicket(page);
    const entrance = summarize(measured.entrance); const idle = summarize(measured.idle);
    readings[label] = { entrance, idle, longTaskCount: measured.longTasks.length, longTaskTotalMs: Number(measured.longTasks.reduce((sum, value) => sum + value, 0).toFixed(2)), jsTransferBytes: transfer };
  }
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await session.detach();
  console.log(`[admit-one-perf] ${JSON.stringify({ baselineTransferBytes: 207966, readings })}`);
  const normal = readings.normal as { entrance: { p95FrameMs: number }; idle: { p95FrameMs: number; frames: number } };
  expect(normal.entrance.p95FrameMs).toBeLessThanOrEqual(16.7);
  expect(normal.idle.frames).toBeGreaterThan(100);
});
