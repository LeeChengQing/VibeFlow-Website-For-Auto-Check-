begin;

-- ============================================================================
-- 20261007030000_stage_c_activation_service.sql
-- Implements Stage C Key Activation, Device Quotas, and Deactivation RPCs:
-- 1. activate_license_key: Single-transaction lock, quota check, idempotency.
-- 2. deactivate_device: User self-serve unbind with audit logging.
-- 3. get_key_status: Safe non-enumerable status metadata lookup.
-- ============================================================================

create or replace function public.activate_license_key(
  p_key_hash text,
  p_device_id_hash text,
  p_app_version text,
  p_client_ip_hash text
)
returns table(
  success boolean,
  status text,
  license_key_id uuid,
  plan_code text,
  features text[],
  valid_until timestamptz,
  max_devices smallint,
  active_devices integer
)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  k public.license_keys%rowtype;
  existing_act public.activations%rowtype;
  v_dev_count integer;
  v_valid_until timestamptz;
  v_features text[];
  v_device_found boolean := false;
begin
  -- 1. Look up key with row lock
  select * into k
  from public.license_keys
  where license_keys.key_hash = p_key_hash
  for update;

  if not found then
    return query select false, 'INVALID_KEY'::text, null::uuid, null::text, null::text[], null::timestamptz, null::smallint, 0;
    return;
  end if;

  if k.status in ('revoked', 'refunded') then
    return query select false, 'REVOKED_KEY'::text, k.id, k.plan_code, null::text[], null::timestamptz, k.max_devices, 0;
    return;
  end if;

  if k.status = 'expired' or (k.valid_until is not null and k.valid_until < now()) then
    return query select false, 'EXPIRED_KEY'::text, k.id, k.plan_code, null::text[], k.valid_until, k.max_devices, 0;
    return;
  end if;

  -- Compute features according to plan_code
  if k.plan_code in ('core', 'extension') then
    v_features := array['core'];
  elsif k.plan_code = 'bundle' then
    v_features := array['core', 'phone_notify'];
  else
    v_features := array['phone_notify'];
  end if;

  -- 2. Check if device is already registered
  select * into existing_act
  from public.activations as a
  where a.key_id = k.id and a.device_id_hash = p_device_id_hash;

  v_device_found := found;

  if v_device_found and existing_act.status = 'active' then
    update public.activations
    set last_seen_at = now(),
        app_version = coalesce(p_app_version, app_version),
        last_ip_hash = coalesce(p_client_ip_hash, last_ip_hash)
    where activations.id = existing_act.id;

    select count(*)::integer into v_dev_count
    from public.activations as a
    where a.key_id = k.id and a.status = 'active';

    return query select true, 'ALREADY_ACTIVATED'::text, k.id, k.plan_code, v_features, k.valid_until, k.max_devices, v_dev_count;
    return;
  end if;

  -- 3. Check device quota
  select count(*)::integer into v_dev_count
  from public.activations as a
  where a.key_id = k.id and a.status = 'active';

  if v_dev_count >= k.max_devices then
    return query select false, 'DEVICE_LIMIT_EXCEEDED'::text, k.id, k.plan_code, null::text[], k.valid_until, k.max_devices, v_dev_count;
    return;
  end if;

  -- 4. Register or reactivate device
  if v_device_found then
    update public.activations
    set status = 'active',
        last_seen_at = now(),
        app_version = coalesce(p_app_version, app_version),
        last_ip_hash = coalesce(p_client_ip_hash, last_ip_hash)
    where activations.id = existing_act.id;
  else
    insert into public.activations (
      key_id, device_id_hash, app_version, last_ip_hash, status
    ) values (
      k.id, p_device_id_hash, p_app_version, p_client_ip_hash, 'active'
    );
  end if;

  v_dev_count := v_dev_count + 1;

  -- 5. Calculate expiration if first activation
  if k.first_activated_at is null then
    if k.plan_code in ('core', 'extension') then
      v_valid_until := null;
    elsif k.plan_code = 'bundle' then
      v_valid_until := now() + interval '130 days';
    elsif k.plan_code in ('semester', 'sem_subscription') then
      v_valid_until := now() + interval '130 days';
    elsif k.plan_code = 'yearly' then
      v_valid_until := now() + interval '365 days';
    else
      v_valid_until := null;
    end if;

    update public.license_keys
    set status = 'activated',
        first_activated_at = now(),
        valid_until = v_valid_until,
        updated_at = now()
    where license_keys.id = k.id;
  else
    v_valid_until := k.valid_until;
  end if;

  -- 6. Ensure Entitlements exist
  if k.plan_code in ('core', 'extension') then
    insert into public.entitlements (key_id, feature, status, valid_until)
    values (k.id, 'core', 'active', null)
    on conflict do nothing;
  elsif k.plan_code = 'bundle' then
    insert into public.entitlements (key_id, feature, status, valid_until)
    values (k.id, 'core', 'active', null)
    on conflict do nothing;

    insert into public.entitlements (key_id, feature, status, valid_until, notify_topic)
    values (k.id, 'phone_notify', 'active', v_valid_until, 'topic_' || replace(gen_random_uuid()::text, '-', ''))
    on conflict do nothing;
  else
    insert into public.entitlements (key_id, feature, status, valid_until, notify_topic)
    values (k.id, 'phone_notify', 'active', v_valid_until, 'topic_' || replace(gen_random_uuid()::text, '-', ''))
    on conflict do nothing;
  end if;

  -- 7. Audit log
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (
    'system',
    'KEY_ACTIVATED',
    'license_keys',
    k.id::text,
    jsonb_build_object(
      'device_id_hash', p_device_id_hash,
      'app_version', p_app_version,
      'active_devices', v_dev_count
    )
  );

  return query select true, 'ACTIVATED'::text, k.id, k.plan_code, v_features, v_valid_until, k.max_devices, v_dev_count;
