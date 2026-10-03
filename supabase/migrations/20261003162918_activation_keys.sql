begin;

create table public.activation_keys (
  id uuid primary key default gen_random_uuid(),
  key_hash text not null,
  plan_type text not null,
  status text not null default 'available',
  buyer_email text,
  device_id text,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint activation_keys_key_hash_unique unique (key_hash),
  constraint activation_keys_key_hash_format check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint activation_keys_plan_type_check
    check (plan_type in ('bundle', 'semester', 'yearly', 'internal_check')),
  constraint activation_keys_status_check
    check (status in ('available', 'redeemed', 'revoked')),
  constraint activation_keys_available_metadata_check check (
    status <> 'available'
    or (buyer_email is null and device_id is null and redeemed_at is null)
  ),
  constraint activation_keys_redemption_check
    check (status <> 'redeemed' or redeemed_at is not null),
  constraint activation_keys_buyer_email_normalized_check check (
    buyer_email is null
    or (buyer_email <> '' and buyer_email = lower(btrim(buyer_email)))
  )
);

-- The unique constraint already creates the key_hash lookup index.
create index activation_keys_created_at_idx
  on public.activation_keys (created_at desc, id desc);
create index activation_keys_plan_type_status_idx
  on public.activation_keys (plan_type, status);

alter table public.activation_keys enable row level security;
alter table public.activation_keys force row level security;

-- Undo inherited/default grants as well as denying rows through RLS.
revoke all privileges on table public.activation_keys from public, anon, authenticated;
revoke all privileges on table public.activation_keys from service_role;
grant select, insert, update, delete on table public.activation_keys to service_role;

-- No public/browser policies. Supabase's server-only service_role bypasses RLS.
comment on table public.activation_keys is
  'Admin-only activation inventory. Store only SHA-256 hashes; original codes are unrecoverable.';

commit;
