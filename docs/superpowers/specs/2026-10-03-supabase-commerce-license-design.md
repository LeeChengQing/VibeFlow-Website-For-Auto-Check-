# Supabase Commerce and License Portal — Design Review

**Status:** Draft for user review  
**Scope:** Migrate checkout and fulfillment from local SQLite to Supabase; add a passwordless customer portal, license activation, and secure device transfer.  
**Implementation gate:** No product code or database changes until this design is approved.

## 1. Current state and goal

The current app has a local SQLite order/ticket store. Checkout is explicitly a local preview: it accepts a delivery email, changes an order to paid, and creates a demo delivery value. There is no HitPay webhook, Supabase client, activation-key table, or activation API. The current catalog contains extension, mobile-notification semester/yearly, and bundle offers.

The goal is one production source of truth in Supabase for purchases, license fulfillment, and customer identity. While HitPay KYC is pending, a loopback-only mock checkout will drive the same server-side paid-order fulfillment path as a verified payment webhook. The mock must be impossible to use in production.

## 2. Recommended architecture

Use Supabase Postgres for commerce and license state, and Supabase Auth for verified email identities. Keep the Next.js server as the trust boundary: the browser can start checkout, request OTPs, and read its own records, but cannot mark an order paid, assign a key, or change a device binding directly. Privileged writes use server-only Supabase credentials or narrowly scoped database functions. The service-role/secret key never enters a `NEXT_PUBLIC_` variable.

The `auth.users` row is the canonical customer identity. Orders and issued activation keys retain a normalized `buyer_email` captured at checkout/payment. The portal matches the signed-in, verified Auth email to that purchase email; it does not trust editable user metadata. No separate password or customer credential table is needed.

### Approaches considered

1. **Move commerce to Supabase and retain Next.js as the payment boundary (recommended).** A small Next.js data layer owns order creation and fulfillment; Postgres functions own atomic inventory assignment and state transitions. This keeps HitPay integration provider-specific while keeping the business rules shared with mock checkout.
2. **Move payment fulfillment into Supabase Edge Functions.** This can reduce application-server responsibilities, but adds a second server runtime and deployment path. It is unnecessary for the current single Next.js application.

## 3. Database model

Use UUID primary keys, UTC timestamps, integer minor-unit amounts, normalized lowercase email, explicit checks/foreign keys, and RLS on every exposed `public` table. Never store buyer passwords. The Auth system owns users and email verification.

### `public.orders`

- `id uuid primary key`
- `reference text unique not null` (human support reference)
- `buyer_email text` normalized at checkout; nullable only while the order is pending before the customer submits an email
- `plan_code text not null` (`extension`, `mobile_notification`, `mobile_notification_yearly`, `bundle`)
- `amount_minor integer not null`, `currency text not null default 'MYR'`
- `status text not null` constrained to `pending`, `paid`, `cancelled`, `refunded`
- `payment_provider text` (`mock` or `hitpay`), `provider_payment_id text unique` when present
- `created_at`, `paid_at`, `refunded_at` timestamps
- `fulfillment_error text` or an equivalent internal diagnostic field that never contains secrets

Payment IDs and the unique provider event/payment identity make retries idempotent. A unique constraint prevents the same HitPay payment from fulfilling two orders. A check constraint requires `buyer_email` for paid/refunded orders. The trusted webhook—not a return URL—sets `paid` and refuses fulfillment if the buyer email was not collected.

### `public.key_inventory`

Private stock of pre-generated license keys, one row per unassigned key:

- `id uuid primary key`, `plan_type text not null check (plan_type in ('semester','yearly','bundle','extension'))`
- `key_hash bytea unique not null` for activation lookup
- `key_ciphertext bytea not null` encrypted with an application-held key so the portal can recover and copy a lost key
- `created_at`, optional `reserved_at`

Inventory is not exposed through the Data API and has no browser role grants. Hashes are used for lookup; ciphertext is only decrypted in the server layer for authenticated portal display. Plaintext keys are not logged.

### `public.activation_keys`

Issued customer keys; this table strictly requires the purchaser email:

