import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const CIPHER = 'aes-256-gcm';
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey(): Buffer {
  const encoded = process.env.LICENSE_KEY_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(encoded)) {
    throw new Error('LICENSE_KEY_ENCRYPTION_NOT_CONFIGURED');
  }

  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new Error('LICENSE_KEY_ENCRYPTION_NOT_CONFIGURED');
  }
  return key;
}

function decodeBase64Url(value: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('INVALID_ENCRYPTED_LICENSE_KEY');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) throw new Error('INVALID_ENCRYPTED_LICENSE_KEY');
  return decoded;
}

export function encryptLicenseKey(plaintext: string, keyHash: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0 || !/^[0-9a-f]{64}$/.test(keyHash)) {
    throw new Error('INVALID_LICENSE_KEY');
  }

  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(CIPHER, encryptionKey(), nonce);
  cipher.setAAD(Buffer.from(keyHash, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${nonce.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptLicenseKey(encoded: string, keyHash: string): string {
  try {
    if (!/^[0-9a-f]{64}$/.test(keyHash)) throw new Error('INVALID_LICENSE_KEY_HASH');
    const [version, noncePart, authTagPart, ciphertextPart, extra] = encoded.split('.');
    if (version !== 'v1' || !noncePart || !authTagPart || !ciphertextPart || extra !== undefined) {
      throw new Error('INVALID_ENCRYPTED_LICENSE_KEY');
    }

    const nonce = decodeBase64Url(noncePart);
    const authTag = decodeBase64Url(authTagPart);
    const ciphertext = decodeBase64Url(ciphertextPart);
    if (nonce.length !== NONCE_LENGTH || authTag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
      throw new Error('INVALID_ENCRYPTED_LICENSE_KEY');
    }

    const decipher = createDecipheriv(CIPHER, encryptionKey(), nonce);
    decipher.setAAD(Buffer.from(keyHash, 'utf8'));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('LICENSE_KEY_DECRYPTION_FAILED');
  }
}
