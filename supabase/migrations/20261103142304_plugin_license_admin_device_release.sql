-- Apply only to qckpwckfukyurkobrsig after plugin_authorization_core.
-- Device release frees a seat only; it does not mark the former device revoked.
-- Preserve devices/credentials, schedules, phone entitlements and existing RPC behavior.
alter table public.plugin_license_events drop constraint plugin_license_events_event_type_check;
alter table public.plugin_license_events add constraint plugin_license_events_event_type_check
  check(event_type in ('issued','activated','revoked','unbound'));

create function public.release_plugin_license_device(p_license_id uuid,p_device_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if p_note is null or length(btrim(p_note))=0 or length(p_note)>500 then
    return jsonb_build_object('ok',false,'error','invalid_parameters');
  end if;
  -- Match activation's device -> license lock order. Audit and seat release are atomic.
  perform 1 from public.devices where id=p_device_id for update;
  if not found then return jsonb_build_object('ok',false,'error','device_not_found'); end if;
  perform 1 from public.plugin_licenses where id=p_license_id for update;
  if not found then return jsonb_build_object('ok',false,'error','license_not_found'); end if;
  delete from public.plugin_license_activations where license_id=p_license_id and device_id=p_device_id;
  get diagnostics changed=row_count;
  if changed>0 then
    insert into public.plugin_license_events(license_id,device_id,event_type,note)
      values(p_license_id,p_device_id,'unbound',p_note);
  end if;
  return jsonb_build_object('ok',true,'released',changed>0);
end $$;

revoke all on function public.release_plugin_license_device(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.release_plugin_license_device(uuid,uuid,text) to service_role;
