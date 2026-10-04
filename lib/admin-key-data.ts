import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isKeyPlan, isKeyStatus, KEY_PAGE_SIZE, PLAN_LABELS, type DashboardData } from '@/lib/admin-key-options';

export type AdminSearchParams = Record<string, string | string[] | undefined>;

export async function getAdminDashboardData(params: AdminSearchParams): Promise<DashboardData> {
  const db = await getSupabaseAdmin();
  const plan = isKeyPlan(params.plan) ? params.plan : '';
  const status = isKeyStatus(params.status) ? params.status : '';
  const requestedPage = typeof params.page === 'string' && /^[1-9]\d{0,5}$/.test(params.page)
    ? Number(params.page) : 1;
  const countQuery = () => db.from('key_inventory').select('id', { count: 'exact', head: true });
  const plans = Object.keys(PLAN_LABELS) as (keyof typeof PLAN_LABELS)[];
  let matchingQuery = countQuery();
  if (plan) matchingQuery = matchingQuery.eq('plan_type', plan);
  if (status) matchingQuery = matchingQuery.eq('status', status);

  const results = await Promise.all([
    countQuery(), countQuery().eq('status', 'available'),
    db.from('issued_licenses').select('id', { count: 'exact', head: true }),
    ...plans.map(value => countQuery().eq('plan_type', value)), matchingQuery,
  ]);
  if (results.some(result => result.error || result.count === null)) throw new Error('ADMIN_DATA_UNAVAILABLE');
  const counts = results.map(result => result.count!);
  const matchingCount = counts[7];
  const pageCount = Math.max(1, Math.ceil(matchingCount / KEY_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * KEY_PAGE_SIZE;
  // The unique inventory_id FK embeds one license object (or null), with LEFT JOIN
  // semantics so unassigned stock remains visible. No creation timestamp exists
  // in this schema; UUID ordering provides deterministic pagination.
  let query = db.from('key_inventory')
    .select('id,key_hash,plan_type,status,issued_licenses(id,buyer_email,device_id,activated_at,status)')
    .order('id', { ascending: false });
  if (plan) query = query.eq('plan_type', plan);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.range(offset, offset + KEY_PAGE_SIZE - 1);
  if (error || !data) throw new Error('ADMIN_DATA_UNAVAILABLE');

  return {
    summary: { total: counts[0], available: counts[1], redeemed: counts[2],
      plans: { bundle: counts[3], semester: counts[4], yearly: counts[5], internal_check: counts[6] } },
    keys: data.map(row => ({
      id: row.id, hashPrefix: row.key_hash.slice(0, 12), plan_type: row.plan_type, status: row.status,
      license_id: row.issued_licenses?.id ?? null,
      license_status: row.issued_licenses?.status ?? null,
      buyer_email: row.issued_licenses?.buyer_email ?? null,
      device_id: row.issued_licenses?.device_id ?? null,
      activated_at: row.issued_licenses?.activated_at ?? null,
    })),
    matchingCount, page, pageCount, plan, status,
  };
}
