import type { OrderPlanCode, Locale } from './plans';
export type Order = { id: string; reference: string; token: string; plan: OrderPlanCode; amount: number; locale: Locale; email: string; status: 'pending'|'paid'|'cancelled'|'refunded'; createdAt: string; paidAt: string|null; expiresAt: string|null; delivery: string|null; resends: number; extensionRelease?: { assetId: string; label: string } | null };
export type Message = { id: string; author: 'admin'|'customer'; body: string; createdAt: string };
export type Ticket = { id: string; token: string; reference: string; email: string; subject: string; locale: Locale; status: 'open'|'closed'; createdAt: string; messages: Message[] };
