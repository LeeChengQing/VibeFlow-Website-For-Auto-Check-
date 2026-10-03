import { expect, type APIRequestContext } from '@playwright/test';

export async function createPaidOrder(request: APIRequestContext, plan: string, locale: 'zh' | 'en' = 'zh', origin = 'http://127.0.0.1:3001') {
  const created = await request.post('/api/checkout', { headers: { Origin: origin }, data: { plan, locale } });
  expect(created.status()).toBe(200);
  const { url, reference } = await created.json();
  const token = url.split('/').pop() as string;
  const completed = await request.post(`/api/orders/${token}`, { headers: { Origin: origin }, data: { action: 'complete', email: `receipt-${plan}-${locale}@example.com` } });
  expect(completed.status()).toBe(200);
  const orderResponse = await request.get(`/api/orders/${token}`);
  const order = await orderResponse.json();
  return { url: `/order/${token}`, token, reference: reference as string, email: order.email as string, paidAt: order.paidAt as string };
}
