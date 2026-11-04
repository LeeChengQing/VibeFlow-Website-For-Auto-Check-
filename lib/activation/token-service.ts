import { generateKeyPairSync, sign, verify } from 'node:crypto';

export interface TokenClaims {
  sub: string;               // key_id
  did: string;               // device_id_hash
  plan: string;              // 'core' | 'bundle' | 'semester' | 'yearly'
  feat: string[];            // ['core', 'phone_notify']
  iat: number;               // issued at (seconds)
  exp: number;               // expiration (seconds, default 7 days)
  ver: number;               // token version (2)
  min_app?: string;          // minimum supported app version
}

export interface TokenVerificationResult {
  status: 'valid' | 'grace_period' | 'expired' | 'invalid';
  allowed: boolean;
  claims?: TokenClaims;
  kid?: string;
  error?: string;
}

export interface KeyPairResult {
  kid: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

/**
 * Generates an Ed25519 key pair with a designated key identifier (kid).
 */
export function generateEd25519KeyPair(kid: string): KeyPairResult {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    kid,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
  };
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/**
 * Signs claims into a compact Ed25519 JWS token (alg: EdDSA).
 */
export function signActivationToken(
  claims: TokenClaims,
  privateKeyPem: string,
  kid: string
): string {
  const header = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = sign(null, Buffer.from(signingInput, 'utf8'), privateKeyPem);
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifies an Ed25519 JWS token against a keyring of public keys (keyed by kid).
 * Evaluates expiration and 72-hour offline grace period.
 */
export function verifyActivationToken(
  token: string,
  keyring: Record<string, string>,
  options: {
    nowSec?: number;
    gracePeriodSec?: number;
    allowOfflineGrace?: boolean;
  } = {}
): TokenVerificationResult {
  if (!token || typeof token !== 'string') {
    return { status: 'invalid', allowed: false, error: 'Empty or malformed token' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { status: 'invalid', allowed: false, error: 'Token must have exactly 3 parts' };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg: string; typ?: string; kid?: string };
  let claims: TokenClaims;

  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
    claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return { status: 'invalid', allowed: false, error: 'Failed to parse token header or claims' };
  }

  if (header.alg !== 'EdDSA') {
    return { status: 'invalid', allowed: false, error: `Unsupported algorithm: ${header.alg}` };
  }

  const kid = header.kid;
  if (!kid || !keyring[kid]) {
    return { status: 'invalid', allowed: false, error: `Unknown or unconfigured kid: ${kid}` };
  }

  const publicKeyPem = keyring[kid];
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  const signature = base64UrlDecode(signatureB64);

  let isSignatureValid = false;
  try {
    isSignatureValid = verify(null, signingInput, publicKeyPem, signature);
  } catch {
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    return { status: 'invalid', allowed: false, error: 'Signature verification failed' };
  }

  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);
  const gracePeriodSec = options.gracePeriodSec ?? 72 * 3600; // 72 hours default

  if (nowSec <= claims.exp) {
    return { status: 'valid', allowed: true, claims, kid };
  }

  // Token is expired: check grace period
  if (nowSec <= claims.exp + gracePeriodSec) {
    return {
      status: 'grace_period',
      allowed: true,
      claims,
      kid,
      error: 'Token has expired but is within the 72-hour offline grace period',
    };
  }

  return {
    status: 'expired',
    allowed: false,
    claims,
    kid,
    error: 'Token and grace period have expired',
  };
}

/**
 * Loads the activation public keyring from environment configuration.
 */
export function getActivationKeyring(): Record<string, string> {
  if (process.env.ED25519_KEYRING_JSON) {
    try {
      return JSON.parse(process.env.ED25519_KEYRING_JSON);
    } catch {
      // fallback
    }
  }
  const currentKid = process.env.ED25519_CURRENT_KID || 'kid-2026-v1';
  const pubPem = process.env.ED25519_PUBLIC_KEY_PEM || '';
  if (pubPem) {
    return { [currentKid]: pubPem };
  }
  return {};
}

