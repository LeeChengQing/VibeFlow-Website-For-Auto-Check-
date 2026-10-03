# Supabase Commerce and License Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move order checkout and license fulfillment to Supabase, add a local-only mock payment path, and provide email OTP portal and device transfer flows.

**Architecture:** Supabase Postgres is the source of truth for orders, key stock, issued keys, and transfer requests; Supabase Auth is the email identity. Next.js server routes are the trust boundary and invoke narrowly permissioned Postgres RPCs. The local mock and future HitPay webhook share the same fulfillment service.

**Tech Stack:** Next.js 16.3.8 App Router, TypeScript, Supabase Postgres/Auth, pinned `@supabase/supabase-js` and `@supabase/ssr`, Tailwind CSS 4.

**Spec:** `docs/superpowers/specs/2026-10-03-supabase-commerce-license-design.md`

## Global Constraints

- All four plans (`semester`, `yearly`, `bundle`, `extension`) receive one matching activation key.
- `activation_keys.buyer_email` is required and normalized from the checkout order.
- The browser never receives a Supabase service-role/secret key and never writes paid state or device bindings directly.
- `assign_available_key` locks the order and claims stock with `FOR UPDATE SKIP LOCKED` in one transaction.
- The local mock requires explicit opt-in, loopback host, same-origin request, and a non-production runtime.
- A redeemed key transfer requires Supabase email OTP verification for the key's `buyer_email` and atomic device replacement.
- Follow the installed Next.js 16.3.8 documentation under `node_modules/next/dist/docs/` before editing App Router code.
- Follow current Supabase changelog and official docs before implementing Supabase APIs.

## Review Focus

- Missing or malformed Supabase env values fail safely without leaking keys or server details.
- A pending order without a buyer email cannot be fulfilled.
- A replayed mock/HitPay event returns existing fulfillment and does not consume another stock key.
- Simultaneous fulfillment attempts cannot assign one inventory row twice.
- Empty plan-matched inventory leaves the order retryable and creates no paid order without a key.
- An OTP for another email, expired request, wrong device, or invalid OTP cannot move a redeemed key.

---

### Task 1: Add Supabase commerce schema and atomic fulfillment/transfer RPCs

**Files:**
- Create: `supabase/migrations/<CLI-generated timestamp>_supabase_commerce_license.sql`
- Create: `docs/supabase-setup.md`

**Interfaces:**
- Produces `public.orders`, `public.key_inventory`, `public.activation_keys`, `public.transfer_requests`.
- Produces `public.assign_available_key(p_order_id uuid, p_payment_provider text, p_provider_payment_id text)`.
- Produces a private transfer completion RPC that checks Auth email, pending request expiry, current binding, and replaces `device_id` atomically.

- [ ] Discover installed Supabase CLI and migration command via `supabase --help`; create the migration using `supabase migration new` as required by the Supabase workflow.
- [ ] Define plan checks on both inventory and issued-key tables as `('semester','yearly','bundle','extension')`; require normalized non-null `buyer_email` on every issued key.
- [ ] Define RLS/grants so customers can only read their own order/key rows and cannot mutate commerce state; keep inventory and privileged RPC execution unavailable to browser roles.
- [ ] Implement order row locking, provider-payment idempotency, and matching-plan `FOR UPDATE SKIP LOCKED` inventory assignment. Roll back the transaction when matching stock is unavailable.
- [ ] Implement atomic transfer completion; validate caller identity against the Auth-verified email and lock both request and key before rebinding.
- [ ] Document environment and Supabase Auth OTP template/redirect configuration in `docs/supabase-setup.md`.

### Task 2: Add server/browser Supabase clients and migrate order APIs

**Files:**
- Modify: `package.json`, `.env.example`
- Create: `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`
- Modify: `app/api/checkout/route.ts`, `app/api/orders/[token]/route.ts`, `lib/types.ts`

**Interfaces:**
- `createBrowserSupabaseClient()` uses only public URL/publishable key.
- `createServerSupabaseClient()` reads/writes Auth cookies according to the installed Next.js and Supabase SSR guides.
- `createAdminSupabaseClient()` is server-only and requires a secret key.

