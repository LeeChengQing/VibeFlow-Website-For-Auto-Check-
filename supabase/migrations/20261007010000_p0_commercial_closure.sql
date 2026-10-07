begin;

-- ============================================================================
-- 20261007010000_p0_commercial_closure.sql
-- Implements Appendix A.4 P0 Commercial Closure (Items 1-9):
-- 1. Orders: Terms consent records, private access token hash, release version.
-- 2. Key inventory: Support 'core' key kind, batch/channel attributes, revoked status.
-- 3. Order Outbox: Reliable email delivery, admin alerting and retries.
-- 4. Refunds & Disputes: Structured refund records, audit logs.
-- 5. Support tickets: Production support ticketing storage with RLS.
-- 6. Updated assign_available_key: Fulfills core keys for extension, enqueues outbox.
-- 7. process_refund RPC: Atomic refund, license revocation, inventory mark revoked.
-- ============================================================================

-- 1. Orders: Add columns for terms consent, order access token, release asset
alter table public.orders add column if not exists terms_version text;
alter table public.orders add column if not exists terms_accepted_at timestamptz;
alter table public.orders add column if not exists consent_ip_hash text;
alter table public.orders add column if not exists consent_ua text;
alter table public.orders add column if not exists order_access_token_hash text;
alter table public.orders add column if not exists release_asset_id text;
alter table public.orders add column if not exists app_version text;

-- Update orders status check constraint to support full lifecycle
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (
  status in ('created', 'pending', 'paid', 'fulfilled', 'failed', 'refunded', 'partially_refunded', 'disputed', 'cancelled')
);

-- 2. Key inventory: Update plan_type and status constraints
alter table public.key_inventory drop constraint if exists key_inventory_plan_type_check;
alter table public.key_inventory add constraint key_inventory_plan_type_check check (
  plan_type in ('core', 'bundle', 'extension', 'semester', 'yearly', 'monthly', 'sem_subscription', 'internal_check')
);

alter table public.key_inventory drop constraint if exists key_inventory_status_check;
alter table public.key_inventory add constraint key_inventory_status_check check (
  status in ('generated', 'listed', 'available', 'assigned', 'sold', 'activated', 'expired', 'revoked', 'refunded')
);

alter table public.key_inventory add column if not exists hash_version smallint not null default 1;
alter table public.key_inventory add column if not exists channel text not null default 'website';
alter table public.key_inventory add column if not exists region text not null default 'global';
alter table public.key_inventory add column if not exists batch_id text;

-- Update issued_licenses status and plan_type checks
alter table public.issued_licenses drop constraint if exists issued_licenses_plan_type_check;
alter table public.issued_licenses add constraint issued_licenses_plan_type_check check (
  plan_type in ('core', 'bundle', 'extension', 'semester', 'yearly', 'monthly', 'sem_subscription', 'internal_check')
);

alter table public.issued_licenses drop constraint if exists issued_licenses_status_check;
alter table public.issued_licenses add constraint issued_licenses_status_check check (
  status in ('active', 'revoked', 'expired')
);

-- 3. Order Outbox for reliable email & notification tasks
create table if not exists public.order_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_type text not null,
  idempotency_key text unique not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'dropped')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists order_outbox_queue_idx
  on public.order_outbox (status, next_attempt_at)
  where status in ('pending', 'processing');

alter table public.order_outbox enable row level security;
revoke all on public.order_outbox from public, anon, authenticated;
grant all on public.order_outbox to service_role;

-- 4. Refunds & Disputes
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null,
  provider_ref text,
  amount_minor integer not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  reason text,
  initiated_by text not null,
  created_at timestamptz not null default now()
);

alter table public.refunds enable row level security;
revoke all on public.refunds from public, anon, authenticated;
grant all on public.refunds to service_role;

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  provider text not null,
  provider_ref text,
  status text not null,
  amount_minor integer not null check (amount_minor >= 0),
  opened_at timestamptz not null default now(),
  due_by timestamptz,
  evidence_state text not null default 'pending',
  closed_at timestamptz
);

alter table public.disputes enable row level security;
revoke all on public.disputes from public, anon, authenticated;
grant all on public.disputes to service_role;

-- 5. Customer support ticketing
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  email text not null,
  order_reference text,
  subject text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  access_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated;
grant all on public.support_tickets to service_role;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender text not null check (sender in ('customer', 'admin')),
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.support_messages enable row level security;
revoke all on public.support_messages from public, anon, authenticated;
grant all on public.support_messages to service_role;

-- 6. Audit log
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant all on public.audit_log to service_role;

