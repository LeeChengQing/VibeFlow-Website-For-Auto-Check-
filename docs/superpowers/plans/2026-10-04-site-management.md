# Site management implementation plan and ledger

Approved scope: `docs/superpowers/specs/2026-10-04-site-management-design.md`. User requested implementation; proceed without repeating permission questions. Work in the existing checkout so the localhost preview and earlier uncommitted work are preserved. No deployment, remote migrations, commits or push requested.

1. Define configuration/defaults, validation, schedule and money functions. Verify boundary/error cases with unit tests.
2. Add settings persistence, authenticated actions, optimistic versioning, publication/history/activity and private uploads. Supply Supabase migration and durable local development adapter; verify transactional behavior and auth/access restrictions.
3. Build sidebar/admin editing sections, asset uploads, overview/history and operational sections. Preserve inventory generation/export; add revoke/detail.
4. Feed published settings into the storefront and checkout with isolated price/countdown updates, metadata/guides/content controls and admin draft preview. Preserve existing route and Hero isolation.
5. Extend local preview, test all flows, review changes, typecheck/build and leave localhost open.

## Ledger

- Discovery: commerce/support are local SQLite demos, not live HitPay/email. Preserve that operational limitation and expose it clearly; production configuration uses Supabase.
- Decision: explicit SITE_MANAGEMENT_LOCAL development mode stores settings/uploads durably locally; local fixture key inventory remains supported. No live Supabase credentials are needed to try controls.
- Decision: permission to implement is explicit; skill design/planning artifacts document the approved scope and do not introduce another approval gate.
- Completed: validated bilingual configuration, schedules/prices, Supabase migration/private storage/RPCs, local SQLite settings, private assets, authenticated actions, overview/sidebar/editors, operational controls, key revocation, storefront/checkout integration and protected draft preview.
- Review fixes: retain the inventory client through settings outages; normalize signed-upload MIME for Windows ZIPs and empty image MIME; redirect expired preview sessions; revoke inherited service-role grants before granting least privileges; keep operational reads independent from settings failures; avoid tracing development upload files into production builds.
- Verification: 58 unit/database tests pass; 7 admin browser tests pass (draft/preview/publish, uploads/delivery, prices/order snapshots, history, checkout switches, operations, revocation, stale-write conflict and code preservation during a settings outage); 5 Hero/logo browser checks and 2 existing checkout/security browser checks pass; TypeScript and optimized Next.js build pass without build warnings.
- Local entry: `npm run dev:admin` starts the isolated local settings/operations preview at port 3102 with the disposable key fixture at 54329. Settings/uploads persist locally; fixture inventory resets on restart.
- Production status: supplied migration remains unapplied to any cloud project. Existing commerce/email operations remain local demos; no deployment or live project mutations performed. User subsequently requested committing and pushing the completed website update to GitHub.
- Handoff: `npm run dev:admin` is running at `http://127.0.0.1:3102/admin`; authenticated browser is open to Pricing & Offers. Preview credentials are disposable. Screenshot saved to `.local/site-management-dashboard.png`.
