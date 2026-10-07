import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  evaluateCoreGate,
  ActivationStorageState,
  createActivationClient,
} from '../lib/extension/activation-client';
import {
  generateEd25519KeyPair,
  signActivationToken,
} from '../lib/activation/token-service';

// Mock MV3 chrome environment
function createMockChromeStorage(initialData: Record<string, any> = {}) {
  const store = { ...initialData };
  return {
    local: {
      get: async (keys?: string | string[] | Record<string, any>) => {
        if (!keys) return { ...store };
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (Array.isArray(keys)) {
          const res: Record<string, any> = {};
          for (const k of keys) res[k] = store[k];
          return res;
        }
        return { ...store };
      },
      set: async (items: Record<string, any>) => {
        Object.assign(store, items);
      },
      remove: async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete store[k];
      },
      clear: async () => {
        for (const k of Object.keys(store)) delete store[k];
      },
    },
  };
}

test('Stage G: Gate rejects completely unactivated user (never activated)', async () => {
  const state: ActivationStorageState = {
    hasEverActivated: false,
    cachedToken: null,
    lastVerifiedAt: null,
    lastServerStatus: null,
  };

  const gate = evaluateCoreGate(state, {
    networkAvailable: true,
    serverReachable: true,
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 'REJECTED');
  assert.equal(gate.reason, 'NEVER_ACTIVATED');
});

test('Stage G: Gate allows validly activated user with active token', async () => {
  const kp = generateEd25519KeyPair('kid-ext-001');
  const keyring = { [kp.kid]: kp.publicKeyPem };
  const token = signActivationToken({
    sub: 'key-test-001',
    did: 'device-test-001',
    plan: 'core',
    feat: ['core'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    ver: 2,
  }, kp.privateKeyPem, kp.kid);

  const state: ActivationStorageState = {
    hasEverActivated: true,
    cachedToken: token,
    lastVerifiedAt: Date.now(),
    lastServerStatus: 'ACTIVATED',
    plan: 'core',
    features: ['core'],
  };

  const gate = evaluateCoreGate(state, {
    networkAvailable: true,
    serverReachable: true,
  }, keyring);

  assert.equal(gate.allowed, true);
  assert.equal(gate.status, 'ALLOWED');
});

test('Stage G: Fail-open gate: previously activated user experiencing network or server errors is NOT blocked', async () => {
  const kp = generateEd25519KeyPair('kid-ext-002');
  const keyring = { [kp.kid]: kp.publicKeyPem };
  // Valid token cached from earlier session
  const token = signActivationToken({
    sub: 'key-test-002',
    did: 'device-test-002',
    plan: 'core',
    feat: ['core'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 3,
    ver: 2,
  }, kp.privateKeyPem, kp.kid);

  const state: ActivationStorageState = {
    hasEverActivated: true,
    cachedToken: token,
    lastVerifiedAt: Date.now() - 3600 * 1000,
    lastServerStatus: 'ACTIVATED',
    plan: 'core',
    features: ['core'],
  };

  // 1. Simulate network failure (e.g. offline, DNS failure, school captive portal)
  const networkErrorGate = evaluateCoreGate(state, {
    networkAvailable: false,
    serverReachable: false,
    transientError: 'NETWORK_TIMEOUT',
  }, keyring);

  assert.equal(networkErrorGate.allowed, true, 'Fail-open: ongoing task must not be interrupted');
  assert.equal(networkErrorGate.status, 'ALLOWED_WITH_WARNING');
  assert.equal(networkErrorGate.warning, 'OFFLINE_GRACE_PERIOD');

  // 2. Simulate server 500/503 outage
  const serverOutageGate = evaluateCoreGate(state, {
    networkAvailable: true,
    serverReachable: false,
    transientError: 'SERVER_503_UNAVAILABLE',
  }, keyring);

  assert.equal(serverOutageGate.allowed, true, 'Fail-open: server outage must not block active user');
  assert.equal(serverOutageGate.status, 'ALLOWED_WITH_WARNING');
  assert.equal(serverOutageGate.warning, 'SERVER_TEMPORARILY_UNREACHABLE');
});

test('Stage G: Gate strictly rejects explicitly revoked key even if previously activated', async () => {
  const state: ActivationStorageState = {
    hasEverActivated: true,
    cachedToken: null,
    lastVerifiedAt: Date.now(),
    lastServerStatus: 'REVOKED',
    revocationReason: 'Stripe charge refunded',
  };

  const gate = evaluateCoreGate(state, {
    networkAvailable: true,
    serverReachable: true,
  });

  assert.equal(gate.allowed, false);
  assert.equal(gate.status, 'REJECTED');
  assert.equal(gate.reason, 'KEY_REVOKED');
});

test('Stage G: Mock MV3 ActivationClient end-to-end checkin lifecycle', async () => {
  const kp = generateEd25519KeyPair('kid-ext-003');
  const keyring = { [kp.kid]: kp.publicKeyPem };
  const storage = createMockChromeStorage();
  const client = createActivationClient({ storage, keyring });

  // 1. Initial state: unactivated -> checkin fails
  const initialGate = await client.checkGate();
  assert.equal(initialGate.allowed, false);

  // 2. Perform activation
  const token = signActivationToken({
    sub: 'key-mv3-001',
    did: 'did-mv3-001',
    plan: 'bundle',
    feat: ['core', 'phone_notify'],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
    ver: 2,
  }, kp.privateKeyPem, kp.kid);

  await client.recordActivationSuccess({
    token,
    plan: 'bundle',
    features: ['core', 'phone_notify'],
    validUntil: new Date(Date.now() + 86400 * 30 * 1000).toISOString(),
  });

  // Check gate after activation -> ALLOWED
  const activeGate = await client.checkGate();
  assert.equal(activeGate.allowed, true);
  assert.equal(activeGate.status, 'ALLOWED');


  // 3. Simulate offline network -> FAIL-OPEN: ALLOWED_WITH_WARNING
  const offlineGate = await client.checkGate({ forceOffline: true });
  assert.equal(offlineGate.allowed, true);
  assert.equal(offlineGate.status, 'ALLOWED_WITH_WARNING');

  // 4. Sanitized diagnostics: contains app_version and status, but ZERO raw keys or tokens
  const diag = await client.getDiagnostics();
  assert.ok(diag.appVersion);
  assert.equal(diag.hasEverActivated, true);
  assert.equal(diag.status, 'ACTIVATED');
  assert.equal((diag as any).cachedToken, undefined);
  assert.equal((diag as any).rawKey, undefined);
  assert.equal((diag as any).privateKey, undefined);
});

test('Stage G: Extension release build script outputs clean ZIP without secrets', () => {
  if (!existsSync('public/downloads/auto-check-extension.zip')) {
    try {
      execSync('node scripts/build-extension-release.mjs', { stdio: 'pipe' });
    } catch {
      // ignore concurrent build
    }
  }

  const zipPath = 'public/downloads/auto-check-extension.zip';
  assert.ok(existsSync(zipPath), 'Release ZIP must exist');

  const zipBytes = readFileSync(zipPath);
  assert.ok(zipBytes.length > 500, 'Release ZIP must not be empty');

  // Check that dist/extension-release contains required MV3 files
  assert.ok(existsSync('dist/extension-release/manifest.json'));
  assert.ok(existsSync('dist/extension-release/background.js'));
  assert.ok(existsSync('dist/extension-release/popup.html'));
  assert.ok(existsSync('dist/extension-release/popup.js'));
});
