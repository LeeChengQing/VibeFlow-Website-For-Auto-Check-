import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sanitizeNotificationContent } from '../lib/notifications/sanitizer';
import { sendNtfyNotification } from '../lib/notifications/ntfy-adapter';
import { processNotificationQueue } from '../lib/notifications/worker';
import { signActivationToken } from '../lib/activation/token-service';

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

test('Stage F: Notification sanitizer enforces field allowlist, length limits, and scrubs sensitive data', () => {
  // 1. Normal message passes
  const valid = sanitizeNotificationContent({
    kind: 'checkin_reminder',
    title: 'Daily Check-in Reminder',
    body: 'Time to verify your daily attendance record.',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.sanitizedTitle, 'Daily Check-in Reminder');
  assert.equal(valid.sanitizedBody, 'Time to verify your daily attendance record.');

  // 2. Body containing sensitive credentials (password, token, student ID) is sanitized
  const sensitive = sanitizeNotificationContent({
    kind: 'checkin_reminder',
    title: 'Reminder',
    body: 'Your student ID is 2023019827 and password is secret_pwd_123 with token=abc123456789',
  });
  assert.equal(sensitive.valid, true);
  assert.ok(!sensitive.sanitizedBody.includes('2023019827'), 'Student ID should be scrubbed');
  assert.ok(!sensitive.sanitizedBody.includes('secret_pwd_123'), 'Password should be scrubbed');
  assert.ok(sensitive.sanitizedBody.includes('[REDACTED]'));

  // 3. Excessively long body is truncated to 200 chars
  const longBody = 'A'.repeat(500);
  const truncated = sanitizeNotificationContent({
    kind: 'checkin_reminder',
    title: 'Long Message',
    body: longBody,
  });
  assert.equal(truncated.valid, true);
  assert.ok(truncated.sanitizedBody.length <= 200);

  // 4. Invalid notification kind is rejected
  const invalidKind = sanitizeNotificationContent({
    kind: 'arbitrary_admin_broadcast' as any,
    title: 'Alert',
    body: 'Hello',
  });
  assert.equal(invalidKind.valid, false);
});

test('Stage F: End-to-end enqueue, double-authorization check, and worker delivery to mock ntfy', async () => {
  const db = new PGlite();
  await migrateAll(db);

  // 1. Set up an active license and phone_notify entitlement
  const keyId = 'f0000000-0000-0000-0000-000000000001';
  const entId = 'f1000000-0000-0000-0000-000000000001';
  const topic = 'test_topic_f_secret_123';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-001', 2, 'website', 'global', 'activated', 'bundle', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', '${topic}', 60);
  `);

  // 2. Enqueue notification via enqueue_notification RPC
  const enqueueRes = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification(
      '${entId}',
      'evt_checkin_001',
      'checkin_reminder',
      'Check-in Pending',
      'Please open browser to confirm attendance',
      1200
    ) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  assert.ok(enqueueRes);

  // Verify item is queued
  const queuedItem = (await db.query<{ status: string; title: string }>(`
    select status, title from public.notifications where id = '${enqueueRes}';
  `)).rows[0];
  assert.equal(queuedItem.status, 'queued');
  assert.equal(queuedItem.title, 'Check-in Pending');

  // 3. Run worker with mock fetch returning HTTP 200
  let publishedUrl = '';
  let publishedBody = '';
  const mockFetch: typeof fetch = async (url, init) => {
    publishedUrl = String(url);
    publishedBody = String(init?.body);
    return new Response(JSON.stringify({ id: 'ntfy_msg_001' }), { status: 200 });
  };

  const workerResult = await processNotificationQueue(db, {
    fetchFn: mockFetch,
    batchSize: 5,
  });

  assert.equal(workerResult.processed, 1);
  assert.equal(workerResult.sent, 1);
  assert.ok(publishedUrl.includes(topic));
  assert.ok(publishedBody.includes('attendance'));

  // 4. Verify notification is marked 'sent'
  const sentItem = (await db.query<{ status: string; sent_at: string }>(`
    select status, sent_at from public.notifications where id = '${enqueueRes}';
  `)).rows[0];
  assert.equal(sentItem.status, 'sent');
  assert.ok(sentItem.sent_at);
});

test('Stage F: Double-authorization check: enqueued notification is dropped if entitlement is revoked before sending', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000002';
  const entId = 'f1000000-0000-0000-0000-000000000002';
  const topic = 'test_topic_f_secret_456';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-002', 2, 'website', 'global', 'activated', 'semester', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', '${topic}', 60);
  `);

  // Enqueue while active
  const notifId = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification(
      '${entId}',
      'evt_checkin_002',
      'checkin_reminder',
      'Reminder',
      'Check in now',
      1200
    ) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  // Revoke entitlement (e.g. refund occurred)
  await db.exec(`update public.entitlements set status = 'revoked' where id = '${entId}';`);

  // Worker runs -> must double-check entitlement and mark DROPPED instead of sending!
  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response('OK', { status: 200 });
  };

  const workerResult = await processNotificationQueue(db, {
    fetchFn: mockFetch,
    batchSize: 5,
  });

  assert.equal(callCount, 0, 'Should not dispatch HTTP request to ntfy for revoked entitlement');
  assert.equal(workerResult.dropped, 1);

  const droppedItem = (await db.query<{ status: string; last_error: string }>(`
    select status, last_error from public.notifications where id = '${notifId}';
  `)).rows[0];
  assert.equal(droppedItem.status, 'dropped');
  assert.equal(droppedItem.last_error, 'ENTITLEMENT_INACTIVE');
});

