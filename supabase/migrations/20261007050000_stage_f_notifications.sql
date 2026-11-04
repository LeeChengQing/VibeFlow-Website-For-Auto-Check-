-- Stage F: Notification Pipeline Migration
-- Implements enqueue_notification, claim_queued_notifications, complete_notification, and rotate_notification_topic.

-- 1. Enqueue notification RPC with daily cap check and idempotency
create or replace function public.enqueue_notification(
  p_entitlement_id uuid,
  p_event_id text,
  p_kind text,
  p_title text,
  p_body text,
  p_expires_seconds integer default 1200
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_entitlement public.entitlements%rowtype;
  v_idempotency_key text;
  v_existing_id uuid;
  v_today_count integer;
  v_new_id uuid;
  v_expires_at timestamptz;
begin
  if p_expires_seconds is null then
    p_expires_seconds := 1200;
  end if;
  v_expires_at := pg_catalog.clock_timestamp() + (interval '1 second' * p_expires_seconds);

  -- 1. Compute deterministic idempotency key
  v_idempotency_key := encode(sha256((p_entitlement_id::text || ':' || p_event_id)::bytea), 'hex');

  -- 2. Check if already enqueued
  select id into v_existing_id
  from public.notifications
  where idempotency_key = v_idempotency_key;

  if found then
    return v_existing_id;
  end if;

  -- 3. Lock entitlement row & check status
  select * into v_entitlement
  from public.entitlements
  where id = p_entitlement_id
  for update;

  if not found or v_entitlement.status <> 'active' then
    raise exception 'ENTITLEMENT_INACTIVE';
  end if;

  -- 4. Check daily notify cap
  select count(*)::integer into v_today_count
  from public.notifications
  where entitlement_id = p_entitlement_id
    and created_at >= pg_catalog.clock_timestamp() - interval '1 day';

  if v_today_count >= v_entitlement.daily_notify_cap then
    raise exception 'RATE_LIMIT_EXCEEDED';
  end if;

  -- 5. Insert notification record
  insert into public.notifications (
    entitlement_id,
    idempotency_key,
    kind,
    title,
    body,
    status,
    expires_at
  ) values (
    p_entitlement_id,
    v_idempotency_key,
    coalesce(p_kind, 'checkin_reminder'),
    p_title,
    p_body,
    'queued',
    v_expires_at
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

alter function public.enqueue_notification(uuid, text, text, text, text, integer) owner to postgres;
revoke all privileges on function public.enqueue_notification(uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.enqueue_notification(uuid, text, text, text, text, integer) to service_role;

-- 2. Claim queued notifications for worker batch processing
create or replace function public.claim_queued_notifications(
  p_batch_size integer default 10
)
returns table (
  id uuid,
  entitlement_id uuid,
  notify_topic text,
  kind text,
  title text,
  body text,
  attempts integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
begin
  return query
  with claimed as (
    select n.id as claimed_id
    from public.notifications as n
    where n.status in ('queued', 'sending')
      and n.next_attempt_at <= pg_catalog.clock_timestamp()
      and n.attempts < 5
    order by n.next_attempt_at
    limit p_batch_size
    for update skip locked
  ),
  updated as (
    update public.notifications as n
    set status = 'sending',
        attempts = n.attempts + 1
    from claimed
    where n.id = claimed.claimed_id
    returning n.id, n.entitlement_id, n.kind, n.title, n.body, n.attempts, n.expires_at
  )
  select
    u.id,
    u.entitlement_id,
    e.notify_topic,
    u.kind,
    u.title,
    u.body,
    u.attempts,
    u.expires_at
  from updated as u
  left join public.entitlements as e on u.entitlement_id = e.id;
end;
$$;

alter function public.claim_queued_notifications(integer) owner to postgres;
revoke all privileges on function public.claim_queued_notifications(integer) from public, anon, authenticated;
grant execute on function public.claim_queued_notifications(integer) to service_role;

-- 3. Complete notification status update
create or replace function public.complete_notification(
  p_id uuid,
  p_status text,
  p_last_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_attempts integer;
  v_next_status text;
  v_backoff_seconds double precision;
begin
  select attempts into v_attempts
  from public.notifications
  where id = p_id;

  if p_status = 'sent' then
    update public.notifications
    set status = 'sent',
        sent_at = pg_catalog.clock_timestamp(),
        last_error = null
    where id = p_id;
  elsif p_status = 'failed' then
    if v_attempts >= 5 then
      v_next_status := 'failed';
    else
      v_next_status := 'queued';
    end if;
    v_backoff_seconds := power(2::double precision, v_attempts::double precision);
    update public.notifications
    set status = v_next_status,
        next_attempt_at = pg_catalog.clock_timestamp() + (interval '1 second' * v_backoff_seconds),
        last_error = p_last_error
    where id = p_id;
  elsif p_status in ('dropped', 'expired') then
    update public.notifications
    set status = p_status,
        last_error = p_last_error
    where id = p_id;
  end if;
end;
$$;

alter function public.complete_notification(uuid, text, text) owner to postgres;
revoke all privileges on function public.complete_notification(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_notification(uuid, text, text) to service_role;

-- 4. Rotate notification topic RPC
create or replace function public.rotate_notification_topic(
  p_entitlement_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_new_topic text;
begin
  if not exists (select 1 from public.entitlements where id = p_entitlement_id) then
    raise exception 'ENTITLEMENT_NOT_FOUND';
  end if;

  v_new_topic := 'topic_' || replace(gen_random_uuid()::text, '-', '');

  update public.entitlements
  set notify_topic = v_new_topic,
      notify_rotated_at = pg_catalog.clock_timestamp()
  where id = p_entitlement_id;

  return v_new_topic;
end;
$$;

alter function public.rotate_notification_topic(uuid) owner to postgres;
revoke all privileges on function public.rotate_notification_topic(uuid) from public, anon, authenticated;
grant execute on function public.rotate_notification_topic(uuid) to service_role;
