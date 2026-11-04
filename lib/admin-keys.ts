import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

/** Use the same AC-LIC format accepted by the canonical activation endpoint. */
export function generateActivationCode(): string {
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw=Array.from(randomBytes(16),b=>alphabet[b%alphabet.length]).join('');
  return `AC-LIC-${raw.match(/.{4}/g)!.join('-')}`;
}

/** Validators must use this same canonical form: trimmed, uppercase, hyphens retained. */
export function hashActivationCode(code: string): string {
  const canonical = code.trim().toUpperCase();
  if (!/^AC-LIC(?:-[A-Z0-9]{4}){4}$/.test(canonical)) {
    throw new Error('INVALID_ACTIVATION_CODE');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
