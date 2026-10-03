import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadServerModule } from './helpers/server-module';
import * as crypto from 'node:crypto';

type Keys = typeof import('../lib/admin-keys');
test('codes preserve 192 random bits in readable groups', () => {
  let requested = 0;
  const keys = loadServerModule<Keys>('lib/admin-keys.ts', {
    'node:crypto': { ...crypto, randomBytes: (size: number) => {
      requested = size;
      return Buffer.from('0123456789abcdef'.repeat(3), 'hex');
    } },
  });
  assert.equal(keys.generateActivationCode(), 'AC-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF');
  assert.equal(requested, 24);
});

test('hashes canonical uppercase codes with lowercase SHA-256 hex', () => {
  const keys = loadServerModule<Keys>('lib/admin-keys.ts', {});
  const code = 'AC-' + Array(12).fill('0000').join('-');
  assert.equal(keys.hashActivationCode(code), 'f1b033378c8f604f768e6b8dac46a33bdcbdaf53f03dee0a87fae95a6c71e7df');
  assert.equal(keys.hashActivationCode(` ${code.toLowerCase()}\n`), keys.hashActivationCode(code));
  assert.throws(() => keys.hashActivationCode('AC-TOO-SHORT'), /INVALID_ACTIVATION_CODE/);
  const generated = Array.from({ length: 100 }, () => keys.generateActivationCode());
  assert.equal(new Set(generated).size, 100);
  generated.forEach(value => assert.match(value, /^AC-(?:[0-9A-F]{4}-){11}[0-9A-F]{4}$/));
});
