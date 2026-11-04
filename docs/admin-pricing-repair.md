# Admin pricing compatibility repair

Root cause: admin pricing referenced pricing_catalog, pricing_admin_update and pricing_audit, but none is defined by this repository's checked-in migrations. This is not an identified unapplied migration. The user confirms these objects are absent from project qckpwckfukyurkobrsig.

Actual storefront authority: site_configuration.published, read by getPublishedSiteConfig. Both public /api/pricing and the active Stripe/ToyyibPay createUnifiedCheckout flow use that configuration and packagePrice. canonical-commerce's pricing RPC scaffold is not the active checkout price source.

Repair: the authenticated admin pricing API uses existing getSiteManagementData and mutateSiteSettings('save'). GET exposes published campaign status separately from editable draft campaign/products. Only MYR exists in the current site configuration; no fabricated CNY/USD rows or currency conversion are introduced. POST patches an allowlisted field subset of the current draft, validates the full configuration, and saves using the existing version check and transactional manage_site_configuration RPC. It never publishes automatically. Public checkout and published prices stay unchanged until the existing explicit publication flow runs. Publication history reuses site_revisions; it is not presented as a new per-field pricing audit ledger.

Dependencies: 20261003162918_activation_keys.sql precedes 20261003182731_site_management.sql. The latter defines site_configuration, site_revisions, site_activity, assets, uploads and manage_site_configuration, including service-role-only grants, RLS, optimistic concurrency and atomic audit writes. Production presence/grants of these dependencies remain UNVERIFIED; no new schema is invented or applied.

Production preflight (read-only, authorized SQL editor):

```sql
select to_regclass('public.site_configuration'),
       to_regclass('public.site_revisions'),
       to_regclass('public.site_activity'),
       to_regprocedure('public.manage_site_configuration(text,jsonb,bigint,text,uuid)');
select version, name from supabase_migrations.schema_migrations order by version;
select id, version, published->'offer' as published_offer,
       draft->'offer' as draft_offer from public.site_configuration where id=1;
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where routine_schema='public' and routine_name='manage_site_configuration';
```

Do not reapply the entire historical migration blindly: it contains CREATE statements, seed data and storage changes. If a dependency is missing, prepare a separately reviewed additive repair against live definitions first. Any production DDL requires explicit approval; none has been executed or requested by this code repair.

Rollback: reverting the application patch returns the previous admin endpoint; it changes no database objects. The patch itself performs no production writes. An administrator's later explicit draft saves/publications are independent data operations and must use existing history/version controls to restore; application rollback must not overwrite them.

The user-supplied enabled campaign window, Oct 4–Oct 15 2026 MYT, remains expired on Nov 5. No dates, enable flags, product prices, existing configuration, RLS, order records or payment integrations were changed in production.

Verification: authenticated route reads/draft-only saves tested with mocked management boundary; unauthorized/cross-origin rejection, invalid amounts/windows, stale versions and checkout request security tested. Local site-settings save/publish/history regression tested. Production authenticated HTTP/DB reads and writes remain UNVERIFIED: this workspace's configured Supabase URL is not the canonical project, and no authenticated production connection was available. Do not redirect the existing key to a different project or expose credentials.

The historical site-migration test compared every package marketing string against current DEFAULT_SITE_CONFIG, failing before permission assertions. Inspection confirmed prices and operational flags match. The test now compares those operational fields, preserving its RLS, publish, rollback, audit and stale-write assertions. Neither seeds nor current defaults were modified.

## Verification — 2026-11-05

- User confirms production site_configuration and manage_site_configuration exist, service_role can execute, browser roles cannot, and configuration reads are permitted. These are user-provided production facts; this session did not independently inspect database credentials/grants.
- Production https://vf-auto-check.vercel.app/api/admin/pricing without a session returned HTTP 401 with UNAUTHORIZED.
- Vercel production deployment dpl_568F7667i6xxsJ8XsUjvNjXqx9FJ is READY at commit 7b4047c48763a08ed9f60fd164bf19ec62cf9f3c. GitHub main matches that commit. The repaired pricing files remain local/uncommitted, so this production deployment does NOT include the repair. No release was performed during inspection.
- Authenticated production repaired GET remains UNVERIFIED: repair is undeployed and no production admin session was available. No login was guessed or authentication bypassed.
- Ten isolated pricing/settings/migration tests PASS: authorized management-boundary GET, unauthorized rejection, origin/amount validation, draft-only save, stale writes, expired published versus scheduled draft, checkout security, local save/publish/history, and SQL RLS/publish/restore/audit checks. Production received no save/publish call.
- Dashboard now refetches published campaign status when supplied configuration version changes, including after publication refresh. PricingEditor independently displays draft and published status. The expired published Oct 15 campaign is not activated or extended.
- npm run typecheck and npm run build PASS. No production DDL, pricing updates, or payment changes.
- Final: local workflow PASS; production authentication guard PASS; deployment inclusion FAIL (not deployed); repaired authenticated production read UNVERIFIED.
