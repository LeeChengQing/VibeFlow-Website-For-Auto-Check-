import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { cookies } from 'next/headers';

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const FAILED_LOGIN_DELAY_MS = 2_000;
const MAX_PASSWORD_BYTES = 1_024;
const SESSION_PATTERN = /^v1\.(\d{10,13})\.(\d{10,13})\.([0-9a-f]{32})\.([0-9a-f]{64})$/;

export type AdminSession = {
  issuedAt: number;
  expiresAt: number;
};

function authConfig() {
  const password = process.env.ADMIN_DASHBOARD_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const passwordBytes = password === undefined ? 0 : Buffer.byteLength(password, 'utf8');
  if (!password || passwordBytes < 12 || passwordBytes > MAX_PASSWORD_BYTES ||
      !secret || !/^[0-9a-fA-F]{64}$/.test(secret)) {
    throw new Error('ADMIN_NOT_CONFIGURED');
  }
  return {
    passwordDigest: createHash('sha256').update(password, 'utf8').digest(),
    signingKey: Buffer.from(secret, 'hex'),
  };
}

function cookieName() {
  return process.env.NODE_ENV === 'production' ? '__Host-auto_check_admin' : 'auto_check_admin';
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };
}

function sign(payload: string, config: ReturnType<typeof authConfig>) {
  // Bind sessions to both secrets so password rotation also invalidates old cookies.
  return createHmac('sha256', config.signingKey)
    .update('auto-check-admin-session-v1\0')
    .update(config.passwordDigest)
    .update(payload)
    .digest('hex');
}

export async function verifyAdminPassword(value: unknown): Promise<boolean> {
  const config = authConfig();
  const validInput = typeof value === 'string' &&
    Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES;
  const actualDigest = createHash('sha256')
    .update(validInput ? value : '', 'utf8')
    .digest();
  const matches = timingSafeEqual(actualDigest, config.passwordDigest);
  if (!validInput || !matches) {
    await sleep(FAILED_LOGIN_DELAY_MS);
    return false;
  }
  return true;
}

/** Call only after password verification, inside a Server Action or Route Handler. */
export async function createAdminSession(): Promise<void> {
  const config = authConfig();
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const payload = `v1.${issuedAt}.${expiresAt}.${randomBytes(16).toString('hex')}`;
  (await cookies()).set(cookieName(), `${payload}.${sign(payload, config)}`, {
    ...cookieOptions(),
    maxAge: SESSION_TTL_SECONDS,
    expires: new Date(expiresAt * 1_000),
  });
}

/** Cookie mutations must run inside a Server Action or Route Handler. */
export async function deleteAdminSession(): Promise<void> {
  (await cookies()).set(cookieName(), '', {
    ...cookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const config = authConfig();
  const value = (await cookies()).get(cookieName())?.value;
  if (!value || value.length > 256) return null;

  const match = SESSION_PATTERN.exec(value);
  if (!match) return null;
  const [, issued, expires, nonce, signature] = match;
  const payload = `v1.${issued}.${expires}.${nonce}`;
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(payload, config), 'hex'))) {
    return null;
  }

  const issuedAt = Number(issued);
  const expiresAt = Number(expires);
  const now = Math.floor(Date.now() / 1_000);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt) ||
      issuedAt > now || expiresAt <= now || expiresAt - issuedAt !== SESSION_TTL_SECONDS) {
    return null;
  }
  return { issuedAt, expiresAt };
}

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new Error('UNAUTHORIZED');
  return session;
}
