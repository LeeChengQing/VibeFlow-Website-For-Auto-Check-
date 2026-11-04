import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  generateV2Key,
  validateKeyFormat,
  canonicalizeKey,
  computeKeyHmac,
  computeCheckDigit,
} from '../lib/activation/key-generator';
import {
  generateEd25519KeyPair,
  signActivationToken,
  verifyActivationToken,
  type TokenClaims,
} from '../lib/activation/token-service';

async function migrateAll(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public
      grant all on tables to public, anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (
      id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]
    );
  `);

  const migrationFiles = readdirSync('supabase/migrations')
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    await db.exec(sql);
  }
}

test('Stage C: Crockford Base32 key generation, format validation, and HMAC hashing', () => {
  const secret = 'test-hmac-secret-32-bytes-minimum-security!!';
  const key1 = generateV2Key();
  const key2 = generateV2Key();

  assert.notEqual(key1, key2);
  assert.equal(key1.length, 25); // 4 chunks of 5 + 1 check char + 4 dashes = 25 chars: XXXXX-XXXXX-XXXXX-XXXXX-X
  assert.match(key1, /^[0-9A-HJ-KM-NP-TV-Z]{5}-[0-9A-HJ-KM-NP-TV-Z]{5}-[0-9A-HJ-KM-NP-TV-Z]{5}-[0-9A-HJ-KM-NP-TV-Z]{5}-[0-9A-HJ-KM-NP-TV-Z*~$=]$/);

  // Validation
  assert.equal(validateKeyFormat(key1), true);
  assert.equal(validateKeyFormat(key2), true);

  // Typo detection via Mod-37 check symbol
  const chars = key1.split('');
  chars[0] = chars[0] === 'A' ? 'B' : 'A'; // change a single character
  const tamperedKey = chars.join('');
  assert.equal(validateKeyFormat(tamperedKey), false);

  // Canonicalization handles lowercase, spaces, ambiguous characters
  const rawKey = key1.toLowerCase().replace(/-/g, ' ');
  assert.equal(validateKeyFormat(rawKey), true);
  assert.equal(canonicalizeKey(rawKey), canonicalizeKey(key1));

  // HMAC computation with version 2
  const hmac = computeKeyHmac(key1, secret);
  assert.equal(hmac.length, 64);
  assert.match(hmac, /^[0-9a-f]{64}$/);
});

test('Stage C: Ed25519 JWS token signing, verification, kid rotation, and 72h grace period', async () => {
  const kp1 = generateEd25519KeyPair('kid-2026-v1');
  const kp2 = generateEd25519KeyPair('kid-2026-v2');

  const nowSec = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sub: 'key-uuid-1234',
    did: 'device-hash-5678',
    plan: 'core',
    feat: ['core'],
    iat: nowSec,
    exp: nowSec + 7 * 86400, // 7 days
    ver: 2,
    min_app: '1.0.0',
  };

  // Sign token using kid1
  const token = signActivationToken(claims, kp1.privateKeyPem, 'kid-2026-v1');
  assert.ok(typeof token === 'string' && token.split('.').length === 3);

  // Verify token using keyring containing kid1 and kid2
  const keyring = {
    'kid-2026-v1': kp1.publicKeyPem,
    'kid-2026-v2': kp2.publicKeyPem,
  };

  const resultValid = verifyActivationToken(token, keyring, { nowSec });
  assert.equal(resultValid.status, 'valid');
  assert.equal(resultValid.claims?.sub, 'key-uuid-1234');
  assert.equal(resultValid.claims?.did, 'device-hash-5678');

  // Tampered payload must fail
  const parts = token.split('.');
  const tamperedToken = `${parts[0]}.${parts[1]}A.${parts[2]}`;
  const resultTampered = verifyActivationToken(tamperedToken, keyring, { nowSec });
  assert.equal(resultTampered.status, 'invalid');

  // Unknown kid must fail
  const unknownKeyring = { 'kid-other': kp2.publicKeyPem };
  const resultUnknownKid = verifyActivationToken(token, unknownKeyring, { nowSec });
  assert.equal(resultUnknownKid.status, 'invalid');

  // Grace Period Verification:
  // 1. Expired by 1 hour (within 72h grace period) -> 'grace_period'
  const resultInGrace = verifyActivationToken(token, keyring, { nowSec: claims.exp + 3600 });
  assert.equal(resultInGrace.status, 'grace_period');
  assert.ok(resultInGrace.claims);

  // 2. Expired by 73 hours (beyond 72h grace period) -> 'expired'
  const resultExpired = verifyActivationToken(token, keyring, { nowSec: claims.exp + 73 * 3600 });
  assert.equal(resultExpired.status, 'expired');
});

test('Stage C: Fail-open core gate for previously activated users when validation fails', () => {
  const kp = generateEd25519KeyPair('kid-2026-v1');
  const nowSec = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sub: 'key-uuid-failopen',
    did: 'device-hash-user',
    plan: 'core',
    feat: ['core'],
    iat: nowSec - 8 * 86400,
    exp: nowSec - 86400, // expired 1 day ago
    ver: 2,
  };

  const token = signActivationToken(claims, kp.privateKeyPem, 'kid-2026-v1');

  // Fail-open evaluator: previously active + in grace period allows execution with warning
  const keyring = { 'kid-2026-v1': kp.publicKeyPem };
  const check = verifyActivationToken(token, keyring, {
    nowSec,
    allowOfflineGrace: true,
  });

  assert.equal(check.status, 'grace_period');
  assert.equal(check.allowed, true);
});

test('Stage C: Database atomic key activation, quota check, idempotency, and deactivation', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const secret = 'test-hmac-secret-for-c-stage-testing!!';
  const keyStr = generateV2Key();
  const keyHash = computeKeyHmac(keyStr, secret);

  const keyId = 'c1000000-0000-0000-0000-000000000001';
  await db.exec(`
    insert into public.license_keys (
      id, key_hash, hash_version, channel, region, status, plan_code, max_devices
    ) values (
      '${keyId}', '${keyHash}', 2, 'website', 'global', 'listed', 'core', 2
    );
  `);

  // 1. Activate Device 1
  const act1 = (await db.query<{ success: boolean; status: string; key_id: string }>(`
    select * from public.activate_license_key('${keyHash}', 'dev-hash-1', '1.0.0', 'ip-hash-1');
  `)).rows[0];

  assert.equal(act1.success, true);
  assert.equal(act1.status, 'ACTIVATED');

  // Verify key status transitioned to 'activated' and activations row inserted
  const keyRow = (await db.query<{ status: string; first_activated_at: string }>(`
    select status, first_activated_at from public.license_keys where id = '${keyId}';
  `)).rows[0];
  assert.equal(keyRow.status, 'activated');
  assert.ok(keyRow.first_activated_at);

  // 2. Idempotent re-activation on Device 1
  const act1Repeat = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('${keyHash}', 'dev-hash-1', '1.0.1', 'ip-hash-1');
  `)).rows[0];
  assert.equal(act1Repeat.success, true);
  assert.equal(act1Repeat.status, 'ALREADY_ACTIVATED');

  // Active devices count should still be 1
  const devCount1 = (await db.query<{ count: number }>(`
    select count(*) as count from public.activations where key_id = '${keyId}' and status = 'active';
  `)).rows[0].count;
  assert.equal(Number(devCount1), 1);

  // 3. Activate Device 2 (reaches max quota 2)
  const act2 = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('${keyHash}', 'dev-hash-2', '1.0.0', 'ip-hash-2');
  `)).rows[0];
  assert.equal(act2.success, true);
  assert.equal(act2.status, 'ACTIVATED');

  // 4. Activate Device 3 (exceeds max_devices quota 2)
  const act3 = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('${keyHash}', 'dev-hash-3', '1.0.0', 'ip-hash-3');
  `)).rows[0];
  assert.equal(act3.success, false);
  assert.equal(act3.status, 'DEVICE_LIMIT_EXCEEDED');

  // 5. Deactivate Device 1
  const deact1 = (await db.query<{ success: boolean }>(`
    select * from public.deactivate_device('${keyId}', 'dev-hash-1');
  `)).rows[0];
  assert.equal(deact1.success, true);

  // 6. Device 3 can now be activated!
  const act3AfterDeact = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('${keyHash}', 'dev-hash-3', '1.0.0', 'ip-hash-3');
  `)).rows[0];
  assert.equal(act3AfterDeact.success, true);
  assert.equal(act3AfterDeact.status, 'ACTIVATED');
});

test('Stage C: Revoked and non-existent keys fail safely with anti-enumeration protection', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Non-existent key
  const actNotFound = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('non-existent-hash', 'dev-1', '1.0.0', 'ip-1');
  `)).rows[0];
  assert.equal(actNotFound.success, false);
  assert.equal(actNotFound.status, 'INVALID_KEY');

  // 2. Revoked key
  const revokedKeyId = 'c2000000-0000-0000-0000-000000000002';
  await db.exec(`
    insert into public.license_keys (
      id, key_hash, hash_version, channel, region, status, plan_code, max_devices
    ) values (
      '${revokedKeyId}', 'revoked-key-hash', 2, 'website', 'global', 'revoked', 'core', 2
    );
  `);

  const actRevoked = (await db.query<{ success: boolean; status: string }>(`
    select * from public.activate_license_key('revoked-key-hash', 'dev-1', '1.0.0', 'ip-1');
  `)).rows[0];
  assert.equal(actRevoked.success, false);
  assert.equal(actRevoked.status, 'REVOKED_KEY');
});

