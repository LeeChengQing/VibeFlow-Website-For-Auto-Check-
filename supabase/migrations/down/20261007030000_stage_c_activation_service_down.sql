begin;

-- ============================================================================
-- 20261007030000_stage_c_activation_service_down.sql
-- Rollback / Down migration for Stage C activation service RPCs
-- ============================================================================

drop function if exists public.get_key_status(text);
drop function if exists public.deactivate_device(uuid, text);
drop function if exists public.activate_license_key(text, text, text, text);

commit;
