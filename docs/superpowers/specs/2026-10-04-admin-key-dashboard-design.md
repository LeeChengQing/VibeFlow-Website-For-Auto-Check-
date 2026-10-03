# Auto-Check Admin Key Dashboard — Design Review

**Status:** Approved for staged implementation, with the 2026-10-04 architectural amendments
**Scope:** Add a production-protected activation-key inventory dashboard at `/admin`, backed by Supabase Postgres, while preserving the existing local-only order and support preview.

## Context and intent

Auto-Check currently has a local demo admin dashboard at `/admin`, protected by a password session that is deliberately restricted to loopback hosts. The application uses SQLite for demo orders and tickets. There is no Supabase client, Supabase migration, activation-key table, or production-capable admin route in the repository. The existing commerce design draft describes a different plan set and key lifecycle, so it cannot be treated as the deployed schema for this dashboard.

The goal is for an authorized operator to manage license inventory from the application: see totals and plan breakdowns, inspect issued keys and redemption details, filter the table by plan and state, and provision a controlled batch of keys without opening the Supabase console. Students and other unauthenticated visitors must not be able to read key or purchaser data or invoke provisioning actions.

## Recommended approach

Use a dedicated production admin password (`ADMIN_DASHBOARD_PASSWORD`) and signed, HTTP-only session cookie, verified on the page and independently inside every Server Action. Keep the password, signing secret, and Supabase service-role credential server-only. Require secure cookies in production, use `SameSite=Strict`, and enforce same-origin requests for login. Every failed password attempt waits a fixed 2,000 milliseconds before returning a generic error. The MVP uses no IP counters, in-memory rate limiter, or Redis. Missing or malformed configuration fails closed.

Add a server-only Supabase data-access module using the service-role key. It is only called after the admin session is verified. The browser receives the minimum fields needed for the table and the plaintext codes returned from a successful provisioning action; it never receives Supabase credentials. Server Actions validate all submitted plan and batch-size values, write atomically, and revalidate `/admin` after successful provisioning.