test('Stage C: ActivationService end-to-end activate, refresh, deactivate, and getStatus flow', async () => {
  const { ActivationService } = await import('../lib/activation/activation-service');
  const db = new PGlite();
  await migrateAll(db);

  const kp = generateEd25519KeyPair('kid-2026-v1');
  const hmacSecret = 'test-hmac-secret-32-chars-long-minimum!';
  const service = new ActivationService({
    db,
    hmacSecret,
    privateKeyPem: kp.privateKeyPem,
    currentKid: 'kid-2026-v1',
    keyring: { 'kid-2026-v1': kp.publicKeyPem },
  });

  const rawKey = generateV2Key();
  const keyHash = computeKeyHmac(rawKey, hmacSecret);

  // Insert listed key in DB
  const keyId = 'c3000000-0000-0000-0000-000000000003';
  await db.exec(`
    insert into public.license_keys (
      id, key_hash, hash_version, channel, region, status, plan_code, max_devices
    ) values (
      '${keyId}', '${keyHash}', 2, 'website', 'global', 'listed', 'bundle', 2
    );
  `);

  // 1. Activate
  const actRes = await service.activate({
    key: rawKey,
    deviceId: 'device-test-1',
    appVersion: '1.2.0',
    clientIp: '192.168.1.1',
  });

  assert.equal(actRes.success, true);
  assert.ok(actRes.token);
  assert.equal(actRes.claims?.sub, keyId);
  assert.equal(actRes.claims?.plan, 'bundle');
  assert.deepEqual(actRes.features, ['core', 'phone_notify']);
  assert.ok(actRes.validUntil);

  // 2. Query Status by token
  const statusRes = await service.getStatus({ token: actRes.token });
  assert.equal(statusRes.exists, true);
  assert.equal(statusRes.status, 'activated');
  assert.equal(statusRes.activeDevices, 1);
  assert.equal(statusRes.maxDevices, 2);

  // 3. Refresh token
  const refreshRes = await service.refresh({
    token: actRes.token,
    deviceId: 'device-test-1',
    appVersion: '1.2.1',
  });

  assert.equal(refreshRes.success, true);
  assert.ok(refreshRes.token);
  assert.ok(refreshRes.claims);

  // 4. Deactivate device
  const deactRes = await service.deactivate({
    token: refreshRes.token!,
    deviceId: 'device-test-1',
  });
  assert.equal(deactRes.success, true);

  // 5. Query Status after deactivation
  const statusAfterDeact = await service.getStatus({ key: rawKey });
  assert.equal(statusAfterDeact.exists, true);
  assert.equal(statusAfterDeact.activeDevices, 0);
});

