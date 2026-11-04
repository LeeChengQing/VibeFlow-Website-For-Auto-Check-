begin;

-- ============================================================================
-- 20261007020000_stage_b_database_hardening.sql
-- Implements CODEX_SPEC Stage B (Database Extensions, RLS, State Machines, Legacy Staging):
-- 1. Plans table: Canonical plan catalog with pricing, product kind, and duration.
-- 2. Orders updates: Plan check expansion, public_ref alias, channel and timestamps.
-- 3. Payments & Webhook Events: Structured idempotency and event storage.
-- 4. Unified License Keys: Central license repository across website & kawang.
-- 5. Activations: Device binding and limits (max 2 devices).
-- 6. Entitlements & Notifications: Feature gates (core/phone_notify) & queue storage.
-- 7. App Config & Rate Limits & Heartbeats: Dynamic remote config & rate limiting.
-- 8. Legacy Import Staging: Text-only staging table and ingestion RPC.
-- 9. State Machine Enforcement Triggers: Reject invalid transitions and log to audit_log.
-- 10. Audit Log Immutability: Disallow update/delete on audit_log.
-- 11. Comprehensive RLS: Zero-access on sensitive tables for anon/authenticated.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Plans Table
-- ----------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  product text not null check (product in ('core', 'phone_notify', 'bundle')),
  name text not null,
  duration_days integer,
  price_myr integer not null check (price_myr >= 0),
  price_usd integer not null check (price_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed canonical plans (matching lib/plans.ts and CODEX_SPEC Section 5.1 / 18)
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

-- ----------------------------------------------------------------------------
-- 2. Orders Table Hardening
-- ----------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_plan_check;
alter table public.orders add constraint orders_plan_check check (
  plan in ('core', 'bundle', 'extension', 'semester', 'yearly', 'monthly', 'sem_subscription', 'internal_check')
);

alter table public.orders add column if not exists channel text not null default 'website';
alter table public.orders add column if not exists created_at timestamptz not null default now();
alter table public.orders add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists public_ref text;

update public.orders set public_ref = reference where public_ref is null;

create index if not exists orders_public_ref_idx on public.orders (public_ref);

-- ----------------------------------------------------------------------------
-- 3. Payments Table
-- ----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null,
  provider_event_id text,
  provider_ref text,
  status text not null,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_provider_ref_idx on public.payments (provider, provider_ref);

-- ----------------------------------------------------------------------------
-- 4. Webhook Events Table
-- ----------------------------------------------------------------------------
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  error text,
  payload jsonb not null default '{}'::jsonb,
  constraint webhook_events_provider_event_uniq unique (provider, event_id)
);

create index if not exists webhook_events_status_idx on public.webhook_events (status);

-- ----------------------------------------------------------------------------
-- 5. Unified License Keys Table & Key Inventory Constraint Update
-- ----------------------------------------------------------------------------
alter table public.key_inventory drop constraint if exists key_inventory_key_hash_format;
alter table public.key_inventory add constraint key_inventory_key_hash_format check (length(key_hash) >= 16);

create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text unique not null,
  hash_version smallint not null default 1,
  encrypted_key text,
  channel text not null default 'website',
  region text not null default 'global',
  batch_id text,
  plan_id uuid references public.plans (id) on delete set null,
  plan_code text,
  status text not null default 'generated' check (status in ('generated', 'listed', 'available', 'sold', 'activated', 'expired', 'revoked', 'refunded')),
  order_id uuid references public.orders (id) on delete set null,
  listed_at timestamptz,
  sold_at timestamptz,
  first_activated_at timestamptz,
  activate_by timestamptz,
  valid_until timestamptz,
  max_devices smallint not null default 2,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists license_keys_status_idx on public.license_keys (status);
create index if not exists license_keys_order_id_idx on public.license_keys (order_id);
create index if not exists license_keys_batch_idx on public.license_keys (batch_id);

