export interface KeyStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  byPlan: Record<string, number>;
  byBatch: Record<string, number>;
}

export function computeKeyStats(rows: Array<{
  status?: string;
  channel?: string;
  plan_code?: string;
  batch_id?: string;
}>): KeyStats {
  const stats: KeyStats = {
    total: rows.length,
    byStatus: {},
    byChannel: {},
    byPlan: {},
    byBatch: {},
  };

  for (const r of rows) {
    const status = r.status || 'unknown';
    const channel = r.channel || 'unknown';
    const plan = r.plan_code || 'unknown';
    const batch = r.batch_id || 'unassigned';

    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    stats.byChannel[channel] = (stats.byChannel[channel] || 0) + 1;
    stats.byPlan[plan] = (stats.byPlan[plan] || 0) + 1;
    stats.byBatch[batch] = (stats.byBatch[batch] || 0) + 1;
  }

  return stats;
}
