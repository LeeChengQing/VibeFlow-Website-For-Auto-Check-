# Keyless Extension Fulfillment and Recoverable License Delivery

## Goal

Allow successful HitPay purchases of the extension ZIP without consuming license inventory, while delivering a notification license for key-bearing purchases. Bundle buyers receive both the ZIP download and a semester notification key. The success page displays entitlements only after server-side payment confirmation.

## Existing project facts

- The commerce plans in this project are `extension`, `bundle`, `semester`, and `yearly` (plus the internal check plan). The existing notification inventory names are `semester` and `yearly`.
- `assign_available_key` currently allocates one inventory item per order, including extension orders, and marks the order paid in the same transaction.
- `key_inventory` stores only a SHA-256 hash. Hash-only records cannot be converted back to their original key.
- Admin key provisioning generates plaintext codes, returns them to the admin UI, and stores only their hashes.
- The HitPay success page currently exposes only coarse payment state. It looks up the order using the unguessable provider request UUID returned in the `reference` query parameter.
- HitPay checkout requests disable provider email and no automated email sender is part of this fulfillment path.

## Design

### Encrypted key inventory

Keep `key_hash` as the activation lookup value and add nullable `encrypted_key` storage to `key_inventory`. Encrypt each imported/generated raw key with Node's native AES-256-GCM using a dedicated 32-byte `LICENSE_KEY_ENCRYPTION_KEY` secret. Store a versioned, unambiguous encoding of nonce, authentication tag, and ciphertext. Validate the secret strictly and fail closed if it is absent or malformed. Decryption must authenticate before returning plaintext.

Admin provisioning encrypts the same raw code before inserting the inventory row. Plaintext remains available only in the existing one-time admin response and is never logged. Existing inventory rows have no recoverable plaintext, so the fulfillment function must not allocate them for new purchases. They remain in the database and may be replaced by newly provisioned encrypted inventory.

### Atomic fulfillment

Update `assign_available_key` while preserving its row lock and idempotency:

- For `extension`, mark a pending order paid and set `paid_at`, without reading or changing `key_inventory` and without inserting an issued license. Repeated callbacks for this already-paid keyless order succeed without allocating stock.
- For `bundle`, claim one available encrypted `semester` inventory item and create an issued license with `plan_type = 'semester'`. This is the notification entitlement bundled with the extension download.
- For `semester` and `yearly`, claim matching encrypted inventory as before.
- Only encrypted available inventory qualifies for new allocation. Existing atomic rollback and `INVENTORY_EXHAUSTED` behavior remain for key-bearing plans.

The webhook continues to verify and persist the capture before calling the idempotent fulfillment function. It must treat the keyless extension success result as valid even though no license ID is returned.

### Success page delivery

The server success page loads the order plan and paid state using the provider request UUID. Only for a paid order does it load its active issued license, read the matching encrypted inventory value, decrypt it server-side, and pass the raw key to the client display. Do not send buyer email, payment IDs, hashes, ciphertext, or service credentials to the browser. Database/decryption failures fail closed and show the existing unavailable/processing support state rather than exposing partial data.

Render entitlements based on the paid order plan:

- `extension`: prominent “Download Extension (.zip)” button targeting `/downloads/auto-check-extension.zip`; no license key.
- `bundle`: the same download button plus the semester notification key.
- `semester` or `yearly`: the corresponding notification license key.

Keep the confirmed success screen visible so buyers can copy the key and use the download button. Pending/processing orders continue polling, and unverified or unpaid orders receive no entitlement data. The placeholder download URL is intentionally not a signed or expiring delivery URL in this change.

### Email

No email changes are needed. HitPay email delivery is disabled for checkout, and this code path has no automated receipt sender.

## Files and schema

- Add a Supabase migration for nullable encrypted key storage and the updated `assign_available_key` function, with service-only execute grants preserved.
- Update admin key provisioning and relevant database row/function types.
- Add a server-only encryption helper.
- Update the HitPay webhook result handling, success page data lookup, and success UI props/rendering.

## Failure handling and security

- Missing/invalid encryption configuration prevents key creation or decryption; never fall back to storing plaintext or emitting a key.
- A malformed/tampered encrypted value fails authenticated decryption and the success page shows an unavailable state.
- Hash-only existing inventory cannot satisfy fulfillment after rollout. Operators must provision encrypted stock; otherwise key-bearing payments remain captured and pending with the existing inventory exhaustion alert path.
- The success URL's provider request UUID is the bearer lookup credential. Continue validating its UUID format, payment provider, and paid state before reading any entitlement. Use no-store responses and avoid logging key material.
- Database RPC remains service-role-only; preserve forced RLS and existing grants.

## Verification

Review encryption round-trip and tamper rejection, extension fulfillment without inventory access, bundle allocation from semester stock, idempotent webhook retries, and success-page entitlement combinations. Check TypeScript and migration syntax using the repository's established commands where available.
