# Keyless Extension Fulfillment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fulfill paid extension orders without license inventory and securely show the right downloadable and license entitlements after payment.

**Architecture:** Store activation hashes and AES-256-GCM ciphertext together in private inventory. A service-only database function marks extension orders paid without inventory access, maps bundles to semester inventory, and allocates only encrypted stock for key-bearing plans. The server success page decrypts an active paid entitlement and passes only the raw license string and permitted download URL to the client UI.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node.js `node:crypto`, Supabase Postgres migrations and service-role client, React.

**Spec:** `docs/superpowers/specs/2026-10-05-keyless-download-fulfillment-design.md`

## Global Constraints

- Use a dedicated `LICENSE_KEY_ENCRYPTION_KEY` containing exactly 32 bytes, encoded as base64.
- Use authenticated AES-256-GCM encryption; never store or log plaintext keys outside the existing admin response.
- Preserve hash-based activation lookup, forced RLS, service-only RPC execution, payment capture checks, and same-order idempotency.
- Only paid orders may expose entitlements; do not send buyer email, payment IDs, hashes, ciphertext, or service credentials to the browser.
- Keep the placeholder extension download target `/downloads/auto-check-extension.zip`.

## Review Focus

- Missing or malformed encryption secret: provisioning and decryption fail closed.
- Ciphertext tampering or wrong key: authenticated decryption returns no plaintext.
- Existing hash-only inventory: excluded from new key allocation.
- Extension callback retry: remains paid and never allocates inventory or a license.
- Bundle purchase: uses one encrypted `semester` key and also exposes the extension download.

---

### Task 1: Add authenticated key encryption to provisioning

**Files:**
- Create: `lib/license-key-encryption.ts`
- Modify: `app/admin/actions.ts`
- Modify: `lib/supabase/admin.ts`

**Interfaces:**
- Produce `encryptLicenseKey(plaintext: string, keyHash: string): string` and `decryptLicenseKey(encoded: string, keyHash: string): string`, server-only functions using Node crypto and `keyHash` as AES-GCM additional authenticated data.
- Store ciphertext in an `encrypted_key` inventory column using the versioned encoding `v1.<nonce-base64url>.<tag-base64url>.<ciphertext-base64url>`.
- Add `encrypted_key: string | null` to `KeyInventoryRow`; allow it on inserts.

- [ ] **Step 1: Implement strict key parsing and AES-GCM helpers**

Require `LICENSE_KEY_ENCRYPTION_KEY` to decode as exactly 32 base64 bytes. Use a fresh 12-byte nonce per encryption and a 16-byte authentication tag. Reject unsupported versions, malformed encodings, empty plaintext, and authentication failures without returning data.

- [ ] **Step 2: Encrypt generated keys before the atomic inventory insert**

In `generateKeysAction`, insert `{key_hash, encrypted_key, plan_type, status}` for each code. Preserve the existing one-time return of generated plaintext codes. If encryption fails, insert nothing and return the existing generic provisioning error.

- [ ] **Step 3: Create a migration for `encrypted_key` using the Supabase CLI**

Discover the installed CLI syntax through `supabase --help` and `supabase migration --help`, then create the migration with `supabase migration new`. Add nullable `encrypted_key text` to `public.key_inventory`, document that it contains versioned AES-256-GCM ciphertext, and leave existing hash-only rows null.

- [ ] **Step 4: Review the changed helper and admin data types**

Confirm the module is server-only, no plaintext is logged or included in database error messages, and the encoded payload carries nonce, tag, and ciphertext in the documented order.

### Task 2: Make database fulfillment plan-aware and encrypted-stock-only

**Files:**
- Modify: the new migration from Task 1 to replace `public.assign_available_key(uuid)`.
- Modify: `lib/supabase/admin.ts` function typing.

**Interfaces:**
- `assign_available_key(p_order_id: string): string | null` returns an issued license UUID for key-bearing orders and null for extension-only orders.
- Existing `INVENTORY_EXHAUSTED` exception remains the stock failure signal.

- [ ] **Step 1: Replace the RPC with an extension branch before all inventory queries**

Keep the row lock first. For a pending `extension` order, update status to `paid` and `paid_at`, then return null without reading `key_inventory` or creating `issued_licenses`. For an already-paid extension order with no license, return null idempotently. Treat an extension with an unexpected issued license as inconsistent.

- [ ] **Step 2: Map bundle allocation to semester stock**

For pending `bundle` orders, select one available `semester` row; for `semester` and `yearly`, select their matching plan. Require `encrypted_key is not null` in every key-bearing allocation query. Store the actual inventory plan in `issued_licenses.plan_type`.

- [ ] **Step 3: Preserve transactional, retry, and privilege behavior**

