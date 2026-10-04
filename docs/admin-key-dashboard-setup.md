# Admin key dashboard setup

The production key dashboard is available at `/admin`. It uses Server Components for authenticated inventory reads and Server Actions for login, logout, and batch provisioning. The existing order/support demo has moved to `/admin/local` and remains limited to explicitly enabled local development on loopback hosts.

Set these server-only environment variables in development `.env.local` or Vercel's environment configuration:

| Variable | Requirement |
| --- | --- |
| `ADMIN_DASHBOARD_PASSWORD` | Dedicated password, 12–1,024 UTF-8 bytes. |
| `ADMIN_SESSION_SECRET` | 32 cryptographically random bytes encoded as 64 hex characters. |
| `SUPABASE_URL` | Supabase project HTTPS origin; local development also accepts loopback HTTP. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project's service-role credential. No anonymous or publishable-key fallback. |

Generate a signing secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Rotating either the password or signing secret invalidates existing cookies. Redeploy after changing Vercel environment values. Do not prefix these variables with `NEXT_PUBLIC_`.

The session lasts eight hours and uses an HMAC-SHA-256 signature, a random nonce, and a host-only, HTTP-only, SameSite=Strict cookie. Production requires HTTPS and uses the `__Host-` prefix. Local development HTTP uses a separate cookie name. The password check always compares fixed-length SHA-256 digests, and invalid attempts wait two seconds. This delay is stateless; it does not cap parallel requests. Logout removes the browser cookie; as with other stateless sessions, a copied cookie remains valid until expiry or secret rotation.

`getAdminSession()` reads cookies from a Server Component. `createAdminSession()` and `deleteAdminSession()` must run in Server Actions or Route Handlers, never during rendering. Future login actions must verify the password before creating a session and retain Next.js's same-origin protection. Every future protected action must call `requireAdminSession()`. `getSupabaseAdmin()` independently verifies the session before initializing an uncached privileged client.

The commerce migration `supabase/migrations/20261004032804_commerce_and_inventory.sql` was applied to the Auto-Check Supabase project on 2026-10-04. It replaces `activation_keys` with `orders`, `key_inventory` and `issued_licenses`, enables and forces RLS, creates no browser policies, revokes PUBLIC/anon/authenticated grants, and grants service_role only SELECT/INSERT/UPDATE. The legacy table had zero rows when it was dropped; its revoke RPC was also removed. See [commerce deployment and fulfillment notes](commerce-fulfillment-setup.md) for verification and migration-history details. This follows the [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security); the client uses the [documented initialization API](https://supabase.com/docs/reference/javascript/initializing).

Coordinate any external issuance writer with this schema: plan values are bundle/semester/yearly/internal_check. Inventory statuses are available/assigned; license statuses are active/revoked. The unique order_id and inventory_id foreign keys enforce one license per order and stock item. Buyer email is trimmed lowercase. A license may be active before its device activation, with nullable device_id and activated_at. Payment verification, matching the order's plan/email to inventory and the license, and atomic assignment remain the responsibility of the future fulfillment RPC.

The ledger displays inventory status and license status separately. Only active issued licenses offer revocation. Revocation conditionally updates the license to revoked, retains buyer/device metadata, and never makes stock available again. Activity logging is a separate write; if it fails after successful revocation, the dashboard reports a warning. Atomic revocation with audit logging would require a new database RPC.

Each code contains 24 cryptographically random bytes (192 bits), displayed as `AC-` followed by twelve uppercase four-character hexadecimal groups. Hashing trims surrounding whitespace, uppercases the code, retains the hyphens, and computes lowercase SHA-256 hex. External validators must use the same canonicalization.

Batch provisioning accepts exactly the four allowlisted plans and integer counts from 1–100. It authenticates before validating or accessing Supabase, inserts all hash rows in one request, and reveals plaintext only after that insert succeeds. No raw database errors or credentials reach the browser. The one-time modal exposes both Copy to Clipboard and Download as CSV, requires acknowledgment before discarding, and warns on refresh. Plaintext is held only in React memory and is cleared on dismissal; original codes cannot be recovered from the database.

Inventory is uncached, ordered by UUID descending for stable pagination, and paginated at 25 rows. This schema has no inventory creation timestamp, so UUID order does not imply chronology. Filters use URL query parameters and inventory statuses. Summary counts always represent all inventory, independently of table filters: total/plan counts use key_inventory, available counts use available stock, and the Redeemed count is the number of issued_licenses, including revoked and not-yet-activated licenses. The default embedded license relation is a left join, keeping available stock visible. Client identifiers contain only the first 12 hash characters. Activation timestamps display in Malaysia time (UTC+08:00).

Run `npm test` for auth, actions, reads, crypto, and embedded PostgreSQL security tests. `npm run test:admin` exercises the dashboard in a real browser against a local REST fixture with disposable credentials; it never connects to a live project. Run `npm run typecheck` / `npm run build` for App Router compatibility. These local checks do not certify a live Supabase project's grants or configuration; verify those after deploying the migration.
