import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireAdminSession } from '@/lib/admin-auth';

export type ActivationKeyPlan = 'bundle' | 'semester' | 'yearly' | 'internal_check';
export type ActivationKeyStatus = 'available' | 'redeemed' | 'revoked';

export type ActivationKeyRow = {
  id: string;
  key_hash: string;
  plan_type: ActivationKeyPlan;
  status: ActivationKeyStatus;
  buyer_email: string | null;
  device_id: string | null;
  redeemed_at: string | null;
  created_at: string;
};

type ActivationKeyInsert = {
  key_hash: string;
  plan_type: ActivationKeyPlan;
} & Partial<Omit<ActivationKeyRow, 'key_hash' | 'plan_type'>>;

type AdminDatabase = {
  public: {
    Tables: {
      activation_keys: {
        Row: ActivationKeyRow;
        Insert: ActivationKeyInsert;
        Update: Partial<ActivationKeyRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
