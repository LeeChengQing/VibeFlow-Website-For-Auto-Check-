# HitPay sandbox integration

The backend routes are `POST /api/hitpay/checkout` and `POST /api/hitpay/webhook`, using Next.js Node Route Handlers. Storefront purchase buttons use the shared `components/BuyButton.tsx`: clicking opens an email form, then posts the canonical plan and buyer email to HitPay checkout and navigates to the returned sandbox hosted URL. The old local order flow is no longer called by storefront buttons. Provider requests and browser redirects are exercised with mocked HTTP responses in tests; a real sandbox transaction has not been run.

The standalone extension package has no corresponding canonical commerce plan; its checkout is disabled with an explanation. The shared button preserves published availability and preview guards, prevents duplicate submissions, and displays localized errors for invalid email, checkout availability, and provider/network failures.

## Configuration

Set the server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HITPAY_API_KEY`, and `HITPAY_WEBHOOK_SALT`. Set `HITPAY_ENVIRONMENT=sandbox` and `HITPAY_ENABLED=true` when ready to exercise sandbox checkout. The implementation rejects other environments. Missing configuration fails closed; secrets never appear in client responses or logs.

Use credentials from a separate [HitPay sandbox account](https://docs.hitpayapp.com/apis/guide/sandbox). Payment requests go only to `https://api.sandbox.hit-pay.com/v1/payment-requests`, and returned hosted URLs must use `https://securecheckout.sandbox.hit-pay.com`.

Register a publicly reachable HTTPS `/api/hitpay/webhook` URL as a JSON event webhook endpoint in the HitPay dashboard. Subscribe to `charge.created` and/or `payment_request.completed`; set `HITPAY_WEBHOOK_SALT` to that endpoint's salt. This uses the [raw-body `Hitpay-Signature` contract](https://docs.hitpayapp.com/apis/guide/events). Do not pass this URL in the legacy payment-request `webhook` field: that callback uses a different form-encoded contract.

## Checkout

```json
{"buyer_email":"buyer@example.com","plan":"bundle"}
```

The response is `{"url":"https://securecheckout.sandbox.hit-pay.com/...","reference":"<order UUID>"}`. A pending order is committed first; its UUID is also its reference. Buyer email is normalized, and client price/currency fields have no effect.

Public canonical plans map to published packages: `bundle` → `bundle`, `semester` → `mobile_notification`, `yearly` → `mobile_notification_yearly`. Prices include active scheduled promotions. Maintenance, disabled checkout, or a hidden/disabled public package blocks checkout. `internal_check` always invokes `requireAdminSession()` before proceeding; missing/invalid sessions return 403. Its fixed server-side price is MYR 1.00 (100 minor units). The global maintenance/checkout switches also apply to this plan. Server-calculated prices below MYR 1.00 are rejected.

The [Payment Request API](https://docs.hitpayapp.com/apis/payment-request/create-request) receives MYR major units, email, UUID reference and `allow_repeated_payments=false`. The returned request ID is stored separately from the eventual transaction ID. Provider failures leave pending orders for reconciliation; ambiguous POST timeouts are not retried automatically.

## Webhook and recovery

The handler authenticates the exact raw bytes with HMAC-SHA-256 and a strict 64-character hexadecimal signature, comparing equal-sized buffers with `timingSafeEqual`. Body sizes are bounded. JSON parsing and privileged DB access follow verification. Unsupported/refund/failed events receive an acknowledgment without issuing a license.

For `charge.created`, the body must have status `succeeded`, a transaction UUID `id`, a UUID `payment_request_id`, amount and currency. A supplied `payment_request.reference_number` must match the saved reference. When the embedded request is absent, the saved unique request ID establishes the order identity. POS charges without a request are ignored.

For `payment_request.completed`, the body must have status `completed`, UUID `id`, UUID `reference_number`, amount/currency and a `payments` array with exactly one successful (`succeeded` or `completed`) transaction containing UUID `id` and matching amount/currency. Nonzero refunds are rejected. HitPay's current event guide has an inconsistent completion example; capture and check an actual sandbox event against these documented request/charge fields before enabling an account's webhook.

Both paths require the stored provider request ID, exact currency and exact amount in minor units. A transaction cannot overwrite a different captured transaction or be assigned to two orders. Verified capture is committed with a conditional update before `assign_available_key`; duplicate callbacks call the idempotent RPC safely. RPC errors other than `INVENTORY_EXHAUSTED` return 500 for retry. Exhaustion emits a redacted critical log and returns `{"ok":true}` with HTTP 200, while preserving the capture and marking the pending order with `fulfillment_error=INVENTORY_EXHAUSTED` when possible.

Monitor pending captures, including failures whose alert write could not complete:

```sql
select id, reference, plan, amount_minor, currency,
       provider_request_id, provider_payment_id, payment_confirmed_at, fulfillment_error
from public.orders
where payment_provider = 'hitpay'
  and status = 'pending'
  and provider_payment_id is not null;
```

After replenishment, retry the same verified callback or have an authorized server operator call `assign_available_key` for the already-verified order. Confirm it is paid, then clear its stale `fulfillment_error`. No anonymous reconciliation endpoint is exposed. HTTP-200 exhaustion does not itself retry fulfillment; operational recovery is required. Route tests simulate concurrent callbacks; the SQL tests use a single embedded PostgreSQL connection, so actual multi-session contention and live provider delivery remain unverified.

`20261004040308_create_fulfillment_rpc.sql` and `20261004042022_hitpay_payment_tracking.sql` are deployed to Auto-Check (`pocsafloidsjsgriopip`). Migration history matches the local filenames; the client tables remain service-only with forced RLS. See [commerce deployment](commerce-fulfillment-setup.md).

Verification: `npm test`, `npm run typecheck`, `npm run build`, and `npx playwright test --config playwright.hitpay.config.ts`.
