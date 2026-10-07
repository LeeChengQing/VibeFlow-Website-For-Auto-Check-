import { sendNtfyNotification, NtfyError } from './ntfy-adapter';

export interface WorkerOptions {
  batchSize?: number;
  serverUrl?: string;
  authToken?: string;
  fetchFn?: typeof fetch;
}

export interface WorkerResult {
  processed: number;
  sent: number;
  dropped: number;
  expired: number;
  failed: number;
}

export async function processNotificationQueue(
  db: any,
  options: WorkerOptions = {}
): Promise<WorkerResult> {
  const batchSize = options.batchSize || 10;
  const result: WorkerResult = {
    processed: 0,
    sent: 0,
    dropped: 0,
    expired: 0,
    failed: 0,
  };

  // 1. Claim batch of queued notifications
  let items: any[] = [];
  if (typeof db.query === 'function') {
    const res = await db.query(
      `select * from public.claim_queued_notifications($1)`,
      [batchSize]
    );
    items = res.rows || [];
  } else if (typeof db.rpc === 'function') {
    const { data } = await db.rpc('claim_queued_notifications', {
      p_batch_size: batchSize,
    });
    items = data || [];
  }

  result.processed = items.length;

  for (const item of items) {
    const now = Date.now();

    // 2. Check TTL expiration
    if (item.expires_at && new Date(item.expires_at).getTime() <= now) {
      await markComplete(db, item.id, 'expired', 'NOTIFICATION_EXPIRED');
      result.expired++;
      continue;
    }

    // 3. Double authorization check: verify entitlement is still active
    let entitlement: any = null;
    if (typeof db.query === 'function') {
      const entRes = await db.query(
        `select status, notify_topic from public.entitlements where id = $1`,
        [item.entitlement_id]
      );
      if (entRes.rows.length > 0) entitlement = entRes.rows[0];
    } else if (typeof db.from === 'function') {
      const { data } = await db
        .from('entitlements')
        .select('status, notify_topic')
        .eq('id', item.entitlement_id)
        .maybeSingle();
      entitlement = data;
    }

    if (!entitlement || entitlement.status !== 'active') {
      await markComplete(db, item.id, 'dropped', 'ENTITLEMENT_INACTIVE');
      result.dropped++;
      continue;
    }

    const topic = item.notify_topic || entitlement.notify_topic;
    if (!topic) {
      await markComplete(db, item.id, 'dropped', 'MISSING_NOTIFY_TOPIC');
      result.dropped++;
      continue;
    }

    // 4. Dispatch to ntfy adapter
    try {
      await sendNtfyNotification({
        topic,
        title: item.title,
        message: item.body,
        serverUrl: options.serverUrl,
        authToken: options.authToken,
        fetchFn: options.fetchFn,
      });

      await markComplete(db, item.id, 'sent', null);
      result.sent++;
    } catch (err: any) {
      const isRetryable = err instanceof NtfyError ? err.isRetryable : true;
      const status = isRetryable ? 'failed' : 'dropped';
      await markComplete(db, item.id, status, err.message || 'Dispatch failure');
      if (isRetryable) {
        result.failed++;
      } else {
        result.dropped++;
      }
    }
  }

  return result;
}

async function markComplete(
  db: any,
  id: string,
  status: string,
  lastError: string | null
): Promise<void> {
  if (typeof db.query === 'function') {
    await db.query(
      `select public.complete_notification($1, $2, $3)`,
      [id, status, lastError]
    );
  } else if (typeof db.rpc === 'function') {
    await db.rpc('complete_notification', {
      p_id: id,
      p_status: status,
      p_last_error: lastError,
    });
  }
}
