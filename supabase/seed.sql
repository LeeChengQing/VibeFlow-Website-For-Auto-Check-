-- ============================================================================
-- supabase/seed.sql
-- Development seed data (plans, dev license keys, sample app_config).
-- FOR DEVELOPMENT & TESTING ONLY. STRICTLY NO PRODUCTION SECRETS.
-- ============================================================================

-- 1. Canonical Plans
insert into public.plans (code, product, name, duration_days, price_myr, price_usd, active)
values
  ('core', 'core', 'Extension Core (Semester)', null, 3500, 800, true),
  ('extension', 'core', 'Extension Core (Semester)', null, 3500, 800, true),
  ('bundle', 'bundle', 'Extension + Phone Alerts', 130, 5900, 1400, true),
  ('semester', 'phone_notify', 'Phone Alerts (Semester)', 130, 3900, 950, true),
  ('yearly', 'phone_notify', 'Phone Alerts (Academic Year)', 365, 7900, 1900, true)
on conflict (code) do update set
  product = excluded.product,
  name = excluded.name,
  duration_days = excluded.duration_days,
  price_myr = excluded.price_myr,
  price_usd = excluded.price_usd,
  active = excluded.active;

-- 2. Dev License Keys (Sample v2 keys with dummy dev HMAC hashes)
insert into public.license_keys (
  key_hash, hash_version, channel, region, batch_id, plan_code, status, max_devices
) values
  ('dev-seed-core-key-hash-0000000000000000000000000000000000000000001', 2, 'website', 'global', 'dev-seed-batch', 'core', 'listed', 2),
  ('dev-seed-core-key-hash-0000000000000000000000000000000000000000002', 2, 'website', 'global', 'dev-seed-batch', 'core', 'listed', 2),
  ('dev-seed-bundle-key-hash-00000000000000000000000000000000000000001', 2, 'website', 'global', 'dev-seed-batch', 'bundle', 'listed', 2),
  ('dev-seed-semester-key-hash-000000000000000000000000000000000000001', 2, 'website', 'global', 'dev-seed-batch', 'semester', 'listed', 2),
  ('dev-seed-yearly-key-hash-00000000000000000000000000000000000000001', 2, 'website', 'global', 'dev-seed-batch', 'yearly', 'listed', 2),
  ('dev-seed-kawang-key-hash-00000000000000000000000000000000000000001', 2, 'kawang', 'cn', 'dev-kawang-batch-1', 'core', 'listed', 2)
on conflict (key_hash) do nothing;

-- 3. Development App Config
insert into public.app_config (key, value, is_public)
values
  ('client_announcement', '{"message": "Auto-Check Development Mode", "type": "info"}'::jsonb, true),
  ('client_min_version', '{"min_version": "1.0.0", "latest_version": "1.0.0"}'::jsonb, true),
  ('feature_flags', '{"phone_alerts_enabled": true, "offline_grace_hours": 72}'::jsonb, true)
on conflict (key) do update set
  value = excluded.value,
  is_public = excluded.is_public;
