import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

/** 24 random bytes = 192 bits; formatting preserves every bit. */
export function generateActivationCode(): string {
  const hex = randomBytes(24).toString('hex').toUpperCase();
  return `AC-${hex.match(/.{4}/g)!.join('-')}`;
}

/** Validators must use this same canonical form: trimmed, uppercase, hyphens retained. */
export function hashActivationCode(code: string): string {
  const canonical = code.trim().toUpperCase();
  if (!/^AC-(?:[0-9A-F]{4}-){11}[0-9A-F]{4}$/.test(canonical)) {
    throw new Error('INVALID_ACTIVATION_CODE');
  }
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
