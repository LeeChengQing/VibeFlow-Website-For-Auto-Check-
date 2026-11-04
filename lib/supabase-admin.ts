import 'server-only';
import { getCommerceDatabase } from './supabase/commerce';

/**
 * Convenience helper returning the privileged service-role database client.
 */
export function getServiceRoleClient(): any {
  return getCommerceDatabase();
}