end;
$$;

create or replace function public.deactivate_device(
  p_key_id uuid,
  p_device_id_hash text
)
returns table(success boolean)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  affected_count integer;
begin
  update public.activations
  set status = 'deactivated',
      last_seen_at = now()
  where activations.key_id = p_key_id
    and activations.device_id_hash = p_device_id_hash
    and activations.status = 'active';

  get diagnostics affected_count = row_count;

  if affected_count > 0 then
    insert into public.audit_log (actor, action, entity, entity_id, meta)
    values (
      'system',
      'DEVICE_DEACTIVATED',
      'license_keys',
      p_key_id::text,
      jsonb_build_object('device_id_hash', p_device_id_hash)
    );
    return query select true;
  else
    return query select false;
  end if;
end;
$$;

create or replace function public.get_key_status(p_key_hash text)
returns table(
  key_found boolean,
  status text,
  plan_code text,
  valid_until timestamptz,
  max_devices smallint,
  active_devices integer
)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  k public.license_keys%rowtype;
  dev_count integer;
begin
  select * into k
  from public.license_keys
  where license_keys.key_hash = p_key_hash;

  if not found then
    return query select false, null::text, null::text, null::timestamptz, null::smallint, 0;
    return;
  end if;

  select count(*)::integer into dev_count
  from public.activations as a
  where a.key_id = k.id and a.status = 'active';

  return query select true, k.status, k.plan_code, k.valid_until, k.max_devices, dev_count;
end;
$$;

revoke all on function public.activate_license_key(text, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_license_key(text, text, text, text) to service_role;

revoke all on function public.deactivate_device(uuid, text) from public, anon, authenticated;
grant execute on function public.deactivate_device(uuid, text) to service_role;

revoke all on function public.get_key_status(text) from public, anon, authenticated;
grant execute on function public.get_key_status(text) to service_role;

commit;
