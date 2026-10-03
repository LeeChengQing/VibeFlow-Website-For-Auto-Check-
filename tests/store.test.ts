import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
process.env.LOCAL_DB_PATH = join(mkdtempSync(join(tmpdir(), 'vibeflow-test-')), 'test.sqlite');
let store: typeof import('../lib/store');
before(async () => { store = await import('../lib/store'); });

test('server fixes prices regardless of client price input', () => {
  const o = store.createOrder({ plan: 'extension', locale: 'zh' });
  assert.equal(o.amount, 2499);
  assert.equal(store.createOrder({ plan: 'mobile_notification', locale: 'en' }).amount, 1199);
  assert.throws(() => store.createOrder({ plan: 'combo', locale: 'zh' }));
});
test('retired Degree Pass inputs are rejected while legacy orders remain readable', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { plans, getOrderPlanDisplay } = await import('../lib/plans');
  const yearly = store.createOrder({ plan: 'mobile_notification_yearly', locale: 'en' });
  assert.equal(yearly.amount, 1999);
  assert.match(plans.mobile_notification_yearly.en, /Yearly/);
  assert.equal(store.createOrder({ plan: 'mobile_notification', locale: 'zh' }).amount, 1199);
  assert.throws(() => store.createOrder({ plan: 'mobile_notification_degree_pass', locale: 'zh' }), /INVALID_PLAN/);
  assert.throws(() => store.createOrder({ plan: 'mobile_notification', locale: 'zh', period: 'degree' } as never), /INVALID_PLAN/);

  const oldOrder = { ...yearly, id: 'legacy-degree', reference: 'VF-LEGACY', token: 'legacy-token', plan: 'mobile_notification_degree_pass' as const, amount: 4999 };
  const db = new DatabaseSync(process.env.LOCAL_DB_PATH!);
  db.prepare('INSERT INTO orders (id,token,reference,data) VALUES (?,?,?,?)').run(oldOrder.id, oldOrder.token, oldOrder.reference, JSON.stringify(oldOrder));
  db.close();
  const restored = store.getOrder(oldOrder.token);
  assert.equal(restored?.reference, oldOrder.reference);
  assert.equal(restored?.amount, 4999);
  assert.equal(restored?.status, oldOrder.status);
  assert.equal(getOrderPlanDisplay(restored!.plan, 'en').name, 'Degree Pass (legacy)');
});
test('unpaid orders have no delivery and invalid email does not charge', () => {
  const o = store.createOrder({ plan: 'extension', locale: 'zh' });
  assert.equal(o.delivery, null);
  assert.throws(() => store.completeOrder(o.token, 'bad'));
  assert.equal(store.getOrder(o.token)?.status, 'pending');
});
test('duplicate successful checkout fulfills once with seven day expiry', () => {
  const o = store.createOrder({ plan: 'extension', locale: 'en' });
  const paid = store.completeOrder(o.token, ' TEST@example.com ');
  assert.equal(paid.status, 'paid');
  assert.equal(paid.email, 'test@example.com');
  assert.ok(paid.delivery);
  assert.equal(new Date(paid.expiresAt!).getTime() - new Date(paid.paidAt!).getTime(), 7 * 86400000);
  assert.deepEqual(store.completeOrder(o.token, 'test@example.com').delivery, paid.delivery);
  assert.equal(store.listOrders().filter(x => x.id === o.id).length, 1);
});
test('mobile demo key is stable across duplicate completion', () => {
  const o = store.createOrder({ plan: 'mobile_notification', locale: 'zh' });
  const first = store.completeOrder(o.token, 'a@example.com');
  assert.match(first.delivery!, /^DEMO-/);
  assert.equal(store.completeOrder(o.token, 'a@example.com').delivery, first.delivery);
});
test('cancelled and refunded orders cannot be completed or delivered', () => {
  const o = store.createOrder({ plan: 'extension', locale: 'zh' });
  assert.equal(store.cancelOrder(o.token).status, 'cancelled');
  assert.throws(() => store.completeOrder(o.token, 'a@example.com'));
  const paid = store.createOrder({ plan: 'extension', locale: 'zh' });
  store.completeOrder(paid.token, 'a@example.com');
  const refunded = store.refundOrder(paid.id);
  assert.equal(refunded.delivery, null);
  assert.equal(refunded.status, 'refunded');
  assert.throws(() => store.resendOrder(paid.id));
});
test('order-linked tickets require matching email and random token access', () => {
  const o = store.createOrder({ plan: 'extension', locale: 'zh' });
  store.completeOrder(o.token, 'a@example.com');
  assert.throws(() => store.createTicket({ email:'other@example.com', reference:o.reference, subject:'Help', message:'Need some help', locale:'en' }));
  const t = store.createTicket({ email:'a@example.com', reference:o.reference, subject:'Help', message:'Need some help', locale:'en' });
  assert.equal(store.getTicket('wrong'), undefined);
  assert.equal(store.getTicket(t.token)?.messages.length, 1);
  store.replyTicket(t.id, 'We can help you.', 'admin');
  assert.equal(store.getTicket(t.token)?.messages[1].author, 'admin');
  store.closeTicket(t.id);
  assert.equal(store.getTicket(t.token)?.status, 'closed');
  assert.throws(() => store.replyTicket(t.id, 'again', 'customer'));
});
test('resend validates corrected email and refreshes delivery expiry', () => {
  const o = store.createOrder({plan:'extension', locale:'en'});
  store.completeOrder(o.token, 'a@example.com');
  assert.throws(() => store.resendOrder(o.id, 'invalid'));
  const resent = store.resendOrder(o.id, 'new@example.com');
  assert.equal(resent.email, 'new@example.com');
  assert.equal(resent.resends, 1);
});
test('expired delivery is hidden by server reads, and resend restores the preview',()=>{
  const o=store.createOrder({plan:'extension',locale:'en'});
  const paid=store.completeOrder(o.token,'expiry@example.com');
  const db=new DatabaseSync(process.env.LOCAL_DB_PATH!);
  paid.expiresAt=new Date(Date.now()-1000).toISOString();
  db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify(paid),paid.id);db.close();
  assert.equal(store.getOrder(o.token)?.delivery,null);
  store.resendOrder(o.id);assert.ok(store.getOrder(o.token)?.delivery);
});
test('orders persist when a separate application process reads the same database',()=>{
  const o=store.createOrder({plan:'extension',locale:'en'});
  const child=spawnSync(process.execPath,['--import','tsx','--input-type','module','-e',`import {getOrder} from './lib/store.ts'; console.log(getOrder(${JSON.stringify(o.token)})?.reference);`],{cwd:process.cwd(),env:process.env,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),o.reference);
});
