begin;

alter table public.issued_licenses
  add column expires_at timestamptz;

comment on column public.issued_licenses.expires_at is
  'Expiration timestamp calculated from the key fulfillment timestamp; null for plans without a configured expiration.';

create or replace function public.assign_available_key(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  locked_order public.orders%rowtype;
  target_plan text;
  claimed_inventory_id uuid;
  issued_license_id uuid;
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

  if locked_order.status = 'paid' then
    if locked_order.plan = 'extension' then
      -- Historical extension orders may have received a key before this change.
      -- Retries remain idempotent and never allocate or reveal that old key.
      return null;
    end if;

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

  if locked_order.plan = 'extension' then
    update public.orders
    set status = 'paid', paid_at = fulfilled_at
    where id = locked_order.id;
    return null;
  end if;

  target_plan := case when locked_order.plan = 'bundle' then 'semester' else locked_order.plan end;
  expiration_days := case
    when target_plan in ('semester', 'sem_subscription') then 130
    when target_plan in ('yearly', 'mobile_notification_yearly') then 365
    when target_plan in ('monthly', 'mobile_notification') then 30
    else null
  end;

  select i.id into claimed_inventory_id
  from public.key_inventory as i
  where i.plan_type = target_plan
    and i.status = 'available'
    and i.encrypted_key is not null
  order by i.id
  limit 1
  for update skip locked;

  if not found then
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

  return issued_license_id;
end;
$$;

alter function public.assign_available_key(uuid) owner to postgres;
revoke all privileges on function public.assign_available_key(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_available_key(uuid) to service_role;

comment on function public.assign_available_key(uuid) is
  'Service-only atomic fulfillment. Extension orders are paid without inventory; bundle orders receive a semester key; key-bearing plans receive expiration based on one fulfillment timestamp.';

commit;
