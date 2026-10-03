'use server';

import { revalidatePath } from 'next/cache';
import { runSiteOperation, type OperationResult } from '@/lib/site-operations';
import { recordSiteActivity } from '@/lib/site-settings';

export async function operationAction(action: unknown, id: unknown, payload: unknown = {}): Promise<OperationResult> {
  try {
    const message = await runSiteOperation(action, id, payload);
    // An audit failure must not invite a duplicate refund/reply after a successful mutation.
    let activitySaved = true;
    try { await recordSiteActivity(`operations.${String(action)}`, `${message} Record: ${String(id)}`); }
    catch { activitySaved = false; }
    revalidatePath('/admin');
    revalidatePath('/admin/management');
    return { ok: true, message: activitySaved ? message : `${message} Activity logging is temporarily unavailable.` };
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    const messages: Record<string, string> = {
      UNAUTHORIZED: 'Your session expired. Sign in again.',
      LOCAL_ONLY: 'Orders and support operations are available only in the local preview.',
      INVALID_OPERATION: 'Choose a valid operation and record.',
      INVALID_EMAIL: 'Enter a valid email address.',
      INVALID_TEXT: 'Write a reply between 1 and 4,000 characters.',
      INVALID_STATE: 'This record changed or cannot perform that operation. Refresh and try again.',
      TICKET_CLOSED: 'Reopen the ticket before replying.',
      NOT_FOUND: 'The record could not be found. Refresh and try again.',
    };
    return { error: Object.hasOwn(messages, code) ? messages[code] : 'Could not update the record. Refresh and try again.' };
  }
}
