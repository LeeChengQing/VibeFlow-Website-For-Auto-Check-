begin;

-- Distinguish the hosted payment request from its successful transaction.
-- Capture survives a fulfillment rollback, making HTTP-200 stock failures recoverable.
alter table public.orders
  add column provider_request_id text unique,
  add column payment_confirmed_at timestamptz,
  add column fulfillment_error text,
  add constraint orders_provider_request_id_check
    check (provider_request_id is null or btrim(provider_request_id) <> ''),
  add constraint orders_fulfillment_error_check
    check (fulfillment_error is null or fulfillment_error = 'INVENTORY_EXHAUSTED'),
  add constraint orders_payment_confirmation_check
    check (payment_confirmed_at is null or provider_payment_id is not null);

comment on column public.orders.provider_request_id is 'Hosted checkout request ID. Distinct from the captured transaction ID.';
comment on column public.orders.payment_confirmed_at is 'Signed, amount-verified capture recorded before atomic fulfillment; pending may mean paid but awaiting stock.';
comment on column public.orders.fulfillment_error is 'Operational alert; replenish inventory and retry fulfillment using the already-verified payment.';

commit;