Keep inventory claim, issued license insert, and order paid update in one transaction. Retain order locking, `FOR UPDATE SKIP LOCKED`, existing paid-order idempotency for key-bearing plans, `search_path = public`, postgres ownership, and execute grants only for `service_role`.

- [ ] **Step 4: Update RPC return typing and review SQL branches**

Type the scalar return as `string | null`. Review the extension path to confirm no inventory SQL can execute before its return, and the bundle path only allocates semester inventory.

### Task 3: Accept keyless fulfillment in the HitPay webhook

**Files:**
- Modify: `app/api/hitpay/webhook/route.ts`

**Interfaces:**
- The route continues to call the service-only `assign_available_key` RPC for each verified order.
- A null RPC result is success only when `order.plan === 'extension'`; null for any key-bearing order remains a fulfillment failure.

- [ ] **Step 1: Branch on the verified order plan after the RPC result**

Do not treat a null result for extension as failure. Continue clearing `fulfillment_error` only after confirming the order is paid and the provider payment ID matches. For bundle and notification plans, require a non-null license UUID.

- [ ] **Step 2: Review capture and inventory error handling**

Ensure payment capture remains committed before fulfillment, extension orders cannot enter the `INVENTORY_EXHAUSTED` handling branch, and notification/bundle exhaustion still records the current alert and acknowledges the verified callback.

### Task 4: Load paid entitlements on the success page

**Files:**
- Modify: `app/success/page.tsx`
- Modify: `components/PaymentReturn.tsx`
- Read for compatibility: `app/api/hitpay/checkout/route.ts`

**Interfaces:**
- Extend the existing `PaymentReturn` props with optional `licenseKey?: string`; retain the existing `downloadExtension?: boolean` prop.
- The server page prefers the `order_id` UUID already added to HitPay's redirect URL, and accepts the provider `reference` UUID as a compatibility fallback.
- The server page passes a key only after verified order state is `paid` and an active issued license joins to encrypted inventory.

- [ ] **Step 1: Load minimal server-side order and entitlement data**

Select the order plan, status, and payment confirmation timestamp by the validated `order_id` UUID, falling back to `reference` for older redirects. For paid `bundle`, `semester`, or `yearly` orders, load the active issued license and its `encrypted_key`, then decrypt on the server. For paid `extension` orders, do not query inventory or issued licenses. Map missing, revoked, malformed, or decryption-failed entitlement data to an unavailable state without returning partial secrets.

- [ ] **Step 2: Pass only the delivery fields to the client**

Pass only the plan-appropriate raw key and a boolean controlling the download button. Never pass ciphertext, key hashes, buyer data, or payment IDs. Set `Cache-Control: no-store` behavior through the existing dynamic server route and avoid logging secret values.

- [ ] **Step 3: Render and preserve access to confirmed delivery**

Preserve the existing success-page download button and its `downloadExtension` prop. Show “Download Extension (.zip)” linking to `/downloads/auto-check-extension.zip` for paid `extension` and `bundle` orders. Show the semester/yearly key for corresponding paid plans and the semester key plus download for bundles. Keep the success screen visible instead of navigating away after five seconds; retain the explicit return-home link. Continue polling pending or processing orders.

- [ ] **Step 4: Review unpaid and partial-failure rendering**

Confirm pending, cancelled, unverified, and unavailable states receive no download or key props. A paid extension displays only its download; a paid key order with missing/decryption-failed ciphertext displays no key and gives support guidance.

### Task 5: Review schema, secrets, and code changes

**Files:**
- Review: `docs/superpowers/specs/2026-10-05-keyless-download-fulfillment-design.md`
- Review: all files listed in Tasks 1–4 and the new migration.

- [ ] **Step 1: Perform a focused diff and static source review**

Check the migration grants and branch ordering, TypeScript data boundaries, UI plan matrix, secret handling, and ensure no unrelated working-tree files are staged or changed.

- [ ] **Step 2: Report runtime setup and rollout constraints**

Document that operators must set a stable 32-byte base64 `LICENSE_KEY_ENCRYPTION_KEY` and provision encrypted inventory before key-bearing fulfillment. Existing hash-only keys are not recoverable and must be replaced.

### Task 6: Add a mobile e-wallet download fallback

**Files:**
- Modify: `components/PaymentReturn.tsx`

**Interfaces:**
- For paid extension and bundle orders, retain the primary “Download Extension (.zip)” action and add “Copy Download Link”.
- Copy the absolute `/downloads/auto-check-extension.zip` URL with `navigator.clipboard.writeText`.
- Show the e-wallet WebView helper note and clear success/failure feedback; when clipboard access fails, expose a selectable absolute URL for manual copying.

- [x] **Step 1: Add the copy action and e-wallet guidance below the primary download**
- [x] **Step 2: Provide accessible copy feedback and a manual-copy fallback when clipboard access is unavailable**