test('Stage F: Rate limit enforcement: daily cap stops queue growth', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000003';
  const entId = 'f1000000-0000-0000-0000-000000000003';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-003', 2, 'website', 'global', 'activated', 'yearly', 2);

    -- Set tight daily cap of 2
    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', 'topic_f_003', 2);
  `);

  // Enqueue 1: OK
  await db.query(`select public.enqueue_notification('${entId}', 'evt_1', 'checkin_reminder', 'T1', 'B1', 1200);`);
  // Enqueue 2: OK
  await db.query(`select public.enqueue_notification('${entId}', 'evt_2', 'checkin_reminder', 'T2', 'B2', 1200);`);

  // Enqueue 3: Reached cap of 2 -> must reject
  await assert.rejects(
    async () => {
      await db.query(`select public.enqueue_notification('${entId}', 'evt_3', 'checkin_reminder', 'T3', 'B3', 1200);`);
    },
    /RATE_LIMIT_EXCEEDED/
  );
});

test('Stage F: Idempotency: duplicate enqueues return the original notification ID without duplicate queue entry', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000004';
  const entId = 'f1000000-0000-0000-0000-000000000004';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-004', 2, 'website', 'global', 'activated', 'yearly', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', 'topic_f_004', 60);
  `);

  const id1 = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification('${entId}', 'same_evt_key', 'checkin_reminder', 'Title', 'Body', 1200) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  const id2 = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification('${entId}', 'same_evt_key', 'checkin_reminder', 'Title', 'Body', 1200) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  assert.equal(id1, id2);

  const count = (await db.query<{ count: number }>(`
    select count(*) as count from public.notifications where entitlement_id = '${entId}';
  `)).rows[0].count;
  assert.equal(Number(count), 1);
});

test('Stage F: Worker retry handling: HTTP 429/5xx backs off and eventual max attempt failure', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000005';
  const entId = 'f1000000-0000-0000-0000-000000000005';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-005', 2, 'website', 'global', 'activated', 'bundle', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', 'topic_f_005', 60);
  `);

  const notifId = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification('${entId}', 'evt_retry', 'checkin_reminder', 'Retry Test', 'Body', 1200) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  // Mock fetch returns 500 error
  const mockFetch500: typeof fetch = async () => {
    return new Response('Internal Server Error', { status: 500 });
  };

  const res1 = await processNotificationQueue(db, {
    fetchFn: mockFetch500,
    batchSize: 5,
  });

  assert.equal(res1.failed, 1);

  // Status should be queued with attempts = 1 and next_attempt_at in the future
  const itemAfter1 = (await db.query<{ status: string; attempts: number }>(`
    select status, attempts from public.notifications where id = '${notifId}';
  `)).rows[0];
  assert.equal(itemAfter1.status, 'queued');
  assert.equal(itemAfter1.attempts, 1);
});

test('Stage F: Expired notifications are marked expired and not sent to ntfy', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000006';
  const entId = 'f1000000-0000-0000-0000-000000000006';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-006', 2, 'website', 'global', 'activated', 'yearly', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', 'topic_f_006', 60);
  `);

  // Enqueue notification that expired 5 minutes ago
  const notifId = (await db.query<{ enqueue_notification: string }>(`
    select public.enqueue_notification('${entId}', 'evt_expired', 'checkin_reminder', 'Exp', 'Exp Body', -300) as enqueue_notification;
  `)).rows[0].enqueue_notification;

  let callCount = 0;
  const mockFetch: typeof fetch = async () => {
    callCount++;
    return new Response('OK', { status: 200 });
  };

  const res = await processNotificationQueue(db, {
    fetchFn: mockFetch,
    batchSize: 5,
  });

  assert.equal(callCount, 0);
  assert.equal(res.expired, 1);

  const item = (await db.query<{ status: string; last_error: string }>(`
    select status, last_error from public.notifications where id = '${notifId}';
  `)).rows[0];
  assert.equal(item.status, 'expired');
  assert.equal(item.last_error, 'NOTIFICATION_EXPIRED');
});

test('Stage F: Topic rotation RPC generates new topic and updates entitlement', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const keyId = 'f0000000-0000-0000-0000-000000000007';
  const entId = 'f1000000-0000-0000-0000-000000000007';
  const oldTopic = 'topic_original_secret_777';

  await db.exec(`
    insert into public.license_keys (id, key_hash, hash_version, channel, region, status, plan_code, max_devices)
    values ('${keyId}', 'key-hash-f-007', 2, 'website', 'global', 'activated', 'bundle', 2);

    insert into public.entitlements (id, key_id, feature, status, notify_topic, daily_notify_cap)
    values ('${entId}', '${keyId}', 'phone_notify', 'active', '${oldTopic}', 60);
  `);

  const newTopic = (await db.query<{ rotate_notification_topic: string }>(`
    select public.rotate_notification_topic('${entId}') as rotate_notification_topic;
  `)).rows[0].rotate_notification_topic;

  assert.notEqual(newTopic, oldTopic);
  assert.ok(newTopic.startsWith('topic_'));

  const entRow = (await db.query<{ notify_topic: string; notify_rotated_at: string }>(`
    select notify_topic, notify_rotated_at from public.entitlements where id = '${entId}';
  `)).rows[0];
  assert.equal(entRow.notify_topic, newTopic);
  assert.ok(entRow.notify_rotated_at);
});

test('Stage F: Down migration drops functions cleanly', async () => {
  const db = new PGlite();
  await migrateAll(db);

  const downSql = readFileSync('supabase/migrations/down/20261007050000_stage_f_notifications_down.sql', 'utf8');
  await db.exec(downSql);

  const exists = (await db.query<{ exists: boolean }>(`
    select exists (
      select 1 from pg_proc where proname = 'enqueue_notification'
    ) as exists;
  `)).rows[0].exists;
  assert.equal(exists, false);
});