- `id uuid primary key`, `order_id uuid not null references orders(id)`
- `inventory_id uuid unique not null references key_inventory(id)`
- `buyer_email text not null` normalized lowercase
- `plan_type text not null check (plan_type in ('semester','yearly','bundle','extension'))`
- `status text not null check (status in ('available','assigned','redeemed','revoked'))`
- `device_id text`, `redeemed_at`, `created_at`
- `key_ciphertext bytea` copied from inventory, or a server-side join to inventory for portal recovery

`available` means purchased and ready for activation. It is distinct from unassigned inventory, which stays in `key_inventory`. `assigned` is reserved for an explicitly allocated but not yet redeemed state if the product needs it; normal successful checkout produces `available`. `redeemed` means bound to a device. A unique constraint on `inventory_id` prevents selling one stock key twice.

Each paid order produces one activation key whose `plan_type` matches its selected plan: `extension`, `semester`, `yearly`, or `bundle`. This keeps the key's entitlement unambiguous for the license service. Bundle-specific access is enforced from the `bundle` type; fulfillment does not silently downgrade a bundle to a semester-only key.

### `public.transfer_requests`

- `id uuid primary key`, `activation_key_id uuid not null references activation_keys(id)`
- `new_device_id text not null`, `status text not null check (status in ('pending','completed','expired','locked'))`
- `created_at`, `expires_at`, `completed_at`, `attempt_count integer not null default 0`
- optional internal request fingerprint for abuse controls; do not store an OTP plaintext

Supabase Auth sends the six-digit email OTP. Transfer completion requires both a valid Auth session and an active pending request, so only proof of the registered email can authorize replacement. The OTP is short-lived/single-use through Auth; the transfer request is separately short-lived and single-use.

### Ownership and RLS

- Enable RLS on `orders`, `activation_keys`, `transfer_requests`, and `key_inventory`.
- Do not grant `anon` access to customer data or key inventory.
- Authenticated reads on orders/keys require `lower(buyer_email) = lower((select auth.jwt()->>'email'))` and a verified email claim. Customers get no direct update/delete policy.
- Transfer-request reads are unnecessary from the browser; all mutations go through server endpoints / private database functions.
- Keep inventory in a private schema or revoke all browser grants; RLS remains enabled as defense in depth.
- Revoke default `PUBLIC` execute on privileged functions and grant only the required server role. Functions use a fixed safe `search_path`, validate state, and do not accept caller-supplied email as proof of ownership.

## 4. Customer Portal authentication and UI

`/dashboard` is a server-rendered protected route with a client sign-in form where needed. The customer enters only an email. The browser Supabase client calls `signInWithOtp`; Supabase Auth sends the configured email OTP or magic link. The user verifies the numeric code or follows the link, the callback establishes the Auth session in secure cookies, and the route rechecks the current user server-side before querying orders and keys. Logout clears the Auth session.

The dashboard groups purchases by order and displays reference/date, product/plan, price, and payment status. For license-bearing purchases it shows each key's `plan_type`, `status` (`available`, `assigned`, `redeemed`), and a copy action. A masked key is the default display with an explicit reveal/copy control; key retrieval is authorized server-side against the verified email. Empty, pending-OTP, expired-link, and no-purchases states are part of the UI. The UI never embeds service credentials.

Supabase Auth email templates and redirect URLs must be configured for the deployed origin. The OTP template must include Supabase's token placeholder. Password login is not offered.

## 5. Concurrency-safe `assign_available_key` fulfillment

The database function is called only after the server has verified a HitPay signature or accepted a local mock event under the local-only guard. It performs the state change in one transaction:

1. Lock the matching pending order (`FOR UPDATE`). If already paid, return its existing fulfillment result (idempotent retry); reject cancelled/refunded orders.
2. Validate the trusted payment identity and match amount/currency/order reference before calling the function. The function independently validates the order plan and email.
3. Select one unassigned `key_inventory` row whose `plan_type` matches the order's selected plan using `FOR UPDATE SKIP LOCKED`.
4. If inventory is empty, leave the order unpaid/unfulfilled or record a retryable fulfillment failure; never mark it fully fulfilled without a key. The chosen policy is to roll back payment-state mutation and let the webhook retry while an operator replenishes stock.
5. Insert `activation_keys` with the order's `buyer_email`, mapped `plan_type`, `status='available'`, and inventory reference. Unique constraints prevent duplicate assignments.
6. Mark the order paid, set provider/payment fields and `paid_at`, and return the existing/new key ID and fulfillment state.

