'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminSession, deleteAdminSession, requireAdminSession, verifyAdminPassword } from '@/lib/admin-auth';
import { generateActivationCode, hashActivationCode } from '@/lib/admin-keys';
import { encryptLicenseKey } from '@/lib/license-key-encryption';
import { isKeyPlan, type ActionError } from '@/lib/admin-key-options';
import { getSupabaseAdmin, type KeyInventoryInsert } from '@/lib/supabase/admin';

export async function loginAction(password: string): Promise<ActionError> {
  try {
    if (!await verifyAdminPassword(password)) {
      return { error: 'Incorrect password. Please try again.' };
    }
    await createAdminSession();
  } catch {
    return { error: 'Admin sign-in is unavailable. Please contact the site operator.' };
  }
  // redirect throws a framework control-flow exception; keep it outside catch.
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  // Idempotent logout also clears an expired/invalid cookie.
  await deleteAdminSession();
  redirect('/admin');
}

export async function generateKeysAction(plan: string, count: number): Promise<string[] | ActionError> {
  try {
    await requireAdminSession();
    if (!isKeyPlan(plan) || !Number.isInteger(count) || count < 1 || count > 100) {
      return { error: 'Choose a valid plan and a whole number of keys from 1 to 100.' };
    }
    const db = await getSupabaseAdmin();
    const codes = Array.from({ length: count }, generateActivationCode);
    const rows: KeyInventoryInsert[] = codes.map(code => {
      const key_hash = hashActivationCode(code);
      return { key_hash, encrypted_key: encryptLicenseKey(code, key_hash), plan_type: plan, status: 'available' };
    });
    // A single multi-row INSERT is atomic. Do not insert per code or return DB records.
    const { error } = await db.from('key_inventory').insert(rows);
    if (error) return { error: 'Could not create the batch. Please try again.' };
    revalidatePath('/admin');
    return codes;
  } catch (error) {
    return { error: error instanceof Error && error.message === 'UNAUTHORIZED'
      ? 'Your session has expired. Sign in again before creating keys.'
      : 'Key provisioning is unavailable. Please contact the site operator.' };
  }
}
