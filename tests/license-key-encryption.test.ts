import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createHash } from 'node:crypto';
import { loadServerModule } from './helpers/server-module';

type LicenseEncryption = {
  encryptLicenseKey(plaintext: string, keyHash: string): string;
  decryptLicenseKey(encoded: string, keyHash: string): string;
};

const previousEncryptionKey = process.env.LICENSE_KEY_ENCRYPTION_KEY;
process.env.LICENSE_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const encryption = loadServerModule<LicenseEncryption>('lib/license-key-encryption.ts', {});
const plaintext = 'AC-SEM-7H3K9P2D';
const keyHash = createHash('sha256').update(plaintext).digest('hex');

after(() => {
  if (previousEncryptionKey === undefined) delete process.env.LICENSE_KEY_ENCRYPTION_KEY;
  else process.env.LICENSE_KEY_ENCRYPTION_KEY = previousEncryptionKey;
});

test('AES-256-GCM encryption round-trips with a versioned nonce, tag, and ciphertext', () => {
  const encoded = encryption.encryptLicenseKey(plaintext, keyHash);

  assert.match(encoded, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(encryption.decryptLicenseKey(encoded, keyHash), plaintext);
  assert.throws(() => encryption.decryptLicenseKey(encoded, '0'.repeat(64)), /LICENSE_KEY_DECRYPTION_FAILED/);
});

test('AES-256-GCM encryption uses a fresh nonce for each key', () => {
  const first = encryption.encryptLicenseKey(plaintext, keyHash);
  const second = encryption.encryptLicenseKey(plaintext, keyHash);

  assert.notEqual(first.split('.')[1], second.split('.')[1]);
});

test('encryption rejects an empty key and decryption rejects malformed or tampered payloads', () => {
  assert.throws(() => encryption.encryptLicenseKey('', keyHash), /INVALID_LICENSE_KEY/);
  assert.throws(() => encryption.decryptLicenseKey('v2.bad.bad.bad', keyHash), /LICENSE_KEY_DECRYPTION_FAILED/);
  const encoded = encryption.encryptLicenseKey(plaintext, keyHash);
  const parts = encoded.split('.');
  parts[3] = `${parts[3]}A`;
  assert.throws(() => encryption.decryptLicenseKey(parts.join('.'), keyHash), /LICENSE_KEY_DECRYPTION_FAILED/);
});

test('key encryption and decryption fail closed for missing or malformed secrets', () => {
  const validKey = process.env.LICENSE_KEY_ENCRYPTION_KEY!;
  for (const secret of ['', 'not-base64', Buffer.alloc(31).toString('base64')]) {
    process.env.LICENSE_KEY_ENCRYPTION_KEY = secret;
    assert.throws(() => encryption.encryptLicenseKey(plaintext, keyHash), /LICENSE_KEY_ENCRYPTION_NOT_CONFIGURED/);
    assert.throws(() => encryption.decryptLicenseKey('v1.aa.aa.aa', keyHash), /LICENSE_KEY_DECRYPTION_FAILED/);
  }
  process.env.LICENSE_KEY_ENCRYPTION_KEY = validKey;
});
