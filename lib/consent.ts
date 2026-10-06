import { createHash } from 'node:crypto';

export const CURRENT_TERMS_VERSION = '2026-10-06';

/**
 * Creates a privacy-preserving SHA-256 hash of an IP address using an application salt.
 * Ensures IP addresses are never stored in plaintext while enabling fraud/dispute audit trails.
 */
export function hashConsentIp(ip: string | null | undefined, salt?: string): string {
  const normalized = (ip ?? '127.0.0.1').trim().split(',')[0].trim();
  const effectiveSalt = salt ?? process.env.CONSENT_IP_SALT ?? 'autocheck-consent-salt-v1';
  return createHash('sha256')
    .update(`${effectiveSalt}:${normalized}`)
    .digest('hex');
}

export interface ConsentValidationResult {
  ok: boolean;
  error?: 'TERMS_ACCEPTANCE_REQUIRED' | 'INVALID_TERMS_VERSION';
  version: string;
  acceptedAt?: string;
}

/**
 * Validates buyer agreement to the required terms and refund policy.
 */
export function validateTermsConsent(
  body: Record<string, unknown>,
  options?: { isProduction?: boolean }
): ConsentValidationResult {
  const isProduction = options?.isProduction ?? process.env.NODE_ENV === 'production';
  const accepted = body.terms_accepted;
  const version = body.terms_version;

  if (accepted === false) {
    return { ok: false, error: 'TERMS_ACCEPTANCE_REQUIRED', version: CURRENT_TERMS_VERSION };
  }

  if (typeof version === 'string' && version !== CURRENT_TERMS_VERSION) {
    return { ok: false, error: 'INVALID_TERMS_VERSION', version: CURRENT_TERMS_VERSION };
  }

  if (isProduction && accepted !== true) {
    return { ok: false, error: 'TERMS_ACCEPTANCE_REQUIRED', version: CURRENT_TERMS_VERSION };
  }

  return {
    ok: true,
    version: typeof version === 'string' ? version : CURRENT_TERMS_VERSION,
    acceptedAt: new Date().toISOString(),
  };
}
