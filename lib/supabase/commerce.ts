import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { AdminDatabase } from './admin';

/** Private server client; callers must validate checkout input or a webhook signature. */
export function getCommerceDatabase() {
  const raw = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!raw || !key) throw new Error('COMMERCE_NOT_CONFIGURED');
  const url = new URL(raw);
  const local = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('COMMERCE_NOT_CONFIGURED');
  }
  return createClient<AdminDatabase>(url.origin, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
