begin;

-- ============================================================================
-- 20261007020000_stage_b_database_hardening_down.sql
-- Rollback / Down migration for Stage B database hardening
-- ============================================================================

-- 1. Drop Triggers & Functions
drop trigger if exists trg_prevent_audit_log_modification on public.audit_log;
drop function if exists public.prevent_audit_log_modification();

drop trigger if exists trg_audit_license_key_status on public.license_keys;
drop function if exists public.log_license_key_status_change();

drop trigger if exists trg_enforce_license_keys_status on public.license_keys;
drop function if exists public.enforce_license_keys_status_transition();

drop trigger if exists trg_audit_order_status on public.orders;
drop function if exists public.log_order_status_change();

drop trigger if exists trg_enforce_orders_status on public.orders;
drop function if exists public.enforce_orders_status_transition();

drop function if exists public.ingest_legacy_keys_from_staging();

-- 2. Drop Tables (in reverse dependency order)
drop table if exists public.legacy_key_import_staging cascade;
drop table if exists public.heartbeats cascade;
drop table if exists public.rate_limits cascade;
drop table if exists public.app_config cascade;
drop table if exists public.notifications cascade;
drop table if exists public.entitlements cascade;
drop table if exists public.activations cascade;
drop table if exists public.license_keys cascade;
drop table if exists public.webhook_events cascade;
drop table if exists public.payments cascade;
drop table if exists public.plans cascade;

-- 3. Revert Orders constraints/columns safely
drop index if exists public.orders_public_ref_idx;
alter table public.orders drop column if exists public_ref;
alter table public.orders drop column if exists channel;
alter table public.orders drop column if exists updated_at;

commit;
