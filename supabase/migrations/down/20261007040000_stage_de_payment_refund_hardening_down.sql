-- Down migration for Stage D/E payment and refund hardening
-- Restores previous process_refund definition from 20261007010000_p0_commercial_closure.sql

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

  update public.orders
  set status = v_new_status
  where id = locked_order.id;

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

  return v_refund_id;
end;
$$;

alter function public.process_refund(uuid, integer, text, text) owner to postgres;
revoke all privileges on function public.process_refund(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.process_refund(uuid, integer, text, text) to service_role;
