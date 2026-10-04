import type { ActivationKeyPlan, KeyInventoryStatus, IssuedLicenseStatus } from './supabase/admin';

export const PLAN_LABELS = {
  bundle: 'Bundle', semester: 'Semester', yearly: 'Yearly', internal_check: 'Internal check', extension: 'Extension',
} satisfies Record<ActivationKeyPlan, string>;
export const STATUS_LABELS = {
  available: 'Available', assigned: 'Assigned',
} satisfies Record<KeyInventoryStatus, string>;
export const LICENSE_STATUS_LABELS = { active: 'Active', revoked: 'Revoked' } satisfies Record<IssuedLicenseStatus, string>;
export const KEY_PAGE_SIZE = 25;

export function isKeyPlan(value: unknown): value is ActivationKeyPlan {
  return typeof value === 'string' && Object.hasOwn(PLAN_LABELS, value);
}
export function isKeyStatus(value: unknown): value is KeyInventoryStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_LABELS, value);
}

export type AdminKeyView = {
  id: string; hashPrefix: string; plan_type: ActivationKeyPlan; status: KeyInventoryStatus;
  license_id: string | null; license_status: IssuedLicenseStatus | null;
  buyer_email: string | null; device_id: string | null; activated_at: string | null;
};
export type DashboardData = {
  summary: { total: number; available: number; redeemed: number; plans: Record<ActivationKeyPlan, number> };
  keys: AdminKeyView[]; matchingCount: number; page: number; pageCount: number;
  plan: ActivationKeyPlan | ''; status: KeyInventoryStatus | '';
};
export type ActionError = { error: string };
