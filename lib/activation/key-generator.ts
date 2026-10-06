import { randomBytes, createHmac } from 'node:crypto';

// Crockford Base32 Alphabet (32 chars)
// Excludes I, L, O, U to avoid confusion
export const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Modulo-37 Check Symbols for Crockford Check Digit (exactly 37 characters, 0-36)
export const CHECK_SYMBOLS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U';

/**
 * Computes the Modulo-37 check symbol for a 20-character Crockford Base32 payload.
 */
export function computeCheckDigit(canonicalPayload: string): string {
  let value = 0n;
  for (let i = 0; i < canonicalPayload.length; i++) {
    const char = canonicalPayload[i];
    const index = BigInt(CROCKFORD_ALPHABET.indexOf(char));
    if (index === -1n) {
      throw new Error(`Invalid Crockford character in payload: ${char}`);
    }
    value = (value * 32n + index) % 37n;
  }
  return CHECK_SYMBOLS[Number(value)];
}

/**
 * Normalizes input key: removes dashes, spaces, converts to uppercase,
 * maps ambiguous characters ('O' -> '0', 'I'/'L' -> '1').
 */
export function canonicalizeKey(rawKey: string): string {
  if (!rawKey) return '';
  let clean = rawKey
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return clean;
}

/**
 * Generates a v2 Crockford Base32 license key with ≥ 100 bits entropy and a mod-37 check digit.
 * Format: XXXXX-XXXXX-XXXXX-XXXXX-C (25 characters with dashes, 21 chars without).
 */
export function generateV2Key(): string {
  // 13 bytes = 104 bits > 100 bits
  const bytes = randomBytes(13);
  let bits = 0n;
  for (let i = 0; i < bytes.length; i++) {
    bits = (bits << 8n) | BigInt(bytes[i]);
  }

  // Extract 20 Base32 characters (100 bits)
  let chars = '';
  for (let i = 0; i < 20; i++) {
    const symbolIndex = Number(bits & 31n);
    chars += CROCKFORD_ALPHABET[symbolIndex];
    bits >>= 5n;
  }

  const checkDigit = computeCheckDigit(chars);
  const full = chars + checkDigit;

  // Format into XXXXX-XXXXX-XXXXX-XXXXX-C
  return `${full.slice(0, 5)}-${full.slice(5, 10)}-${full.slice(10, 15)}-${full.slice(15, 20)}-${full.slice(20)}`;
}

/**
 * Validates formatting and mod-37 check digit of a key.
 */
export function validateKeyFormat(key: string): boolean {
  const clean = canonicalizeKey(key);
  if (clean.length !== 21) {
    return false;
  }

  const payload = clean.slice(0, 20);
  const checkChar = clean.slice(20);

  // Validate payload characters
  for (let i = 0; i < payload.length; i++) {
    if (!CROCKFORD_ALPHABET.includes(payload[i])) {
      return false;
    }
  }

  try {
    const expectedCheck = computeCheckDigit(payload);
    return checkChar === expectedCheck;
  } catch {
    return false;
  }
}

/**
 * Computes the HMAC-SHA256 hash of a canonicalized key using KEY_HMAC_SECRET (hash_version=2).
 */
export function computeKeyHmac(key: string, secret: string): string {
  if (!secret) {
    throw new Error('KEY_HMAC_SECRET is required to compute key HMAC');
  }
  const clean = canonicalizeKey(key);
  return createHmac('sha256', secret).update(clean).digest('hex');
}