-- 7. Updated assign_available_key RPC: allocates keys for extension & bundle, queues outbox
create or replace function public.assign_available_key(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  locked_order public.orders%rowtype;
  issued_license_id uuid;
  claimed_inventory_id uuid;
  target_plan text;
  fulfilled_at timestamptz;
  expiration_days integer;
begin
  select o.* into locked_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if locked_order.status in ('paid', 'fulfilled') then
    select l.id into issued_license_id
    from public.issued_licenses as l
    where l.order_id = locked_order.id;

    if not found then
      raise exception 'FULFILLMENT_INCONSISTENT';
    end if;
    return issued_license_id;
  end if;

  if locked_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if exists (select 1 from public.issued_licenses as l where l.order_id = locked_order.id) then
    raise exception 'FULFILLMENT_INCONSISTENT';
  end if;

  fulfilled_at := pg_catalog.clock_timestamp();

  -- Target plan mapping per CODEX_SPEC A.3:
  -- 'extension' requires 'core' key
  -- 'bundle' requires 'bundle' key (or fallback 'semester')
  -- 'semester' requires 'semester' key
  -- 'yearly' requires 'yearly' key
  if locked_order.plan = 'extension' then
    target_plan := 'core';
    expiration_days := null;
  elsif locked_order.plan = 'bundle' then
    target_plan := 'bundle';
    expiration_days := null;
  else
    target_plan := locked_order.plan;
    expiration_days := case
      when target_plan in ('semester', 'sem_subscription') then 130
      when target_plan in ('yearly', 'mobile_notification_yearly') then 365
      when target_plan in ('monthly', 'mobile_notification') then 30
      else null
    end;
  end if;

  -- Find available key in inventory
  select i.id into claimed_inventory_id
  from public.key_inventory as i
  where (
    i.plan_type = target_plan
    or (target_plan = 'core' and i.plan_type = 'extension')
    or (target_plan = 'bundle' and i.plan_type = 'semester')
  )
    and i.status = 'available'
    and i.encrypted_key is not null
  order by
    case when i.plan_type = target_plan then 0 else 1 end,
    i.id
  limit 1
  for update skip locked;

  if not found then
    -- Record durable fulfillment error in order
    update public.orders
    set fulfillment_error = 'INVENTORY_EXHAUSTED'
    where id = locked_order.id;

    raise exception 'INVENTORY_EXHAUSTED';
  end if;

  update public.key_inventory
  set status = 'assigned'
  where id = claimed_inventory_id;

  insert into public.issued_licenses
    (order_id, inventory_id, buyer_email, plan_type, status, expires_at)
  values (
    locked_order.id,
    claimed_inventory_id,
    locked_order.buyer_email,
    target_plan,
    'active',
    case
      when expiration_days is null then null
      else fulfilled_at + pg_catalog.make_interval(days => expiration_days)
    end
  )
  returning id into issued_license_id;

  update public.orders
  set status = 'paid', paid_at = fulfilled_at
  where id = locked_order.id;

  -- Enqueue fulfillment email task into order_outbox
  insert into public.order_outbox
    (order_id, event_type, idempotency_key, payload, status)
  values (
    locked_order.id,
    'order_fulfillment_email',
    'fulfill-email-' || locked_order.id::text,
    jsonb_build_object(
      'order_id', locked_order.id,
      'email', locked_order.buyer_email,
      'plan', locked_order.plan,
      'license_id', issued_license_id
    ),
    'pending'
  )
  on conflict (idempotency_key) do nothing;

  return issued_license_id;
end;
$$;

alter function public.assign_available_key(uuid) owner to postgres;
revoke all privileges on function public.assign_available_key(uuid) from public, anon, authenticated;
grant execute on function public.assign_available_key(uuid) to service_role;

-- 8. Unified process_refund RPC: atomic refund, revocation, outbox queue
create or replace function public.process_refund(
  p_order_id uuid,
  p_amount_minor integer,
  p_reason text,
  p_initiated_by text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  locked_order public.orders%rowtype;
  v_license record;
  v_refund_id uuid;
  v_new_status text;
begin
  select o.* into locked_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if locked_order.status not in ('paid', 'fulfilled') then
    raise exception 'ORDER_NOT_ELIGIBLE_FOR_REFUND';
  end if;

  if p_amount_minor <= 0 or p_amount_minor > locked_order.amount_minor then
    raise exception 'INVALID_REFUND_AMOUNT';
  end if;

  v_new_status := case
    when p_amount_minor >= locked_order.amount_minor then 'refunded'
    else 'partially_refunded'
  end;

  -- Insert refund record
  insert into public.refunds
    (order_id, provider, provider_ref, amount_minor, currency, reason, initiated_by)
  values (
    locked_order.id,
    locked_order.payment_provider,
    locked_order.provider_payment_id,
    p_amount_minor,
    locked_order.currency,
    p_reason,
    p_initiated_by
  )
  returning id into v_refund_id;

  -- Update order status
  update public.orders
  set status = v_new_status
  where id = locked_order.id;

  -- Revoke issued license and key inventory if full refund
  if v_new_status = 'refunded' then
    for v_license in
      select id, inventory_id from public.issued_licenses where order_id = locked_order.id
    loop
      update public.issued_licenses
      set status = 'revoked'
      where id = v_license.id;

      update public.key_inventory
      set status = 'revoked'
      where id = v_license.inventory_id;
    end loop;
  end if;

  -- Enqueue refund email
  insert into public.order_outbox
    (order_id, event_type, idempotency_key, payload, status)
  values (
    locked_order.id,
    'order_refund_email',
    'refund-email-' || v_refund_id::text,
    jsonb_build_object(
      'order_id', locked_order.id,
      'email', locked_order.buyer_email,
      'amount_minor', p_amount_minor,
      'reason', p_reason
    ),
    'pending'
  )
  on conflict (idempotency_key) do nothing;

  -- Enqueue admin refund alert
  insert into public.order_outbox
    (order_id, event_type, idempotency_key, payload, status)
  values (
    locked_order.id,
    'admin_refund_alert',
    'admin-alert-refund-' || v_refund_id::text,
    jsonb_build_object(
      'order_id', locked_order.id,
      'amount_minor', p_amount_minor,
      'currency', locked_order.currency,
      'reason', p_reason
    ),
    'pending'
  )
  on conflict (idempotency_key) do nothing;

  -- Write audit log
  insert into public.audit_log
    (actor, action, entity, entity_id, meta)
  values (
    p_initiated_by,
    'REFUND_ORDER',
    'orders',
    locked_order.id::text,
    jsonb_build_object(
      'refund_id', v_refund_id,
      'amount_minor', p_amount_minor,
      'reason', p_reason
    )
  );

  return v_refund_id;
end;
$$;

alter function public.process_refund(uuid, integer, text, text) owner to postgres;
revoke all privileges on function public.process_refund(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.process_refund(uuid, integer, text, text) to service_role;

commit;
