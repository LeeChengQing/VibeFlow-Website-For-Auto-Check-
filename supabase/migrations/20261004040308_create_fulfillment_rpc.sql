begin;

-- The commerce schema did not include the timestamp required by fulfillment.
alter table public.orders add column paid_at timestamptz;

create function public.assign_available_key(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_order public.orders%rowtype;
  claimed_inventory_id uuid;
  issued_license_id uuid;
begin
  -- Same-order callbacks serialize here. Read state only after acquiring the lock.
  select o.* into locked_order
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if locked_order.status = 'paid' then
    select l.id into issued_license_id
    from public.issued_licenses as l
    where l.order_id = locked_order.id;

    if not found then
      -- A paid order without its license is inconsistent; never allocate again.
      raise exception 'FULFILLMENT_INCONSISTENT';
    end if;
    -- Return the original entitlement even if it was later revoked.
    return issued_license_id;
  end if;

  if locked_order.status <> 'pending' then
    raise exception 'ORDER_NOT_PENDING';
  end if;

  if exists (select 1 from public.issued_licenses as l where l.order_id = locked_order.id) then
    raise exception 'FULFILLMENT_INCONSISTENT';
  end if;

  -- Different orders skip stock locked by another transaction. LIMIT 1 and the
  -- unique inventory_id relationship prevent claiming/issuing multiple keys.
  select i.id into claimed_inventory_id
  from public.key_inventory as i
  where i.plan_type = locked_order.plan and i.status = 'available'
  order by i.id
  limit 1
  for update skip locked;

  if not found then
    raise exception 'INVENTORY_EXHAUSTED';
  end if;

  update public.key_inventory
  set status = 'assigned'
  where id = claimed_inventory_id;

  insert into public.issued_licenses (order_id, inventory_id, buyer_email, plan_type, status)
  values (locked_order.id, claimed_inventory_id, locked_order.buyer_email, locked_order.plan, 'active')
  returning id into issued_license_id;

  update public.orders
  set status = 'paid', paid_at = pg_catalog.now()
  where id = locked_order.id;

  -- Do not catch failures: every mutation above must roll back together.
  return issued_license_id;
end;
$$;

-- The trusted definer must bypass the tables' forced RLS. Browser callers have
-- no EXECUTE privilege, including PostgreSQL's default PUBLIC function grant.
alter function public.assign_available_key(uuid) owner to postgres;
revoke all privileges on function public.assign_available_key(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.assign_available_key(uuid) to service_role;

comment on function public.assign_available_key(uuid) is
  'Service-only atomic fulfillment for an order whose payment was verified by the server. Returns the existing or newly issued license UUID; raises INVENTORY_EXHAUSTED if matching stock is absent or locked. No secrets are returned.';

commit;
