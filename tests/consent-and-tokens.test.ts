import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENT_TERMS_VERSION, hashConsentIp, validateTermsConsent } from '../lib/consent';
import { generateOrderAccessToken, hashOrderAccessToken, verifyOrderAccessToken } from '../lib/order-access-token';

test('validateTermsConsent accepts explicit consent with current version', () => {
  const result = validateTermsConsent({
    terms_accepted: true,
    terms_version: CURRENT_TERMS_VERSION,
  }, { isProduction: true });

  assert.equal(result.ok, true);
  assert.equal(result.version, CURRENT_TERMS_VERSION);
  assert.ok(result.acceptedAt);
});

test('validateTermsConsent rejects when terms_accepted is false or absent in production', () => {
  const explicitFalse = validateTermsConsent({
    terms_accepted: false,
    terms_version: CURRENT_TERMS_VERSION,
  }, { isProduction: true });
  assert.equal(explicitFalse.ok, false);
  assert.equal(explicitFalse.error, 'TERMS_ACCEPTANCE_REQUIRED');

  const absentProd = validateTermsConsent({}, { isProduction: true });
  assert.equal(absentProd.ok, false);
  assert.equal(absentProd.error, 'TERMS_ACCEPTANCE_REQUIRED');
});

test('validateTermsConsent rejects mismatched terms version', () => {
  const wrongVersion = validateTermsConsent({
    terms_accepted: true,
    terms_version: '2024-01-01',
  }, { isProduction: false });
  assert.equal(wrongVersion.ok, false);
  assert.equal(wrongVersion.error, 'INVALID_TERMS_VERSION');
});

test('hashConsentIp produces deterministic salted sha256 hash without storing raw IP', () => {
  const ip1 = '203.0.113.195';
  const ip2 = '198.51.100.42';

  const hash1a = hashConsentIp(ip1);
  const hash1b = hashConsentIp(ip1);
  const hash2 = hashConsentIp(ip2);

  assert.equal(hash1a, hash1b);
  assert.notEqual(hash1a, hash2);
  assert.match(hash1a, /^[a-f0-9]{64}$/);
  // Anonymized/empty IP also returns valid hash
  assert.match(hashConsentIp(null), /^[a-f0-9]{64}$/);
});

test('generateOrderAccessToken creates high-entropy token and matching sha256 hash', () => {
  const { token, tokenHash } = generateOrderAccessToken();

  assert.ok(token.length >= 32, 'Token should have high entropy');
  assert.equal(tokenHash, hashOrderAccessToken(token));
  assert.match(tokenHash, /^[a-f0-9]{64}$/);

  // Verification works with constant-time equality
  assert.equal(verifyOrderAccessToken(token, tokenHash), true);
  assert.equal(verifyOrderAccessToken('wrong-token', tokenHash), false);
  assert.equal(verifyOrderAccessToken(token, 'wrong-hash'), false);
  assert.equal(verifyOrderAccessToken(null, tokenHash), false);
  assert.equal(verifyOrderAccessToken(token, null), false);
});