test('Stage C: Batch tools generateBatch, computeKeyStats, revokeBatch, and formatKeysForKawang', async () => {
  const { generateBatch } = await import('../scripts/keys/generate');
  const { computeKeyStats } = await import('../scripts/keys/stats');
  const { buildRevokeBatchQuery } = await import('../scripts/keys/revoke-batch');
  const { formatKeysForKawang } = await import('../scripts/keys/export-kawang');

  // 1. generateBatch
  const batch = generateBatch({
    plan: 'bundle',
    channel: 'kawang',
    region: 'cn',
    count: 5,
    batchId: 'kw-batch-test',
    hmacSecret: 'test-secret-32-chars-long-minimum!',
  });

  assert.equal(batch.keys.length, 5);
  assert.equal(batch.records.length, 5);
  assert.equal(batch.records[0].plan_code, 'bundle');
  assert.equal(batch.records[0].channel, 'kawang');
  assert.equal(batch.records[0].status, 'listed');

  // 2. computeKeyStats
  const stats = computeKeyStats(batch.records);
  assert.equal(stats.total, 5);
  assert.equal(stats.byChannel['kawang'], 5);
  assert.equal(stats.byPlan['bundle'], 5);
  assert.equal(stats.byStatus['listed'], 5);

  // 3. buildRevokeBatchQuery
  const revokeQuery = buildRevokeBatchQuery('kw-batch-test', 'Compromised leak');
  assert.ok(revokeQuery.sql.includes('update public.license_keys'));
  assert.deepEqual(revokeQuery.params, ['kw-batch-test', 'Compromised leak']);

  // 4. formatKeysForKawang
  const exported = formatKeysForKawang(batch.keys);
  assert.equal(exported.split('\r\n').length, 5);
});