-- ----------------------------------------------------------------------------
-- 6. Activations Table
-- ----------------------------------------------------------------------------
create table if not exists public.activations (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.license_keys (id) on delete cascade,
  device_id_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_ip_hash text,
  app_version text,
  status text not null default 'active' check (status in ('active', 'deactivated', 'revoked')),
  created_at timestamptz not null default now(),
  constraint activations_key_device_uniq unique (key_id, device_id_hash)
);

create index if not exists activations_key_id_idx on public.activations (key_id);
create index if not exists activations_device_idx on public.activations (device_id_hash);

-- ----------------------------------------------------------------------------
-- 7. Entitlements Table
-- ----------------------------------------------------------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references public.license_keys (id) on delete cascade,
  feature text not null check (feature in ('core', 'phone_notify')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  source_order_id uuid references public.orders (id) on delete set null,
  notify_topic text unique,
  notify_rotated_at timestamptz,
  daily_notify_cap integer not null default 60,
  created_at timestamptz not null default now()
);

create index if not exists entitlements_key_id_idx on public.entitlements (key_id);
create index if not exists entitlements_feature_status_idx on public.entitlements (feature, status);

-- ----------------------------------------------------------------------------
-- 8. Notifications Table
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.entitlements (id) on delete cascade,
  idempotency_key text unique not null,
  kind text not null default 'checkin_reminder',
  title text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'dropped', 'expired')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notifications_queue_idx on public.notifications (status, next_attempt_at)
  where status in ('queued', 'sending');

-- ----------------------------------------------------------------------------
-- 9. App Config Table
-- ----------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 10. Rate Limits Table
-- ----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (bucket, window_start)
);

