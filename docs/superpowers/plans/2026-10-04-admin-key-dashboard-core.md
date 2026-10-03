# Admin Key Dashboard Core Implementation Plan

**Goal:** Deliver the approved Steps 1 and 2 before the user's confirmation gate.

**Architecture:** Hash-only activation-key inventory in Supabase, protected by RLS and revoked browser grants. Server-only HTTP-only signed sessions gate the service-role client. Existing local demo stays in place until Step 4.

**Tech stack:** Installed Next.js 16.3.8 App Router, Node.js crypto, pinned supabase-js, TypeScript, node:test, and embedded PostgreSQL for migration security tests.

**Spec:** `docs/superpowers/specs/2026-10-04-admin-key-dashboard-design.md`

## Constraints and review focus

- Exactly four plans: bundle, semester, yearly, internal_check; statuses: available, redeemed, revoked.
- Only lowercase hexadecimal SHA-256 hashes are persisted as key material. No reversible key storage or encryption secret.
- New tables deny PUBLIC, anon, and authenticated access, including with grants accidentally restored; service_role may select, insert, update, delete.
- Reject unsigned, tampered, expired, future-dated, overlong, and malformed sessions; expire after eight hours.
- Password comparison uses fixed-length SHA-256 digests and timingSafeEqual; every invalid password waits 2,000 ms.
- Missing/malformed environment configuration fails closed. No public-key fallback, session persistence, or cached privileged fetches.
- Copy and CSV export belong to Step 4. Stop after these core tasks; deploy no live migration.

## Task 1: Database contract

- [x] Generate the empty migration with the Supabase CLI.
- [x] Write database tests for schema constraints, duplicate hashes, available-key metadata, public privileges, RLS default denial, and service-role writes; observe failure before implementing.
- [x] Implement the transactional migration with UUID id, unique key_hash, allowlists, audit fields, lifecycle consistency checks, created-time and plan/status indexes, and RLS/grants.
- [x] Run the migration and test queries in embedded PostgreSQL; preserve live project state.

## Task 2: Server security and DB core

- [x] Write auth tests for password verification/delay, secure cookie options, tampering, expiry, configuration failure, rotation, and logout; observe failure.
- [x] Implement `lib/admin-auth.ts`: `verifyAdminPassword(unknown): Promise<boolean>`, `createAdminSession(): Promise<void>`, `deleteAdminSession(): Promise<void>`, `getAdminSession(): Promise<AdminSession | null>`, and `requireAdminSession(): Promise<AdminSession>`.
- [x] Implement `lib/supabase/admin.ts`: typed activation-key database contract and `getSupabaseAdmin()`, which verifies the admin session before creating a service-role-only client with uncached fetches and disabled Supabase Auth session handling.
- [x] Document four server-only environment variables and migration setup; pin dependencies and update the lockfile.
- [x] Run focused security tests, `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`; review complete code and report verification limits.
- [x] Present complete Steps 1 and 2 code and wait for the user's explicit confirmation for Steps 3 and 4.

Verification: 24/24 tests pass, TypeScript passes, production build passes. Additional database run confirms revocation of inherited PUBLIC grants. No live database migration was applied.
