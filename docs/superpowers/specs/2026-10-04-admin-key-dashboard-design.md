# Auto-Check Admin Key Dashboard — Design Review

**Status:** Draft for user review  
**Scope:** Add a production-protected activation-key inventory dashboard at `/admin`, backed by Supabase Postgres, while preserving the existing local-only order and support preview.

## Context and intent

Auto-Check currently has a local demo admin dashboard at `/admin`, protected by a password session that is deliberately restricted to loopback hosts. The application uses SQLite for demo orders and tickets. There is no Supabase client, Supabase migration, activation-key table, or production-capable admin route in the repository. The existing commerce design draft describes a different plan set and key lifecycle, so it cannot be treated as the deployed schema for this dashboard.

The goal is for an authorized operator to manage license inventory from the application: see totals and plan breakdowns, inspect issued keys and redemption details, filter the table by plan and state, and provision a controlled batch of keys without opening the Supabase console. Students and other unauthenticated visitors must not be able to read key or purchaser data or invoke provisioning actions.

## Recommended approach

Use a dedicated production admin password (`ADMIN_DASHBOARD_PASSWORD`) and signed, HTTP-only session cookie, verified on the page and independently inside every Server Action. Keep the password, signing secret, Supabase service-role credential, and key-encryption key server-only. Require secure cookies in production, use `SameSite=Strict`, enforce same-origin requests for login, and rate-limit failed login attempts. Missing or malformed configuration fails closed.

Add a server-only Supabase data-access module using the service-role key. It is only called after the admin session is verified. The browser receives the minimum fields needed for the table and the plaintext codes returned from a successful provisioning action; it never receives Supabase credentials. Server Actions validate all submitted plan and batch-size values, write atomically, and revalidate `/admin` after successful provisioning.

