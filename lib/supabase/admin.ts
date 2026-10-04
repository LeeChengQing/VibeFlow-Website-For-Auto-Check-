import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '@/lib/admin-auth';

export type ActivationKeyPlan = 'bundle' | 'extension' | 'semester' | 'yearly' | 'internal_check';
export type KeyInventoryStatus = 'available' | 'assigned';
export type IssuedLicenseStatus = 'active' | 'revoked';
export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded';

export type KeyInventoryRow = {
  id: string;
  key_hash: string;
  encrypted_key: string | null;
  plan_type: ActivationKeyPlan;
  status: KeyInventoryStatus;
};

export type IssuedLicenseRow = {
  id: string;
  order_id: string;
  inventory_id: string;
  buyer_email: string;
  plan_type: ActivationKeyPlan;
  device_id: string | null;
  status: IssuedLicenseStatus;
  activated_at: string | null;
  expires_at: string | null;
};

export type OrderRow = {
  id: string;
  reference: string;
  buyer_email: string;
  plan: ActivationKeyPlan;
  amount_minor: number;
  currency: string;
  status: OrderStatus;
  payment_provider: string;
  provider_payment_id: string | null;
  paid_at: string | null;
  provider_request_id: string | null;
  payment_confirmed_at: string | null;
  fulfillment_error: 'INVENTORY_EXHAUSTED' | null;
};

export type KeyInventoryInsert = Pick<KeyInventoryRow, 'key_hash' | 'encrypted_key' | 'plan_type'> &
  Partial<Pick<KeyInventoryRow, 'id' | 'status'>>;
export type IssuedLicenseInsert = Pick<IssuedLicenseRow, 'order_id' | 'inventory_id' | 'buyer_email' | 'plan_type'> &
  Partial<Pick<IssuedLicenseRow, 'id' | 'device_id' | 'status' | 'activated_at' | 'expires_at'>>;
export type OrderInsert = Omit<OrderRow, 'id' | 'status' | 'provider_payment_id' | 'paid_at' | 'provider_request_id' | 'payment_confirmed_at' | 'fulfillment_error'> &
  Partial<Pick<OrderRow, 'id' | 'status' | 'provider_payment_id' | 'paid_at' | 'provider_request_id' | 'payment_confirmed_at' | 'fulfillment_error'>>;

export type AdminDatabase = {
  public: {
    Tables: {
      key_inventory: {
        Row: KeyInventoryRow;
        Insert: KeyInventoryInsert;
        Update: Partial<KeyInventoryRow>;
        Relationships: [];
      };
      issued_licenses: {
        Row: IssuedLicenseRow;
        Insert: IssuedLicenseInsert;
        Update: Partial<IssuedLicenseRow>;
        Relationships: [
          {
            foreignKeyName: 'issued_licenses_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: true;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'issued_licenses_inventory_id_fkey';
            columns: ['inventory_id'];
            isOneToOne: true;
            referencedRelation: 'key_inventory';
            referencedColumns: ['id'];
          },
        ];
      };
      orders: {
        Row: OrderRow;
        Insert: OrderInsert;
        Update: Partial<OrderRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      assign_available_key: { Args: { p_order_id: string }; Returns: string | null };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) throw new Error('SUPABASE_ADMIN_NOT_CONFIGURED');

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('SUPABASE_ADMIN_NOT_CONFIGURED');
  }
  const localHttp = process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('SUPABASE_ADMIN_NOT_CONFIGURED');
  }
  return { url: parsed.origin, serviceRoleKey };
}

/** Obtain only within a request; authorization precedes privileged DB access. */
export async function getSupabaseAdmin() {
  await requireAdminSession();
  const { url, serviceRoleKey } = supabaseConfig();
  return createClient<AdminDatabase>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
}
