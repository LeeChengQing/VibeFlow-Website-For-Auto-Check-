-- Keep commerce, inventory and issued licenses on the same canonical plan set.
-- Existing rows, RLS policies, privileges and the fulfillment RPC are unchanged.
begin;

alter table public.orders
  drop constraint orders_plan_check,
  add constraint orders_plan_check
    check (plan in ('bundle', 'extension', 'semester', 'yearly', 'internal_check'));

alter table public.key_inventory
  drop constraint key_inventory_plan_type_check,
  add constraint key_inventory_plan_type_check
    check (plan_type in ('bundle', 'extension', 'semester', 'yearly', 'internal_check'));

alter table public.issued_licenses
  drop constraint issued_licenses_plan_type_check,
  add constraint issued_licenses_plan_type_check
    check (plan_type in ('bundle', 'extension', 'semester', 'yearly', 'internal_check'));

commit;
