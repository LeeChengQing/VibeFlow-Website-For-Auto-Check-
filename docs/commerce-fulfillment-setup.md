# Commerce migration and fulfillment RPC

## Applied schema

On 2026-10-04 the exact contents of `supabase/migrations/20261004032804_commerce_and_inventory.sql` were applied through the authorized Supabase connector to **Auto-Check**, project `pocsafloidsjsgriopip` under the `VibeFlow_MY` connection.

Live verification confirmed that `activation_keys` and `revoke_activation_key(uuid)` are absent, and `orders`, `key_inventory` and `issued_licenses` exist with RLS enabled and forced. The anon/authenticated roles have no SELECT privileges; service_role has SELECT/INSERT/UPDATE. All three tables were empty after application. The legacy table had zero rows before application.

The security advisor returned informational “RLS Enabled No Policy” notices only, consistent with the intentional service-only tables and absent browser grants. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

### Migration history

The connector initially recorded server-generated versions. On 2026-10-04 the five known history rows were reconciled atomically to the repository filenames, with guards against changed rows or conflicting versions. Only version metadata changed; stored names/statements and the schema were preserved. The mapping was:

| Migration | Repository / current live version | Previous connector version |
| --- | --- | --- |
| activation_keys | 20261003162918 | 20261003195701 |
| site_management | 20261003182731 | 20261003195707 |
| commerce_and_inventory | 20261004032804 | 20261004040137 |
| create_fulfillment_rpc | 20261004040308 | 20261004041503 |
| hitpay_payment_tracking | 20261004042022 | 20261004042734 |

Live history now matches all five repository migrations. The project still has no local CLI project link configured; application and verification used the authorized Supabase connector.

## Deployed fulfillment migration

`supabase/migrations/20261004040308_create_fulfillment_rpc.sql` adds nullable `orders.paid_at` and defines:

```sql
public.assign_available_key(p_order_id uuid) returns uuid
```

Applied to Auto-Check on 2026-10-04. Live catalog checks confirmed `paid_at`, `SECURITY DEFINER`, `search_path=public`, service_role EXECUTE and denied anon/authenticated EXECUTE.

The function runs as `SECURITY DEFINER`, owned by postgres, with `search_path = public`. All table references are schema-qualified. EXECUTE is revoked from PUBLIC, anon and authenticated, then granted only to service_role. The privileged owner is needed for the tables' forced RLS.

The function locks the order before checking its state. Paid orders return their existing license ID, including a later-revoked license, without changing any state. A paid order with no license or a pending order with an existing license raises `FULFILLMENT_INCONSISTENT`; unknown IDs raise `ORDER_NOT_FOUND`; cancelled/refunded orders raise `ORDER_NOT_PENDING`.

For pending orders it locks one available key for the order's exact plan with `FOR UPDATE SKIP LOCKED`. No matching unlocked stock raises `INVENTORY_EXHAUSTED`. This includes temporary contention when all matching stock is locked, so the caller may retry later. Inventory assignment, license creation from the stored order identity, and the order's paid status/timestamp commit together. Errors propagate and roll back every mutation. Existing unique order_id/inventory_id constraints protect against duplicate issuance.

Only the trusted server may call this RPC after verifying the HitPay webhook signature, payment identity, reference, amount and currency against the order. This RPC accepts only an order UUID and does not perform provider verification. The deployed `20261004042022_hitpay_payment_tracking.sql` migration adds `provider_request_id`, `payment_confirmed_at` and `fulfillment_error`; the webhook commits the verified `provider_payment_id` and capture timestamp before invoking the RPC. Exhaustion leaves that capture durable and the order pending, records/logs an alert, and acknowledges HTTP 200. See [HitPay setup](hitpay-integration-setup.md) for recovery.

Run `npm test` for the full suite and `npm run typecheck` for the typed client. `tests/fulfillment-rpc.test.ts` exercises the real migration in embedded PostgreSQL, including execute privileges, plan matching, replay behavior, stock exhaustion and failures injected after earlier writes. PGlite has one connection; these tests do not establish contention behavior between independent PostgreSQL sessions. Run multi-session contention tests before connecting live payments.
