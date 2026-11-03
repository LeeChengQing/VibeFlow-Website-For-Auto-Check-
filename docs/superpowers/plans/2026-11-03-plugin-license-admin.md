# Current plugin license admin implementation plan

**Goal:** Manage the deployed plugin authorization system from the existing website admin.
**Architecture:** Reuse administrator sessions and incumbent admin styling. Replace the old Key Inventory surface with a panel backed only by CHINA_SUPABASE_URL / CHINA_SUPABASE_SERVICE_ROLE_KEY, pinned to qckpwckfukyurkobrsig. Keep payment/order code unchanged. Issue 160-bit AC-LIC keys, expose plaintext once, persist SHA-256 only. Device release deletes only a binding and preserves an audit event; existing activation/status RPCs remain unchanged, as expressly requested by the user.
**Authorization:** User approved this approach by continuing and confirmed all prior keys are disposable during debugging. Preserve devices, credentials, schedules and phone entitlements. Prepare and verify before publishing; no automatic deletion during page load.
**Workspace:** Clean production-source checkout C:/Auto-Check Website-hitpay-retirement-20261020, branch codex/plugin-license-admin-20261103; preserve unrelated dirty primary checkout.
**Tech:** Next.js 16.3.8, React, existing Supabase client, node:test/tsx, PGlite, Playwright. No new dependencies.

## Tasks
- [x] RED/GREEN: tests/plugin-license-admin.test.ts and lib/plugin-license-admin.ts: authentication before privileged access; strict input validation; canonical 160-bit generation/hashing; sanitized bounded list; no raw keys in storage, errors or audit.
- [x] RED/GREEN: tests/plugin-license-release.test.ts and supabase/migrations/20261103142304_plugin_license_admin_device_release.sql: release seat atomically, record history, preserve existing status behavior, allow legitimate reactivation; anon/authenticated cannot call RPC.
- [x] UI: app/admin/plugin-actions.ts, app/admin/PluginLicensePanel.tsx, app/admin/page.tsx; reuse admin layout and shared fields/buttons; one-time protected key dialog; confirmation for revoke/release, safe errors, pagination/filtering, local-time display.
- [x] Verify targeted regressions, actual browser admin flows at desktop/mobile using isolated fixtures, build and source scan; independent final scoped review; document exact deployment and cleanup procedure.

## Review focus
- Wrong database environment must fail closed; never use fallback commerce credentials.
- Unauthorized calls must not read DB or generate keys; errors never expose secrets.
- User ruling: release frees the seat without explicitly returning revoked to the former device; do not add deny markers or change device-status RPC behavior.
- Concurrent activation/release must respect device-before-license lock order and max seats.
- New key plaintext exists only in the one-time result; filters/history never include it.
- Client mutation retry after a lost response must advise checking the ledger rather than silently issuing again.
- Old key cleanup must not cascade into devices/schedules/phone entitlements or modify payment-provider retirement settings.
