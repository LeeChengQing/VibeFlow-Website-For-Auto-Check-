import 'server-only';

import { requireAdminSession } from '@/lib/admin-auth';
import { isLocalAdminPreview } from '@/lib/admin-local';
import type { Order, Ticket } from '@/lib/types';

export type SiteOperationsData = { local: boolean; orders: Order[]; tickets: Ticket[] };
export type SiteOperation = 'resend' | 'refund' | 'reply' | 'close' | 'reopen';
export type OperationPayload = { email?: string; message?: string };
export type OperationResult = { ok: true; message: string } | { error: string };

export async function getSiteOperations(): Promise<SiteOperationsData> {
  await requireAdminSession();
  if (!await isLocalAdminPreview()) return { local: false, orders: [], tickets: [] };
  const store = await import('@/lib/store');
  return { local: true, orders: store.listOrders(), tickets: store.listTickets() };
}

export function validateOperation(action: unknown, id: unknown, input: unknown): { action: SiteOperation; id: string; payload: OperationPayload } {
  if (!['resend', 'refund', 'reply', 'close', 'reopen'].includes(String(action)) ||
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

/** Every entry point authenticates before loading the local database. */
export async function runSiteOperation(action: unknown, id: unknown, input: unknown = {}): Promise<string> {
  await requireAdminSession();
  if (!await isLocalAdminPreview()) throw new Error('LOCAL_ONLY');
  const operation = validateOperation(action, id, input);
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
    case 'reply': store.replyTicket(operation.id, operation.payload.message, 'admin'); return 'Reply saved to the local support ticket.';
    case 'close': store.closeTicket(operation.id); return 'Local support ticket closed.';
    case 'reopen': store.reopenTicket(operation.id); return 'Local support ticket reopened.';
  }
}