The production environment requires `ADMIN_DASHBOARD_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_KEY_ENCRYPTION_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep all five server-only; the signing secret and encryption key are independent 32-byte values, and the password must be at least 12 characters.

Keep the existing demo order and support workflows local-only and separate. Move their current UI to `/admin/local`, retaining its current session and local-host restrictions; `/admin` becomes the production key dashboard. A link to the local preview is shown only when the app is running in the explicitly enabled local demo environment. Existing local demo APIs remain local-only and are not reused by the production dashboard.

## Data model

Add a Supabase SQL migration defining `public.activation_keys` with:

- UUID primary key.
- `key_hash text not null unique`, containing the SHA-256 hash used for lookup and duplicate prevention.
- `key_ciphertext text not null`, containing a versioned AES-256-GCM payload (nonce, authentication tag, and ciphertext) for the recoverable activation code, encrypted/decrypted only on the server with `ADMIN_KEY_ENCRYPTION_KEY` (32-byte key material).
- `plan_type` constrained to `bundle`, `semester`, `yearly`, or `internal_check`.
- `status` constrained to `available`, `redeemed`, or `revoked`.
- Nullable normalized `buyer_email`, nullable `device_id`, and nullable `redeemed_at`.
- Non-null UTC `created_at` timestamp.

Available keys have no purchaser, device, or redemption timestamp. Redeemed keys may have purchaser and device details. Revoked keys remain visible for audit and cannot be counted as available. Enable row-level security and grant no direct table access to browser roles; the server-only service credential is the dashboard's access path. Add indexes for `(created_at desc)`, `(plan_type, status)`, and unique key hash.

The repository does not currently contain a deployed Supabase schema to inspect. This migration therefore establishes the dashboard's explicit contract. Before deployment, it must be applied to the configured Supabase project and coordinated with any separate license validator that may also write redemption fields.

## Dashboard and interaction

At `/admin`, render a dark, responsive operations view matching the existing premium dark-tech aesthetic: restrained glass panels, clear hierarchy, and neon accent color. Unauthenticated visitors get the admin password form; authenticated operators get:

- Summary cards for total, available, and redeemed key counts.
- Counts by each of the four plans.
- An activation-key table with plan and status filters, newest-first ordering, and pagination.
- Columns for a masked key/code identifier, plan, status, purchaser email when redeemed, device ID, creation time, and redemption time.
- A batch provisioning form with a required plan and bounded quantity (1–100). After success, show the new plaintext codes once with a clear copyable presentation; subsequent table views show a masked code and hash prefix.
- Logout, empty, loading, and safe error states.

Use server-rendered initial data and URL search parameters for table filters and pagination. Keep client-side JavaScript limited to interaction that needs it (such as copying generated codes or showing action feedback). All counts and table reads are uncached and recomputed from Supabase.

## Key generation and storage

Generate at least 192 bits of cryptographically secure randomness per code. Normalize the display format before hashing. Persist only the SHA-256 hash and authenticated ciphertext, never plaintext. Generate and encrypt a whole batch before a single insert so a failed insert creates no partial batch. Return generated plaintext only in the successful Server Action response for immediate operator capture; do not include it in logs, the initial page response, or later table reads. The hash supports downstream verification while ciphertext permits an authorized admin to view existing keys if that capability is later needed; this dashboard itself only reveals codes at creation time.

## Security and failure behavior

- Verify the signed session in `/admin` and every exported Server Action; page gating alone is insufficient.
- Use constant-time comparisons for password/signature checks, bounded session expiry, HTTP-only and same-site cookies, and secure cookies over HTTPS.
- Rate-limit login attempts and return generic authentication errors.
- Do not use `NEXT_PUBLIC_` variables for secrets; do not serialize the Supabase service credential or ciphertext to the client.
- Validate filters against fixed allowlists; validate batch count and plan on the server.
- On missing Supabase, password, signing, or encryption configuration, show a safe unavailable state and do not mutate data.
- Use least-privilege table policies and keep the admin key material separate from the Supabase service credential.

## Files and boundaries (implementation scope)

- `app/admin/page.tsx`: protected production dashboard entry point and server-side filtered data load.
- `app/admin/actions.ts`: authenticated Server Actions for sign-in, sign-out, and provisioning.
- `app/admin/AdminKeyDashboard.tsx`: small client surface for filter/form feedback and one-time copy behavior, if needed.
- `app/admin/local/page.tsx`: preserved local order/support dashboard.
- `lib/admin-auth.ts`: signed admin session validation and login helpers, isolated from the demo-only auth.
- `lib/supabase/admin.ts` and `lib/admin-keys.ts`: service client plus validated read/generation/encryption functions.
- `supabase/migrations/<timestamp>_activation_keys.sql`: table, constraints, indexes, and RLS policy.
- `.env.example` and Supabase setup documentation: required server-only variables and migration instructions.

Add the exact-version Supabase client dependency required by the package manager. Do not add Supabase Auth for this dashboard; the dedicated password/session mechanism is the approved minimal production gate for this isolated operator surface.

## Acceptance criteria

1. `/admin` does not render key data without a valid admin session.
2. Every Server Action independently rejects an invalid or expired session.
3. Configured Supabase keys never enter the client bundle or browser props.
4. Cards report accurate global totals and per-plan counts; filters and pagination return only matching rows.
5. A valid provisioning request inserts exactly the requested quantity for its selected plan, stores no plaintext, and shows the codes only in the immediate success response.
6. Invalid plans/counts and missing configuration fail safely without partial writes or secret leakage.
7. Existing demo order/support functionality remains isolated at `/admin/local` and continues to be loopback-only.
8. The SQL schema matches dashboard plan/status values and denies direct browser-role access.

## Out of scope

- Supabase Auth integration or per-admin user roles.
- Editing, revoking, or redeeming individual keys from the UI.
- Migrating checkout, orders, support tickets, or license validation to Supabase.
- Deploying the SQL migration or entering production secrets into a live project.
- Changes to the unrelated storefront.
