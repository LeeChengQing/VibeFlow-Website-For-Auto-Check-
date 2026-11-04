import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerModule } from './helpers/server-module';
import * as crypto from 'node:crypto';

type Keys = typeof import('../lib/admin-keys');
test('codes use canonical AC-LIC readable groups', () => {
  let requested = 0;
  const keys = loadServerModule<Keys>('lib/admin-keys.ts', {
    'node:crypto': { ...crypto, randomBytes: (size: number) => {
      requested = size;
      return Buffer.from('0123456789abcdef'.repeat(3), 'hex').subarray(0,size);
    } },
  });
  assert.match(keys.generateActivationCode(), /^AC-LIC(?:-[A-Z0-9]{4}){4}$/);
  assert.equal(requested, 16);
});

test('hashes canonical uppercase codes with lowercase SHA-256 hex', () => {
  const keys = loadServerModule<Keys>('lib/admin-keys.ts', {});
  const code = 'AC-LIC-ABCD-EFGH-JKLM-NPQR';
  assert.equal(keys.hashActivationCode(code), crypto.createHash('sha256').update(code).digest('hex'));
  assert.equal(keys.hashActivationCode(` ${code.toLowerCase()}\n`), keys.hashActivationCode(code));
  assert.throws(() => keys.hashActivationCode('AC-TOO-SHORT'), /INVALID_ACTIVATION_CODE/);
  const generated = Array.from({ length: 100 }, () => keys.generateActivationCode());
  assert.equal(new Set(generated).size, 100);
  generated.forEach(value => assert.match(value, /^AC-LIC(?:-[A-Z0-9]{4}){4}$/));
});
