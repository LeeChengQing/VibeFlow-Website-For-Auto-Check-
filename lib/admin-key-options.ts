import type { ActivationKeyPlan, ActivationKeyStatus } from './supabase/admin';

export const PLAN_LABELS = {
  bundle: 'Bundle', semester: 'Semester', yearly: 'Yearly', internal_check: 'Internal check',
} satisfies Record<ActivationKeyPlan, string>;
export const STATUS_LABELS = {
  available: 'Available', redeemed: 'Redeemed', revoked: 'Revoked',
} satisfies Record<ActivationKeyStatus, string>;
export const KEY_PAGE_SIZE = 25;

export function isKeyPlan(value: unknown): value is ActivationKeyPlan {
  return typeof value === 'string' && Object.hasOwn(PLAN_LABELS, value);
}
export function isKeyStatus(value: unknown): value is ActivationKeyStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_LABELS, value);
}

export type AdminKeyView = {
  id: string; hashPrefix: string; plan_type: ActivationKeyPlan; status: ActivationKeyStatus;
  buyer_email: string | null; device_id: string | null; created_at: string; redeemed_at: string | null;
};
export type DashboardData = {
  summary: { total: number; available: number; redeemed: number; plans: Record<ActivationKeyPlan, number> };
  keys: AdminKeyView[]; matchingCount: number; page: number; pageCount: number;
  plan: ActivationKeyPlan | ''; status: ActivationKeyStatus | '';
};
export type ActionError = { error: string };