-- ----------------------------------------------------------------------------
-- 11. Heartbeats Table
-- ----------------------------------------------------------------------------
create table if not exists public.heartbeats (
  entitlement_id uuid primary key references public.entitlements (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  expected_window jsonb not null default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- 12. Legacy Key Import Staging Table
-- ----------------------------------------------------------------------------
create table if not exists public.legacy_key_import_staging (
  id uuid primary key default gen_random_uuid(),
  raw_key_hash text,
  raw_encrypted_key text,
  raw_plan_type text,
  raw_status text,
  raw_channel text,
  raw_region text,
  raw_batch_id text,
  imported_at timestamptz not null default now(),
  processed boolean not null default false,
  error_message text
);

-- ----------------------------------------------------------------------------
-- 13. State Machine Trigger: Orders
-- ----------------------------------------------------------------------------
create or replace function public.enforce_orders_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  is_valid boolean := false;
begin
  if OLD.status = NEW.status then
    NEW.updated_at := pg_catalog.clock_timestamp();
    return NEW;
  end if;

  case OLD.status
    when 'created' then
      is_valid := NEW.status in ('pending', 'failed', 'cancelled');
    when 'pending' then
      is_valid := NEW.status in ('paid', 'failed', 'cancelled');
    when 'paid' then
      is_valid := NEW.status in ('fulfilled', 'refunded', 'partially_refunded', 'disputed');
    when 'fulfilled' then
      is_valid := NEW.status in ('refunded', 'partially_refunded', 'disputed');
    when 'failed' then
      is_valid := NEW.status in ('pending', 'cancelled');
    when 'disputed' then
      is_valid := NEW.status in ('refunded', 'fulfilled', 'cancelled');
    when 'refunded' then
      is_valid := false;
    when 'partially_refunded' then
      is_valid := NEW.status in ('refunded', 'disputed');
    when 'cancelled' then
      is_valid := false;
    else
      is_valid := false;
  end case;

  if not is_valid then
    raise exception 'ILLEGAL_ORDER_STATUS_TRANSITION: Cannot transition from % to %', OLD.status, NEW.status;
  end if;

  NEW.updated_at := pg_catalog.clock_timestamp();
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_orders_status on public.orders;
create trigger trg_enforce_orders_status
  before update of status on public.orders
  for each row
  execute function public.enforce_orders_status_transition();

-- Audit trigger for successful orders status transitions
create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (
      'system',
      'STATUS_TRANSITION',
      'orders',
      NEW.id::text,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_order_status on public.orders;
create trigger trg_audit_order_status
  after update of status on public.orders
  for each row
  execute function public.log_order_status_change();

-- ----------------------------------------------------------------------------
-- 14. State Machine Trigger: License Keys
-- ----------------------------------------------------------------------------
create or replace function public.enforce_license_keys_status_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  is_valid boolean := false;
begin
  if OLD.status = NEW.status then
    NEW.updated_at := pg_catalog.clock_timestamp();
    return NEW;
  end if;

  case OLD.status
    when 'generated' then
      is_valid := NEW.status in ('listed', 'available', 'revoked');
    when 'listed' then
      is_valid := NEW.status in ('available', 'sold', 'activated', 'expired', 'revoked');
    when 'available' then
      is_valid := NEW.status in ('sold', 'activated', 'expired', 'revoked');
    when 'sold' then
      is_valid := NEW.status in ('activated', 'refunded', 'expired', 'revoked');
    when 'activated' then
      is_valid := NEW.status in ('refunded', 'expired', 'revoked');
    when 'expired' then
      is_valid := NEW.status in ('revoked');
    when 'revoked' then
      is_valid := false;
    when 'refunded' then
      is_valid := false;
    else
      is_valid := false;
  end case;

  if not is_valid then
    raise exception 'ILLEGAL_LICENSE_KEY_STATUS_TRANSITION: Cannot transition from % to %', OLD.status, NEW.status;
  end if;

  NEW.updated_at := pg_catalog.clock_timestamp();
  return NEW;
end;
$$;

drop trigger if exists trg_enforce_license_keys_status on public.license_keys;
create trigger trg_enforce_license_keys_status
  before update of status on public.license_keys
  for each row
  execute function public.enforce_license_keys_status_transition();

-- Audit trigger for successful license key status transitions
create or replace function public.log_license_key_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if OLD.status is distinct from NEW.status then
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (
      'system',
      'STATUS_TRANSITION',
      'license_keys',
      NEW.id::text,
      jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_license_key_status on public.license_keys;
create trigger trg_audit_license_key_status
  after update of status on public.license_keys
  for each row
  execute function public.log_license_key_status_change();

-- ----------------------------------------------------------------------------
-- 15. Ingestion RPC: ingest_legacy_keys_from_staging
-- ----------------------------------------------------------------------------
create or replace function public.ingest_legacy_keys_from_staging()
returns table(imported_count integer, duplicate_count integer)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  r record;
  v_imported integer := 0;
  v_duplicate integer := 0;
begin
  for r in (
    select * from public.legacy_key_import_staging
    where processed = false
    order by imported_at asc
  ) loop
    if exists (select 1 from public.license_keys where key_hash = r.raw_key_hash) then
      update public.legacy_key_import_staging
      set processed = true, error_message = 'DUPLICATE_KEY_HASH'
      where id = r.id;
      v_duplicate := v_duplicate + 1;
    else
      insert into public.license_keys (
        key_hash, hash_version, encrypted_key, channel, region, batch_id, plan_code, status, created_at
      ) values (
        r.raw_key_hash,
        1,
        r.raw_encrypted_key,
        coalesce(r.raw_channel, 'website'),
        coalesce(r.raw_region, 'global'),
        coalesce(r.raw_batch_id, 'legacy-import'),
        coalesce(r.raw_plan_type, 'core'),
        coalesce(r.raw_status, 'available'),
        now()
      );

      -- Maintain backward compatibility in key_inventory if available
      insert into public.key_inventory (
        key_hash, plan_type, status, encrypted_key, hash_version, channel, region, batch_id
      ) values (
        r.raw_key_hash,
        coalesce(r.raw_plan_type, 'core'),
        coalesce(r.raw_status, 'available'),
        r.raw_encrypted_key,
        1,
        coalesce(r.raw_channel, 'website'),
        coalesce(r.raw_region, 'global'),
        coalesce(r.raw_batch_id, 'legacy-import')
      ) on conflict (key_hash) do nothing;

      update public.legacy_key_import_staging
      set processed = true, error_message = null
      where id = r.id;

      v_imported := v_imported + 1;
    end if;
  end loop;

  return query select v_imported, v_duplicate;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16. Audit Log Immutability Enforcement
-- ----------------------------------------------------------------------------
create or replace function public.prevent_audit_log_modification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  raise exception 'AUDIT_LOG_IMMUTABLE: Updates and deletes are forbidden on audit_log';
end;
$$;

drop trigger if exists trg_prevent_audit_log_modification on public.audit_log;
create trigger trg_prevent_audit_log_modification
  before update or delete on public.audit_log
  for each row
  execute function public.prevent_audit_log_modification();

-- ----------------------------------------------------------------------------
-- 17. Row Level Security & Permission Grants
-- ----------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.key_inventory enable row level security;
alter table public.issued_licenses enable row level security;
alter table public.license_keys enable row level security;
alter table public.activations enable row level security;
alter table public.entitlements enable row level security;
alter table public.notifications enable row level security;
alter table public.order_outbox enable row level security;
alter table public.refunds enable row level security;
alter table public.disputes enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_config enable row level security;
alter table public.rate_limits enable row level security;
alter table public.heartbeats enable row level security;
alter table public.legacy_key_import_staging enable row level security;

-- Revoke all direct permissions from public, anon, authenticated
revoke all on public.plans from public, anon, authenticated;
revoke all on public.orders from public, anon, authenticated;
revoke all on public.payments from public, anon, authenticated;
revoke all on public.webhook_events from public, anon, authenticated;
revoke all on public.key_inventory from public, anon, authenticated;
revoke all on public.issued_licenses from public, anon, authenticated;
revoke all on public.license_keys from public, anon, authenticated;
revoke all on public.activations from public, anon, authenticated;
revoke all on public.entitlements from public, anon, authenticated;
revoke all on public.notifications from public, anon, authenticated;
revoke all on public.order_outbox from public, anon, authenticated;
revoke all on public.refunds from public, anon, authenticated;
revoke all on public.disputes from public, anon, authenticated;
revoke all on public.support_tickets from public, anon, authenticated;
revoke all on public.support_messages from public, anon, authenticated;
revoke all on public.audit_log from public, anon, authenticated;
revoke all on public.app_config from public, anon, authenticated;
revoke all on public.rate_limits from public, anon, authenticated;
revoke all on public.heartbeats from public, anon, authenticated;
revoke all on public.legacy_key_import_staging from public, anon, authenticated;

-- Grant service_role full administrative access
grant all on public.plans to service_role;
grant all on public.orders to service_role;
grant all on public.payments to service_role;
grant all on public.webhook_events to service_role;
grant all on public.key_inventory to service_role;
grant all on public.issued_licenses to service_role;
grant all on public.license_keys to service_role;
grant all on public.activations to service_role;
grant all on public.entitlements to service_role;
grant all on public.notifications to service_role;
grant all on public.order_outbox to service_role;
grant all on public.refunds to service_role;
grant all on public.disputes to service_role;
grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;
grant all on public.audit_log to service_role;
grant all on public.app_config to service_role;
grant all on public.rate_limits to service_role;
grant all on public.heartbeats to service_role;
grant all on public.legacy_key_import_staging to service_role;

-- Plans: Anon and Authenticated can read active plans
grant select on public.plans to anon, authenticated;
drop policy if exists plans_select_policy on public.plans;
create policy plans_select_policy on public.plans
  for select to anon, authenticated
  using (active = true);

-- App Config: Anon and Authenticated can only read items flagged as public
grant select on public.app_config to anon, authenticated;
drop policy if exists app_config_public_select on public.app_config;
create policy app_config_public_select on public.app_config
  for select to anon, authenticated
  using (is_public = true);

commit;
