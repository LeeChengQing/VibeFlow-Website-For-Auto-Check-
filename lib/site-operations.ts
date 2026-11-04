import 'server-only';

import { requireAdminSession } from '@/lib/admin-auth';
import { isLocalAdminPreview } from '@/lib/admin-local';
import type { Order, Ticket } from '@/lib/types';

export type ProductionOrder = { id: string; buyer_email: string | null; plan: string; amount_minor: number; currency: string; status: string; payment_provider: string; created_at: string; paid_at: string | null; refunded_at: string | null; refund_review: boolean; verification_only: boolean };
export type ProductionMetrics = { total: number; pending: number; paid: number; cancelled: number; refunded: number; verification: number; revenue: Record<string, number> };
export type SiteOperationsData = { local: boolean; source: 'local' | 'production' | 'unavailable'; orders: Order[]; tickets: Ticket[]; support: 'local' | 'unconfigured' | 'unavailable'; metrics?: ProductionMetrics; productionPage?: ProductionOrderPage; error?: string };
export type ProductionOrderPage = { orders: ProductionOrder[]; count: number; page: number };
const orderColumns = 'id,buyer_email,plan,amount_minor,currency,status,payment_provider,created_at,paid_at,refunded_at,refund_review,verification_only';

export async function getProductionOrders(input: { search?: string; status?: string; page?: number } = {}): Promise<ProductionOrderPage> {
  await requireAdminSession();
  const db = getCommerceDb();
  if (!db || typeof db.from !== 'function') throw new Error('ORDERS_UNAVAILABLE');
  const page = Math.max(1, Math.min(100000, Math.floor(Number(input.page) || 1)));
  const status = ['pending', 'paid', 'cancelled', 'refunded'].includes(input.status || '') ? input.status : '';
  const search = String(input.search || '').trim().slice(0, 100).replace(/[^\w@.\-+]/g, '');
  let query = db.from('payment_orders').select(orderColumns, { count: 'exact' });
  if (status) query = query.eq('status', status);
  if (search) query = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(search) ? query.eq('id', search) : query.or(`buyer_email.ilike.%${search}%,plan.ilike.%${search}%`);
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error || count === null) throw new Error('ORDERS_UNAVAILABLE');
  return { orders: data || [], count, page };
}

async function getProductionMetrics(db: any): Promise<ProductionMetrics> {
  const metrics: ProductionMetrics = { total: 0, pending: 0, paid: 0, cancelled: 0, refunded: 0, verification: 0, revenue: {} };
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('payment_orders').select('id,status,amount_minor,currency,paid_at,refunded_at,refund_review,verification_only').order('id').range(offset, offset + 999);
    if (error || !data) throw new Error('ORDERS_UNAVAILABLE');
    for (const row of data) {
      if (row.verification_only) { metrics.verification++; continue; }
      metrics.total++;
      if (row.status === 'pending') metrics.pending++;
      if (row.status === 'paid') metrics.paid++;
      if (row.status === 'cancelled') metrics.cancelled++;
      if (row.status === 'refunded') metrics.refunded++;
      if (row.status === 'paid' && row.paid_at && !row.refunded_at && !row.refund_review) metrics.revenue[row.currency] = (metrics.revenue[row.currency] || 0) + row.amount_minor;
    }
    if (data.length < 1000) break;
  }
  return metrics;
}
export type SiteOperation = 'resend' | 'refund' | 'reply' | 'close' | 'reopen' | 'generate_recovery_link';
export type OperationPayload = { email?: string; message?: string };
export type OperationResult = { ok: true; message: string } | { error: string };

function getCommerceDb(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCommerceDatabase, isCommerceConfigured } = require('@/lib/supabase/commerce');
    if (isCommerceConfigured()) return getCommerceDatabase();
  } catch {}
  return null;
}

export async function getSiteOperations(): Promise<SiteOperationsData> {
  await requireAdminSession();

  const db = getCommerceDb();
  if (db) {
    try {
      const [metrics, page] = await Promise.all([getProductionMetrics(db), getProductionOrders()]);
      return { local: false, source: 'production', support: 'unconfigured', orders: [], tickets: [], metrics, productionPage: page } as SiteOperationsData;
    } catch {
      return { local: false, source: 'production', support: 'unconfigured', orders: [], tickets: [], error: 'Orders could not be loaded. Check the database connection and try again.' };
    }
  }
  if (!await isLocalAdminPreview()) return { local: false, source: 'unavailable', support: 'unavailable', orders: [], tickets: [], error: 'Order database is not configured. Contact the site operator.' };
  const store = await import('@/lib/store');
  return { local: true, source: 'local', support: 'local', orders: store.listOrders(), tickets: store.listTickets() };
}

export function validateOperation(action: unknown, id: unknown, input: unknown): { action: SiteOperation; id: string; payload: OperationPayload } {
  if (!['resend', 'refund', 'reply', 'close', 'reopen', 'generate_recovery_link'].includes(String(action)) ||
      typeof action !== 'string' || typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_OPERATION');
  const raw = input as Record<string, unknown>;
  const payload: OperationPayload = {};
  if (action === 'resend' && raw.email !== undefined) {
    if (typeof raw.email !== 'string' || raw.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim())) throw new Error('INVALID_EMAIL');
    payload.email = raw.email.trim().toLowerCase();
  }
  if (action === 'reply') {
    if (typeof raw.message !== 'string' || !raw.message.trim() || raw.message.trim().length > 4000) throw new Error('INVALID_TEXT');
    payload.message = raw.message.trim();
  }
  return { action: action as SiteOperation, id, payload };
}

/** Every entry point authenticates before loading the database. */
export async function runSiteOperation(action: unknown, id: unknown, input: unknown = {}): Promise<string> {
  await requireAdminSession();
  const db = getCommerceDb();
  if (!db && !await isLocalAdminPreview()) throw new Error('LOCAL_ONLY');
  const operation = validateOperation(action, id, input);

  if (db) throw new Error('LOCAL_ONLY');

  if (!await isLocalAdminPreview()) throw new Error('LOCAL_ONLY');
  const store = await import('@/lib/store');
  switch (operation.action) {
    case 'resend': {
      const order = store.resendOrder(operation.id, operation.payload.email);
      return `Local delivery refreshed for ${order.reference}; no email sent.`;
    }
    case 'refund': {
      const order = store.refundOrder(operation.id);
      return `Simulated refund recorded for ${order.reference}; no money moved.`;
    }
    case 'generate_recovery_link': {
      return `http://127.0.0.1:3000/order/${operation.id}`;
    }
    case 'reply': store.replyTicket(operation.id, operation.payload.message, 'admin'); return 'Reply saved to the local support ticket.';
    case 'close': store.closeTicket(operation.id); return 'Local support ticket closed.';
    case 'reopen': store.reopenTicket(operation.id); return 'Local support ticket reopened.';
  }
}