- [ ] Pin Supabase packages using the package manager's exact-version syntax and update the lockfile.
- [ ] Add tests only if the user later requests verification; for this implementation, keep changes verifiable through static types and build commands.
- [ ] Create pending orders in Supabase with server-calculated price, random reference/token, and validated selected plan.
- [ ] Save normalized checkout email to the pending order before payment completion; expose only the order data needed by the checkout/receipt UI.
- [ ] Move order reads, cancellation, and fulfillment status reads off the SQLite order store while leaving unrelated support-ticket/admin storage out of scope.

### Task 3: Implement mock fulfillment and production webhook boundary

**Files:**
- Create: `app/api/mock-payment/route.ts`
- Create: `app/api/hitpay/webhook/route.ts`
- Create: `lib/payments/fulfill-order.ts`
- Modify: `components/Checkout.tsx`, `lib/security.ts`, `.env.example`

**Interfaces:**
- `fulfillPaidOrder({ orderId, provider, providerPaymentId, amountMinor, currency })` validates the trusted payment data and calls `assign_available_key`.
- `POST /api/mock-payment` accepts an order reference only in explicit local mock mode and calls the shared fulfillment service.

- [ ] Add loopback, origin, runtime, and `LOCAL_MOCK_PAYMENTS=true` guards before any mock side effect; never trust a browser-provided amount or `paid` flag.
- [ ] Mock a successful payment with server-derived amount/currency and a unique fake provider ID, then invoke the same fulfillment service/RPC as the real webhook.
- [ ] Reject the mock route in production regardless of request headers; return no plaintext key in the mock response.
- [ ] Parse HitPay's raw request body and verify its signature before using the shared fulfillment service; reject invalid signature, amount, currency, and order reference.
- [ ] Change checkout copy/actions to save buyer email and call mock fulfillment; receipts read final status from Supabase.

### Task 4: Build email OTP customer portal

**Files:**
- Create: `app/dashboard/page.tsx`, `components/dashboard/CustomerPortal.tsx`, `app/auth/callback/route.ts`
- Modify: `app/layout.tsx`, `components/SiteHeader.tsx`

**Interfaces:**
- Browser auth uses `signInWithOtp` and `verifyOtp` (or callback code exchange for magic links) with no password UI.
- Server dashboard data reads through the verified Auth session and RLS.

- [ ] Add email-entry, six-digit code, magic-link callback, logout, loading, expired-link, empty-order, and error states.
- [ ] Display all orders and issued keys, exact plan type/status, and a protected reveal/copy action; never serialize server credentials to client props.
- [ ] Ensure the authenticated user is revalidated server-side and order/key access is constrained to the verified email.

### Task 5: Implement activation and OTP device transfer APIs

**Files:**
- Create: `app/api/activate/route.ts`, `app/api/activate/verify-transfer/route.ts`
- Create: `lib/licenses/activation.ts`, `lib/licenses/transfers.ts`
- Modify: `lib/security.ts`

**Interfaces:**
- `POST /api/activate` accepts `{ activation_key, device_id }`; successful activation returns subscription state, while a different-device redemption starts an OTP request and returns a generic transfer-required result.
- `POST /api/activate/verify-transfer` accepts `{ request_id, otp, device_id }`, verifies Supabase Auth OTP/session, and calls the atomic transfer RPC.

- [ ] Hash key input before lookup and preserve ciphertext for authorized dashboard recovery.
- [ ] Make same-device activation idempotent; only an OTP-verified buyer can replace a redeemed device.
- [ ] Add per-key, per-email, and per-IP throttles, request expiry, attempt limits, and generic responses that do not reveal a full buyer email.
- [ ] Return the resumed subscription state only after the database confirms the transfer committed.

### Task 6: Remove remaining order-source coupling and document rollout

**Files:**
- Modify: `app/api/admin/route.ts`, `app/api/support/route.ts`, `app/api/support/[token]/route.ts` only where they read order records
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Order lookup for admin/support uses Supabase; ticket content may remain in SQLite unless a caller requires persistent commerce ownership linkage.

- [ ] Search all commerce imports and remove order reads/writes to the SQLite store; preserve unrelated local support behavior where no order lookup is involved.
- [ ] Document mock-mode setup, inventory seeding/encryption requirements, Auth email template, redirects, and production HitPay secret setup.
- [ ] Run `npm run typecheck` and `npm run build`; report any Supabase-project-only checks that cannot run without configured project credentials.

## Handoff

This implementation is to be performed inline in the current session after the user reviews this plan, as requested by “Please proceed with implementation.” No live Supabase deployment, secret entry, or payment-provider activation is included.
