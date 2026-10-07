import { sendAdminAlert, AlertSeverity } from './admin-alert';

export interface ReconciliationAnomaly {
  type: 'PAID_ORDER_UNFULFILLED' | 'ORPHANED_LICENSE' | 'LOW_STOCK_WARNING';
  id?: string;
  plan?: string;
  message: string;
}

export interface ReconciliationReport {
  timestamp: string;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  stockByPlan: Record<string, number>;
  totalAvailableStock: number;
  anomalies: ReconciliationAnomaly[];
}

export interface ReconcileOptions {
  lowStockThreshold?: number;
  trackedPlans?: string[];
  adminAlert?: boolean;
  adminTopic?: string;
  fetchFn?: typeof fetch;
}

export async function runDailyReconciliation(
  db: any,
  options: ReconcileOptions = {}
): Promise<ReconciliationReport> {
  const threshold = options.lowStockThreshold ?? 10;
  const now = new Date().toISOString();
  const anomalies: ReconciliationAnomaly[] = [];

  // 1. Query available inventory by plan
  const stockByPlan: Record<string, number> = {};
  let totalStock = 0;

  let stockRows: any[] = [];
  if (typeof db.query === 'function') {
    const res = await db.query(
      `select plan_type, count(*)::integer as count
       from public.key_inventory
       where status = 'available'
       group by plan_type`
    );
    stockRows = res.rows || [];
  } else if (typeof db.from === 'function') {
    const { data } = await db
      .from('key_inventory')
      .select('plan_type')
      .eq('status', 'available');
    const counts: Record<string, number> = {};
    for (const r of data || []) counts[r.plan_type] = (counts[r.plan_type] || 0) + 1;
    stockRows = Object.entries(counts).map(([plan_type, count]) => ({ plan_type, count }));
  }

  for (const row of stockRows) {
    const count = Number(row.count);
    stockByPlan[row.plan_type] = count;
    totalStock += count;
  }

  // Check required plan stock levels
  const trackedPlans = options.trackedPlans || ['core', 'semester', 'yearly', 'bundle'];
  for (const plan of trackedPlans) {
    const current = stockByPlan[plan] || 0;
    if (current < threshold) {
      anomalies.push({
        type: 'LOW_STOCK_WARNING',
        plan,
        message: `Inventory low for plan '${plan}': ${current} available (threshold: ${threshold})`,
      });
    }
  }

  // 2. Query paid orders that lack an active issued license
  let unfulfilledRows: any[] = [];
  if (typeof db.query === 'function') {
    const res = await db.query(
      `select o.id, o.reference, o.buyer_email, o.plan
       from public.orders as o
       left join public.issued_licenses as l on o.id = l.order_id
       where o.status = 'paid' and (l.id is null or l.status <> 'active')`
    );
    unfulfilledRows = res.rows || [];
  } else if (typeof db.from === 'function') {
    const { data: paidOrders } = await db
      .from('orders')
      .select('id, reference, buyer_email, plan')
      .eq('status', 'paid');
    for (const order of paidOrders || []) {
      const { data: license } = await db
        .from('issued_licenses')
        .select('id, status')
        .eq('order_id', order.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!license) unfulfilledRows.push(order);
    }
  }

  for (const order of unfulfilledRows) {
    anomalies.push({
      type: 'PAID_ORDER_UNFULFILLED',
      id: order.id,
      plan: order.plan,
      message: `Paid order ${order.reference} (${order.id}) missing active license`,
    });
  }

  // 3. Query orphaned licenses (pointing to non-existent orders)
  let orphanedRows: any[] = [];
  if (typeof db.query === 'function') {
    const res = await db.query(
      `select l.id, l.order_id
       from public.issued_licenses as l
       left join public.orders as o on l.order_id = o.id
       where o.id is null`
    );
    orphanedRows = res.rows || [];
  }

  for (const lic of orphanedRows) {
    anomalies.push({
      type: 'ORPHANED_LICENSE',
      id: lic.id,
      message: `Issued license ${lic.id} points to non-existent order ${lic.order_id}`,
    });
  }

  // 4. Compute overall status
  let overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
  if (unfulfilledRows.length > 0 || orphanedRows.length > 0) {
    overallStatus = 'CRITICAL';
  } else if (anomalies.length > 0) {
    overallStatus = 'WARNING';
  }

  const report: ReconciliationReport = {
    timestamp: now,
    status: overallStatus,
    stockByPlan,
    totalAvailableStock: totalStock,
    anomalies,
  };

  // 5. Dispatch admin alert if anomalies detected
  if (overallStatus !== 'HEALTHY' && options.adminAlert !== false && (options.adminTopic || process.env.ADMIN_NTFY_TOPIC)) {
    const severity: AlertSeverity = overallStatus === 'CRITICAL' ? 'critical' : 'warn';
    await sendAdminAlert({
      severity,
      title: `Daily Reconciliation ${overallStatus}`,
      message: `${anomalies.length} anomaly(ies) detected. Unfulfilled orders: ${unfulfilledRows.length}, Stock: ${JSON.stringify(stockByPlan)}`,
      adminTopic: options.adminTopic,
      fetchFn: options.fetchFn,
    });
  }

  return report;
}
