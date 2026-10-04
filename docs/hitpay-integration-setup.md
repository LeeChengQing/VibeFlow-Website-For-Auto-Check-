# HitPay sandbox integration

The backend routes are `POST /api/hitpay/checkout` and `POST /api/hitpay/webhook`, using Next.js Node Route Handlers. Storefront purchase buttons use the shared `components/BuyButton.tsx`: clicking opens an email modal, then posts the canonical plan and buyer email to HitPay checkout and navigates to the returned sandbox hosted URL. The old local order flow is no longer called by storefront buttons. Provider request creation has been checked against the live sandbox; browser redirects are exercised with mocked HTTP responses. No sandbox payment has been completed.

Standalone browser extension checkout uses the canonical `extension` plan. Both desktop and mobile purchase actions open the same email modal. The shared button preserves published availability and preview guards, prevents duplicate submissions, and displays localized errors for invalid email, checkout availability, and provider/network failures.

Before deploying extension checkout, apply `20261004115610_enable_extension_checkout.sql` to expand the plan constraints on `orders`, `key_inventory`, and `issued_licenses`. The admin plan selector supports provisioning extension stock. Fulfillment requires available `extension` inventory; it never consumes bundle or notification keys. Its default published price is MYR 24.99 (2499 minor units), with checkout using the published configuration and active promotions. This new migration has been tested locally, but has not been applied to the hosted database in this fix.

## Configuration

Set the server-only `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HITPAY_API_KEY`, and `HITPAY_WEBHOOK_SALT`. Set `HITPAY_ENVIRONMENT=sandbox` and `HITPAY_ENABLED=true` when ready to exercise sandbox checkout. The implementation rejects other environments. Missing configuration fails closed; secrets never appear in client responses or logs.

