begin;

-- Review before applying: this replaces activation_keys and deletes its rows.
-- No legacy stock or redeemed licenses are copied: the old records lack orders.
-- The admin dashboard must be updated to use this schema before deployment.
-- Fulfillment/payment validation and atomic assignment belong to the future RPC.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  buyer_email text not null,
  plan text not null,
  amount_minor integer not null,
  currency text not null,
  status text not null default 'pending',
  payment_provider text not null,
  -- NULL until the provider returns its identity; non-NULL IDs are globally unique.
  provider_payment_id text unique,

  constraint orders_reference_check check (btrim(reference) <> ''),
  constraint orders_buyer_email_normalized_check check (
    buyer_email <> '' and buyer_email = lower(btrim(buyer_email))
  ),
  constraint orders_plan_check
    check (plan in ('bundle', 'semester', 'yearly', 'internal_check')),
  constraint orders_amount_minor_check check (amount_minor >= 0),
  constraint orders_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint orders_status_check
    check (status in ('pending', 'paid', 'cancelled', 'refunded')),
  constraint orders_payment_provider_check check (btrim(payment_provider) <> ''),
  constraint orders_provider_payment_id_check
    check (provider_payment_id is null or btrim(provider_payment_id) <> '')
);

create table public.key_inventory (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null unique,
  plan_type text not null,
  status text not null default 'available',

  -- Retain the existing SHA-256 format; never store plaintext activation codes.
  constraint key_inventory_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint key_inventory_plan_type_check
    check (plan_type in ('bundle', 'semester', 'yearly', 'internal_check')),
  constraint key_inventory_status_check check (status in ('available', 'assigned'))
);

-- Supports the future claim of available stock for one plan.
create index key_inventory_available_plan_idx
  on public.key_inventory (plan_type, id) where status = 'available';

create table public.issued_licenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete restrict,
  inventory_id uuid not null unique references public.key_inventory (id) on delete restrict,
  buyer_email text not null,
  plan_type text not null,
  device_id text,
  status text not null default 'active',
  -- Issuance does not imply device activation; NULL until first activation.
  activated_at timestamptz,

  constraint issued_licenses_buyer_email_normalized_check check (
    buyer_email <> '' and buyer_email = lower(btrim(buyer_email))
  ),
  constraint issued_licenses_plan_type_check
    check (plan_type in ('bundle', 'semester', 'yearly', 'internal_check')),
  constraint issued_licenses_status_check check (status in ('active', 'revoked'))
);

-- Unique constraints also index payment IDs, hashes and the two license FKs.
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.key_inventory enable row level security;
alter table public.key_inventory force row level security;
alter table public.issued_licenses enable row level security;
alter table public.issued_licenses force row level security;

-- Remove inherited/default table grants, including PUBLIC grants.
revoke all privileges on table
  public.orders, public.key_inventory, public.issued_licenses
  from public, anon, authenticated, service_role;
grant select, insert, update on table
  public.orders, public.key_inventory, public.issued_licenses
  to service_role;

-- No client policies. Supabase's server-only service_role has BYPASSRLS.
-- Revoke/refund via status updates; no service-role DELETE or TRUNCATE grants.
comment on table public.orders is
  'Server-only payment records. Normalize buyer email before insertion; never store key secrets here.';
comment on table public.key_inventory is
  'Private service-only key stock. SHA-256 hashes only; original codes cannot be recovered.';
comment on table public.issued_licenses is
  'Service-only issued entitlements. One license per order and inventory item; active means valid, activated_at records device activation.';

-- Remove the obsolete RPC explicitly: PL/pgSQL body references are not tracked
-- as table dependencies and would otherwise leave a broken callable function.
drop function if exists public.revoke_activation_key(uuid);

-- The original migration defines no policies, but remove any added later too.
do $$
declare
  legacy_policy record;
begin
  for legacy_policy in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'activation_keys'
  loop
    execute format('drop policy %I on public.activation_keys', legacy_policy.policyname);
  end loop;
end
$$;

-- RESTRICT (the default) avoids silently dropping unknown dependent objects.
drop table if exists public.activation_keys;

commit;