Concurrent requests cannot claim the same inventory row. Order locking plus provider-event uniqueness makes repeated webhook delivery safe.

The PostgreSQL RPC is named `public.assign_available_key(p_order_id uuid, p_payment_provider text, p_provider_payment_id text)`. It uses a row lock on the order and `FOR UPDATE SKIP LOCKED` on inventory. It is not executable by browser roles; only the trusted server path may call it. A separate transfer RPC locks the activation key and pending transfer request, validates the verified buyer email and expiry, and atomically replaces `device_id` before completing the request.

## 6. Mock checkout and HitPay handoff

1. The customer chooses a catalog offer and the server creates a pending Supabase order with server-calculated price and a random reference. At checkout, the customer submits the purchase email, which is normalized and saved on the order before the simulated or real payment is accepted.
2. In local development only, the checkout displays “Simulate successful payment.” The browser posts to a local mock-payment route with the order reference; it never calls the RPC or writes `paid` itself.
3. The mock route requires an explicit `LOCAL_MOCK_PAYMENTS=true`, non-production runtime, loopback host, and same-origin request. It builds a fake provider event and invokes the same internal fulfillment service used by the HitPay webhook. The resulting DB function and stock lock are identical to production fulfillment.
4. In production, mock endpoints reject requests regardless of hostname/header. The real HitPay webhook verifies the provider signature against the raw request body, checks amount/currency/reference, deduplicates the provider event/payment ID, and then invokes that same fulfillment path.
5. The success/return page reads order state from Supabase. It does not trust a browser redirect as evidence of payment.

The mock event uses a clearly namespaced test provider identity and must not be accepted by the HitPay handler. Switching to live checkout later adds a payment-session route and credentials, while leaving fulfillment and the portal unchanged.

## 7. Activation and device transfer

The existing activation API does not exist in this repository, so implementation adds it. Activation looks up a key by a constant-time hash comparison, rejects revoked/invalid keys, and atomically redeems an available key for the requesting device. Repeating activation on the same device is idempotent. If a redeemed key is requested from another device, `/api/activate` creates a rate-limited pending transfer request, asks Supabase Auth to email the OTP to the stored `buyer_email`, and returns a generic “verification required” response without exposing the full email or key status to unauthenticated callers.

`/api/activate/verify-transfer` validates the submitted OTP through Supabase Auth, confirms the resulting verified session email matches the key's `buyer_email`, and calls an atomic database function with request ID, key ID, new device ID, and authenticated user identity. The function locks the request and key, checks expiry/attempt limits/current device, updates the binding, marks the request completed, and returns the subscription state. Invalid codes do not change a device binding. Add per-key, per-IP, and per-email throttles, generic responses, expiry, and audit timestamps. The client receives no service key.

## 8. Migration and implementation boundary

The migration retires the local SQLite `orders`/`tickets` path for commerce and makes Supabase the live order source. Existing local preview orders are disposable demo data and will not be copied into production; any real existing purchases would require a separately reviewed import with verified buyer emails and key inventory. Support tickets/admin remain outside this design unless they are directly coupled to order lookup; order-support references will read the new Supabase order source.

Implementation should include versioned SQL migrations, pinned Supabase client packages, server/browser client boundaries, checkout/API migration, mock payment route, HitPay webhook skeleton with signature verification, portal auth/dashboard, and activation/transfer APIs. Before coding, read the installed Next.js 16.3.8 App Router docs and current Supabase docs/changelog; deploy schema only after review. No secrets, migrations against a live project, or external payment actions are included in implementation approval by this document.

## 9. Decisions requested

Please review and approve or edit these assumptions:

1. Every purchase creates one activation key whose `plan_type` is exactly one of `semester`, `yearly`, `bundle`, or `extension` and matches the selected product.
2. `available` means paid and ready to redeem; unassigned stock lives in `key_inventory`. `assigned` remains available for a future reserved-but-not-redeemed state.
3. Empty key inventory causes fulfillment to fail/retry rather than marking the order paid without a key.
4. Local mock payment is loopback-only and disabled in every production build.
5. Existing local SQLite demo orders are not migrated as real sales.

Approval of this design will authorize the next workflow stage: writing a concrete implementation plan for review. It will not itself authorize deploying migrations or changing a live Supabase project.
