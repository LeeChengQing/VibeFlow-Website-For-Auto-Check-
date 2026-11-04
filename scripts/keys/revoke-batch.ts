export interface RevokeBatchResult {
  batchId: string;
  revokedCount: number;
  reason: string;
}

export function buildRevokeBatchQuery(batchId: string, reason: string): { sql: string; params: any[] } {
  return {
    sql: `
      update public.license_keys
      set status = 'revoked',
          revoked_reason = $2,
          updated_at = now()
      where batch_id = $1
        and status not in ('revoked', 'refunded');
    `,
    params: [batchId, reason],
  };
}