Use credentials from a separate [HitPay sandbox account](https://docs.hitpayapp.com/apis/guide/sandbox). Payment requests go only to `https://api.sandbox.hit-pay.com/v1/payment-requests`. The shared server/browser URL validator allows only HTTPS on `checkout.sandbox.hit-pay.com` or `securecheckout.sandbox.hit-pay.com`, without embedded credentials or nonstandard ports. Production hosts and lookalike subdomains are rejected.

Register a publicly reachable HTTPS `/api/hitpay/webhook` URL as a JSON event webhook endpoint in the HitPay dashboard. Subscribe to `charge.created` and/or `payment_request.completed`; set `HITPAY_WEBHOOK_SALT` to that endpoint's salt. This uses the [raw-body `Hitpay-Signature` contract](https://docs.hitpayapp.com/apis/guide/events). Do not pass this URL in the legacy payment-request `webhook` field: that callback uses a different form-encoded contract.

## Checkout

Once the shared purchase modal receives and validates the hosted checkout URL, it replaces the email form with a faded-in secure loading state and a three-second countdown. The modal remains locked against duplicate submissions and dismissal during handoff. Its countdown interval is cleared on completion or unmount, and browser Back restoration resets the handoff state.

The payment request includes `redirect_url` pointing to `/success` on the checkout request's origin. HitPay appends its payment request UUID as `reference`. The return page validates this UUID and reads only the saved order status and webhook confirmation timestamp through the existing server-only commerce client. It never treats the query-string `status` as proof of payment. During its five-second return-to-home countdown, pending confirmation is refreshed once per second; both intervals are cleaned up. Confirmed issuance shows the animated checkmark, while pending or unavailable confirmation shows accurate status copy. The current integration does not send license emails or track email delivery, so the page does not claim an email was sent.

```json
{"buyer_email":"buyer@example.com","plan":"bundle"}
```

The response is `{"url":"https://securecheckout.sandbox.hit-pay.com/...","reference":"<order UUID>"}`. A pending order is committed first; its UUID is also its reference. Buyer email is normalized, and client price/currency fields have no effect.

Public canonical plans map to published packages: `bundle` → `bundle`, `extension` → `extension`, `semester` → `mobile_notification`, `yearly` → `mobile_notification_yearly`. Prices include active scheduled promotions. Maintenance, disabled checkout, or a hidden/disabled public package blocks checkout. `internal_check` always invokes `requireAdminSession()` before proceeding; missing/invalid sessions return 403. Its fixed server-side price is MYR 1.00 (100 minor units). The global maintenance/checkout switches also apply to this plan. Server-calculated prices below MYR 1.00 are rejected.

The [Payment Request API](https://docs.hitpayapp.com/apis/payment-request/create-request) receives MYR major units, email, UUID reference and `allow_repeated_payments=false`. The returned request ID is stored separately from the eventual transaction ID. Provider failures leave pending orders for reconciliation; ambiguous POST timeouts are not retried automatically.

## Checkout failure diagnostics

On October 4, 2026, a read-only sandbox credential check returned HTTP 200. A request using the existing JSON fields and `amount="35.00"`, `currency="MYR"` returned HTTP 201 and a URL on `checkout.sandbox.hit-pay.com`. The previous backend and frontend validators accepted only `securecheckout.sandbox.hit-pay.com`, so a successful creation was reported as `PAYMENT_PROVIDER_UNAVAILABLE`. Both now use the same validator supporting the two exact sandbox hosts.

JSON is supported by the API reference. The previously used major-unit decimal strings were accepted by the sandbox; the patch aligns with the current OpenAPI schema by sending a numeric major-unit amount, e.g. `24.99`, derived from integer minor units. `currency` is always `MYR`. The API declares `allow_repeated_payments`, `send_email`, and `send_sms` as string enums, so those remain `"false"`. Request headers include `X-BUSINESS-API-KEY`, `Content-Type: application/json`, `Accept: application/json` and `X-Requested-With: XMLHttpRequest`. The webhook salt verifies incoming webhooks and is not sent when creating checkout.

Search the server terminal or Vercel function logs for `HITPAY_CHECKOUT_FAILED`. Each event includes order ID, sandbox endpoint, plan, amount/currency, elapsed milliseconds, failure phase (`request`, `response`, `decode`, `validate`), provider HTTP status and content type, error name/message, transport cause code/message, and a redacted response body capped at 4096 characters plus a truncation marker. Successful provider response reads are capped at 64 KiB. Credentials and buyer data are redacted in this event.

An HTTP rejection additionally emits `HITPAY_PROVIDER_REJECTED` after `await response.text()`. It records the HTTP status, provider response text without JSON parsing or truncation, and `requestPayload`, the exact serialized JSON string used as the fetch body. Known API-key and webhook-salt values are redacted if echoed by the provider. Authentication headers are never logged. This explicitly requested diagnostic contains buyer email and any personal data returned by the provider, so restrict access and retention for these server logs. Client responses retain only the generic error code; neither diagnostic is sent to the browser. Logging does not retry the provider POST.

Interpretation: `request` with a timeout/DNS/TLS cause indicates transport failure; `response` with 401/403 suggests API-key/account authorization, 422 indicates payload validation, and 429/5xx indicates rate limiting/provider failure. `decode` indicates a non-JSON response; `validate` distinguishes an invalid provider ID or disallowed checkout URL from a failed HTTP request. Consult the recorded response body and [sandbox request logs](https://docs.hitpayapp.com/apis/guide/sandbox) before changing credentials or payloads. Do not automatically retry creation after a timeout.

After the fix, the local production build's `/api/hitpay/checkout` route returned HTTP 200 using the real sandbox provider, numeric major-unit payload and current published bundle price. The latest diagnostic pending order is `65cf4c92-e05d-4d1a-b4f4-937c6ed3d7fc`, linked to provider request `a2e6a72d-4cf8-4a30-9b5d-eeea8f97703e` on `checkout.sandbox.hit-pay.com`. A direct probe with the former string amount also returned HTTP 201, confirming that the amount encoding was not the cause of the reproduced URL rejection. The probes created unpaid sandbox requests with email/SMS disabled; no payment was completed. Deployed Vercel behavior and actual payment/webhook completion still require verification after deployment.

Verification for this fix: 104 unit tests passed, typecheck passed, production build passed, and 8 HitPay storefront browser tests passed. Regression coverage includes both sandbox hosts, numeric major-unit amounts, exact rejection payload/body diagnostics, credential redaction, response size limits, extension checkout on desktop/mobile, extension fulfillment and plan isolation, unchanged forced RLS, and rejection of unknown plans.

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