The production environment requires `ADMIN_DASHBOARD_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Keep all four server-only; the signing secret is 32 random bytes encoded as 64 hexadecimal characters, and the password must be 12–1,024 UTF-8 bytes. Sessions expire after eight hours. Use a host-only `__Host-auto_check_admin` cookie in production and `auto_check_admin` over local development HTTP. Cookie writes occur only in Server Actions or Route Handlers. Password and signing-secret rotation invalidate existing sessions.

Keep the existing demo order and support workflows local-only and separate. Move their current UI to `/admin/local`, retaining its current session and local-host restrictions; `/admin` becomes the production key dashboard. A link to the local preview is shown only when the app is running in the explicitly enabled local demo environment. Existing local demo APIs remain local-only and are not reused by the production dashboard.

## Data model

Add a Supabase SQL migration defining `public.activation_keys` with:

- UUID primary key.
- `key_hash text not null unique`, containing the SHA-256 hash used for lookup and duplicate prevention.
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
- Columns for a hash-prefix identifier, plan, status, purchaser email when redeemed, device ID, creation time, and redemption time. Original codes cannot be reconstructed from their hashes.
- A batch provisioning form with a required plan and bounded quantity (1–100). After success, show the new plaintext codes once with both **Copy to Clipboard** and **Download as CSV** buttons in the same modal. CSV includes each code and its plan. Explain that closing or refreshing loses access permanently and prompt the operator to capture the codes before closing. Subsequent table views show only a hash-prefix identifier.
- Logout, empty, loading, and safe error states.

Use server-rendered initial data and URL search parameters for table filters and pagination. Keep client-side JavaScript limited to interaction that needs it (such as copying generated codes or showing action feedback). All counts and table reads are uncached and recomputed from Supabase.

## Key generation and storage

Generate at least 192 bits of cryptographically secure randomness per code. Normalize the display format before hashing. Persist only the lowercase hexadecimal SHA-256 hash alongside plan, status, and audit/redemption metadata; never persist plaintext or encrypted codes. Generate and hash a whole batch before a single insert so a failed insert creates no partial batch. Return generated plaintext only in the successful Server Action response for immediate operator capture by copy or CSV download; do not include it in logs, the initial page response, later table reads, or browser persistence. Codes cannot be recovered after the modal is closed or the tab refreshed.

## Security and failure behavior

- Verify the signed session in `/admin` and every inventory Server Action; page gating alone is insufficient. Login verifies the password, and logout only clears the cookie and is intentionally idempotent even after expiry.
- Use constant-time comparisons for password/signature checks, bounded session expiry, HTTP-only and same-site cookies, and secure cookies over HTTPS.
- Delay every failed password attempt by 2,000 milliseconds and return generic authentication errors. This stateless MVP mitigation is not an IP-based request limit.
- Do not use `NEXT_PUBLIC_` variables for secrets; do not serialize the Supabase service credential to the client.
- Validate filters against fixed allowlists; validate batch count and plan on the server.
- On missing Supabase, password, or signing configuration, show a safe unavailable state and do not mutate data.
- Use least-privilege table policies and keep the admin key material separate from the Supabase service credential.

## Files and boundaries (implementation scope)

- `app/admin/page.tsx`: protected production dashboard entry point and server-side filtered data load.
- `app/admin/actions.ts`: authenticated Server Actions for sign-in, sign-out, and provisioning.
- `app/admin/AdminKeyDashboard.tsx`: small client surface for filter/form feedback and one-time copy/CSV export behavior.
- `app/admin/local/page.tsx`: preserved local order/support dashboard.
- `lib/admin-auth.ts`: signed admin session validation and login helpers, isolated from the demo-only auth.
- `lib/supabase/admin.ts` and `lib/admin-keys.ts`: session-gated service client plus validated read/generation/hashing functions.
- `supabase/migrations/<timestamp>_activation_keys.sql`: table, constraints, indexes, RLS enabled and forced, revoked public/browser-role grants, no browser policies, and explicit service-role privileges.
- `.env.example` and Supabase setup documentation: required server-only variables and migration instructions.

Add the exact-version Supabase client dependency required by the package manager. Do not add Supabase Auth for this dashboard; the dedicated password/session mechanism is the approved minimal production gate for this isolated operator surface.

## Acceptance criteria

1. `/admin` does not render key data without a valid admin session.
2. Every inventory Server Action independently rejects an invalid or expired session. Login and idempotent cookie-only logout are the explicit exceptions.
3. Configured Supabase keys never enter the client bundle or browser props.
4. Cards report accurate global totals and per-plan counts; filters and pagination return only matching rows.
5. A valid provisioning request inserts exactly the requested quantity for its selected plan, stores only hashes as key material, and shows codes only in the immediate success response with copy and CSV export available together. Closed/refreshed plaintext cannot be recovered.
6. Invalid plans/counts and missing configuration fail safely without partial writes or secret leakage.
7. Existing demo order/support functionality remains isolated at `/admin/local` and continues to be loopback-only.
8. The SQL schema matches dashboard plan/status values and denies direct browser-role access.
9. Every failed password attempt incurs a fixed two-second delay without process-local counters or an external rate-limiting service.

## Staged delivery

Implement Step 1 (migration) and Step 2 (server-only auth and Supabase core) first, including security verification and environment documentation. Wait for explicit user confirmation before Step 3 (key generation and Server Actions) or Step 4 (dashboard UI and moving the local preview).

Steps 1–4 are now implemented and verified locally following explicit confirmation. Applying the migration to a live project and deployment remain outside this implementation.

## Out of scope

- Supabase Auth integration or per-admin user roles.
- Editing, revoking, or redeeming individual keys from the UI.
- Migrating checkout, orders, support tickets, or license validation to Supabase.
- Deploying the SQL migration or entering production secrets into a live project.
- Changes to the unrelated storefront.
