-- Apply only this reviewed migration to the exported v14 database baseline.
-- No payment tables, phone entitlements, existing device credentials or data are changed.
create table public.plugin_licenses (
  id uuid primary key default gen_random_uuid(),
  license_key_hash text not null unique check (license_key_hash ~ '^[0-9a-f]{64}$'),
  plan text not null check (plan in ('trial','semester_license','lifetime_license')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  max_devices integer not null default 1 check (max_devices between 1 and 100),
  expires_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (plan='lifetime_license' or expires_at is not null)
);
create table public.plugin_license_activations (
  license_id uuid not null references public.plugin_licenses(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  activated_at timestamptz not null default now(),
  primary key (license_id,device_id)
);
create index plugin_license_activations_device_idx on public.plugin_license_activations(device_id);
create table public.plugin_license_events (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.plugin_licenses(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  event_type text not null check (event_type in ('issued','activated','revoked')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index plugin_license_events_license_idx on public.plugin_license_events(license_id);
create index plugin_license_events_device_idx on public.plugin_license_events(device_id);
create table private.plugin_license_attempts (
  device_id uuid primary key references public.devices(id) on delete cascade,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts>0)
);
alter table public.plugin_licenses enable row level security;
alter table public.plugin_license_activations enable row level security;
alter table public.plugin_license_events enable row level security;
alter table private.plugin_license_attempts enable row level security;
revoke all on public.plugin_licenses,public.plugin_license_activations,public.plugin_license_events,private.plugin_license_attempts from public,anon,authenticated;
grant select on public.plugin_licenses,public.plugin_license_activations,public.plugin_license_events to service_role;

create function public.issue_plugin_license(p_key_hash text,p_plan text,p_expires_at timestamptz,p_max_devices integer,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.plugin_licenses%rowtype;
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' or p_plan is null or p_plan not in ('trial','semester_license','lifetime_license')
    or p_max_devices is null or p_max_devices not between 1 and 100
    or p_plan<>'lifetime_license' and p_expires_at is null or p_expires_at<=clock_timestamp() then
    return jsonb_build_object('ok',false,'error','invalid_parameters');
  end if;
  insert into public.plugin_licenses(license_key_hash,plan,expires_at,max_devices,note)
    values(p_key_hash,p_plan,p_expires_at,p_max_devices,left(coalesce(p_note,''),500)) returning * into l;
  insert into public.plugin_license_events(license_id,event_type,note) values(l.id,'issued',l.note);
  return jsonb_build_object('ok',true,'license_id',l.id,'plan',l.plan,'expires_at',l.expires_at,'max_devices',l.max_devices);
exception when unique_violation then
  return jsonb_build_object('ok',false,'error','license_candidate_conflict');
end $$;

create function public.activate_plugin_license_for_device(p_license_key_hash text,p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.plugin_licenses%rowtype; a private.plugin_license_attempts%rowtype; t timestamptz:=clock_timestamp();
begin
  -- Lock order is always device -> attempt counter -> license. The license lock
  -- serializes competing devices claiming the last seat.
  perform 1 from public.devices where id=p_device_id for update;
  if not found then return jsonb_build_object('ok',false,'error','invalid_device'); end if;
  insert into private.plugin_license_attempts(device_id,window_started_at,attempts) values(p_device_id,t,1)
    on conflict(device_id) do update set
      attempts=case when plugin_license_attempts.window_started_at+interval '60 seconds'>t then plugin_license_attempts.attempts+1 else 1 end,
      window_started_at=case when plugin_license_attempts.window_started_at+interval '60 seconds'>t then plugin_license_attempts.window_started_at else t end
    returning * into a;
  if a.attempts>10 then
    return jsonb_build_object('ok',false,'error','rate_limited','retry_after',greatest(1,ceil(extract(epoch from a.window_started_at+interval '60 seconds'-t)))::integer);
  end if;
  if p_license_key_hash is null or p_license_key_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'error','invalid_license_key');
  end if;
  select * into l from public.plugin_licenses where license_key_hash=p_license_key_hash for update;
  if not found then return jsonb_build_object('ok',false,'error','invalid_license_key'); end if;
  if l.status<>'active' or l.expires_at<=clock_timestamp() then return jsonb_build_object('ok',false,'error','invalid_license_key'); end if;
  if exists(select 1 from public.plugin_license_activations where license_id=l.id and device_id=p_device_id) then
    return jsonb_build_object('ok',true,'plan',l.plan,'expires_at',l.expires_at,'already_activated',true);
  end if;
  if (select count(*) from public.plugin_license_activations where license_id=l.id)>=l.max_devices then
    return jsonb_build_object('ok',false,'error','invalid_license_key');
  end if;
  insert into public.plugin_license_activations(license_id,device_id,activated_at) values(l.id,p_device_id,clock_timestamp());
  insert into public.plugin_license_events(license_id,device_id,event_type) values(l.id,p_device_id,'activated');
  return jsonb_build_object('ok',true,'plan',l.plan,'expires_at',l.expires_at,'already_activated',false);
end $$;

create function public.validate_device_plugin_license(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.plugin_licenses%rowtype;
begin
  select licenses.* into l from public.plugin_licenses licenses
    join public.plugin_license_activations a on a.license_id=licenses.id
    where a.device_id=p_device_id
    order by (licenses.status='active' and (licenses.expires_at is null or licenses.expires_at>clock_timestamp())) desc,
      a.activated_at desc,licenses.created_at desc,licenses.id limit 1;
  if not found then return jsonb_build_object('licensed',false,'reason','not_activated'); end if;
  if l.status='revoked' then return jsonb_build_object('licensed',false,'reason','license_revoked','plan',l.plan,'expires_at',l.expires_at); end if;
  if l.status='expired' or l.expires_at<=clock_timestamp() then
    return jsonb_build_object('licensed',false,'reason','license_expired','plan',l.plan,'expires_at',l.expires_at);
  end if;
  return jsonb_build_object('licensed',true,'plan',l.plan,'expires_at',l.expires_at);
end $$;

create function public.revoke_plugin_license(p_license_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.plugin_licenses%rowtype;
begin
  select * into l from public.plugin_licenses where id=p_license_id for update;
  if not found then return jsonb_build_object('ok',false,'error','license_not_found'); end if;
  if l.status<>'revoked' then
    update public.plugin_licenses set status='revoked',updated_at=clock_timestamp() where id=l.id;
    insert into public.plugin_license_events(license_id,event_type,note) values(l.id,'revoked',left(coalesce(p_note,''),500));
  end if;
  return jsonb_build_object('ok',true,'license_id',l.id,'status','revoked');
end $$;

revoke all on function public.issue_plugin_license(text,text,timestamptz,integer,text) from public,anon,authenticated;
revoke all on function public.activate_plugin_license_for_device(text,uuid) from public,anon,authenticated;
revoke all on function public.validate_device_plugin_license(uuid) from public,anon,authenticated;
revoke all on function public.revoke_plugin_license(uuid,text) from public,anon,authenticated;
grant execute on function public.issue_plugin_license(text,text,timestamptz,integer,text) to service_role;
grant execute on function public.activate_plugin_license_for_device(text,uuid) to service_role;
grant execute on function public.validate_device_plugin_license(uuid) to service_role;
grant execute on function public.revoke_plugin_license(uuid,text) to service_role;
