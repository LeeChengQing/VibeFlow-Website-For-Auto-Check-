# Admin Key Dashboard Steps 3 and 4

**Goal:** Ship the authorized production dashboard and one-time provisioning flow while preserving the local demo.

**Design:** `docs/superpowers/specs/2026-10-04-admin-key-dashboard-design.md`. Steps 1 and 2 remain unchanged. Native execution in this session; no deployment or live database mutation.

- [x] Test and implement `lib/admin-keys.ts`: 24 random bytes per code, grouped uppercase hex, canonical SHA-256 hashing.
- [x] Test and implement `app/admin/actions.ts`: generic login errors, redirect outside catch, idempotent logout, auth before validation, allowlisted plan, integer quantity 1–100, one atomic insert, hash-only persistence, safe errors, revalidate after success.
- [x] Implement shared options/DTO types and session-gated `lib/admin-key-data.ts`: exact global counts, bounded validated URL filters, stable newest-first pagination, hash-prefix-only client identifiers.
- [x] Move the demo entry to `/admin/local`, gate it and its link with loopback/local-demo checks, and update its existing browser tests.
- [x] Implement server entry plus client login/dashboard and native dialog: responsive dark glass UI, loading/error/empty states, copy and CSV Blob download together, acknowledgment before discarding, refresh warning, no plaintext browser persistence.
- [x] Verify with unit/database tests, TypeScript, production build, and browser tests against a local REST fixture. Inspect desktop/mobile screenshots and audit bundles for secret sentinels.

Verification: 35 unit/database tests, four dashboard browser tests, and the preserved checkout/support/local-admin workflow pass. TypeScript and the production build pass. A production HTTP check confirms private login, hidden demo link, and only not-found UI at `/admin/local` (Next's streamed not-found response carries HTTP 200). A 34-file browser bundle audit found no injected secret sentinels. Desktop/mobile screenshots were inspected. No live database was changed.

Review focus: invalid sessions and direct action calls; malformed counts/plans/query strings; failed inserts returning no plaintext; global counts unaffected by filters; unrecoverable plaintext on modal closure/refresh; inaccessible local route in production; safe configuration failure.
