-- Stage D/E: Payment & Refund hardening migration
-- Upgrades process_refund RPC to revoke license_keys, entitlements, and clear activations.

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

    -- Update unified license_keys
    update public.license_keys
    set status = 'revoked',
        revoked_reason = coalesce(p_reason, 'refunded')
    where order_id = locked_order.id
       or id in (select inventory_id from public.issued_licenses where order_id = locked_order.id);

    -- Revoke entitlements
    update public.entitlements
    set status = 'revoked'
    where key_id in (
      select id from public.license_keys where order_id = locked_order.id
    );

    -- Delete or mark activations
    delete from public.activations
    where key_id in (
      select id from public.license_keys where order_id = locked_order.id
    );
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
