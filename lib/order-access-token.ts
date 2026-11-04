import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Computes SHA-256 hash of an order capability access token.
 */
export function hashOrderAccessToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Generates a high-entropy random capability access token for order access.
 * The plaintext token is given to the buyer in the return URL and fulfillment email;
 * only the SHA-256 hash is persisted in the database.
 */
export function generateOrderAccessToken(): { token: string; tokenHash: string } {
  // 32 cryptographically secure random bytes encoded as base64url (~43 chars, 256 bits of entropy)
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashOrderAccessToken(token);
  return { token, tokenHash };
}

/**
 * Verifies an order capability token against its expected SHA-256 hash
 * using constant-time comparison to prevent timing side-channels.
 */
export function verifyOrderAccessToken(
  token: string | null | undefined,
  expectedHash: string | null | undefined
): boolean {
  if (!token || !expectedHash) return false;
  const normalizedExpected = expectedHash.trim().toLowerCase();
  if (normalizedExpected.length !== 64) return false;

  const actualHash = hashOrderAccessToken(token);
  try {
    const actualBuf = Buffer.from(actualHash, 'hex');
    const expectedBuf = Buffer.from(normalizedExpected, 'hex');
    if (actualBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
