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
  const countQuery = () => db.from('activation_keys').select('id', { count: 'exact', head: true });
  const plans = Object.keys(PLAN_LABELS) as (keyof typeof PLAN_LABELS)[];
  let matchingQuery = countQuery();
  if (plan) matchingQuery = matchingQuery.eq('plan_type', plan);
  if (status) matchingQuery = matchingQuery.eq('status', status);

  const results = await Promise.all([
    countQuery(), countQuery().eq('status', 'available'), countQuery().eq('status', 'redeemed'),
    ...plans.map(value => countQuery().eq('plan_type', value)), matchingQuery,
  ]);
  if (results.some(result => result.error || result.count === null)) throw new Error('ADMIN_DATA_UNAVAILABLE');
  const counts = results.map(result => result.count!);
  const matchingCount = counts[7];
  const pageCount = Math.max(1, Math.ceil(matchingCount / KEY_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const offset = (page - 1) * KEY_PAGE_SIZE;
  let query = db.from('activation_keys')
    .select('id,key_hash,plan_type,status,buyer_email,device_id,created_at,redeemed_at')
    .order('created_at', { ascending: false }).order('id', { ascending: false });
  if (plan) query = query.eq('plan_type', plan);
  if (status) query = query.eq('status', status);
  const { data, error } = await query.range(offset, offset + KEY_PAGE_SIZE - 1);
  if (error || !data) throw new Error('ADMIN_DATA_UNAVAILABLE');

  return {
    summary: { total: counts[0], available: counts[1], redeemed: counts[2],
      plans: { bundle: counts[3], semester: counts[4], yearly: counts[5], internal_check: counts[6] } },
    keys: data.map(({ key_hash, ...row }) => ({ ...row, hashPrefix: key_hash.slice(0, 12) })),
    matchingCount, page, pageCount, plan, status,
  };
}
