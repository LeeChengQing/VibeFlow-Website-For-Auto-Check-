# Site management

Open `/admin` and sign in with the existing dedicated admin password. The sidebar includes overview, pricing/offers, packages, guides, bilingual content, orders/support, key inventory, publication history and site settings.

Changes follow **Edit → Save draft → Preview draft → Publish changes**. Dates use Malaysia time (UTC+08:00); promotions include the start and exclude the end. The offer switch controls promotional pricing; the countdown switch controls its display. Each package has its own regular/promotional price and promotion switch. Checkout calculates the current published price on the server; existing orders retain their amount and release.

Saved drafts are private. Publication applies all settings together and records history. Restoring history creates a draft for review. Version checking rejects overwriting changes saved in another session. Unsaved edits trigger a navigation warning. Newly provisioned activation codes still appear once, with clipboard and CSV exports; key inventory remains mounted through settings read errors.

## Local preview

Run `npm run dev:admin` with Node 24 or newer, then open [localhost admin](http://127.0.0.1:3102/admin). The default disposable preview password is `admin-browser-test-password`; optionally set `ADMIN_PREVIEW_PASSWORD` before starting. The command uses ports 3102 and 54329 and a local REST fixture for key inventory. It overrides cloud Supabase credentials for this process and does not contact a live project.

Settings/history/activity persist in `.local/site-management.sqlite`; guide images and releases persist outside `public/`, under `.local/site-assets`. Existing local orders/support persist in `.local/vibeflow.sqlite`. Optional environment overrides are `SITE_MANAGEMENT_DB_PATH`, `SITE_MANAGEMENT_ASSET_DIR` and `LOCAL_DB_PATH`. The preview key fixture resets when restarted. These files are ignored by Git; retain the SQLite databases and uploaded files together when backing up your local preview.

`SITE_MANAGEMENT_LOCAL=true` also requires `LOCAL_DEMO=true`, a loopback request host and development mode. It is ignored in production. The old demo remains at `/admin/local`, with its separate local password. The new dashboard includes its operations under Orders & Support, using the new dashboard session.

Order completion, delivery refreshes, support replies and refunds are local test operations. No live payment is charged and no email is sent. Cloud payment/email/commerce persistence remain separate integrations; production explicitly shows that local operations are unavailable. Uploaded release delivery currently uses the existing local order backend.

## Production setup

Keep the existing server-only `ADMIN_DASHBOARD_PASSWORD`, `ADMIN_SESSION_SECRET`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Apply `supabase/migrations/20261003182731_site_management.sql` after the activation-key migration through the project's normal Supabase migration process. The migration has been tested locally, and has not been applied to a cloud project by this task.

The migration seeds the current storefront, creates private configuration/revision/activity/asset/upload tables, enables and forces RLS without browser policies, and grants only the necessary service-role operations. The publication/revoke RPCs run atomically with their audit writes. Private settings and storage never require a browser Supabase key.

Images accept PNG, JPEG and WebP up to 5 MB and 25 million pixels; releases accept ZIP up to 20 MB. Production uploads go directly to private Supabase Storage using a signed upload URL, then an authenticated server action validates actual bytes and registers the immutable asset. This avoids sending upload bodies through the serverless action endpoint. Pending uploads must be completed within 30 minutes; storage signatures are scoped to their generated object path. Incomplete or unreferenced uploads are not automatically removed; retain referenced historical assets and captured order releases when adding a cleanup policy.

Public image delivery allows only visible published guide assets; authenticated admins can view draft images. ZIPs are never served by the public image route. Local ZIP downloads require an unpredictable order token, paid status, an eligible package and an unexpired delivery window. Hiding a guide removes public access. Replacing a release does not alter previously captured orders.

Configuration reads are uncached. A configured database outage fails storefront/checkout reads instead of silently using old default prices, while the admin shell keeps sign-in, keys and available operations accessible. Keep service-role credentials on the server and rotate the admin password/session secret to invalidate sessions.

## Verification

`npm test`, `npm run test:admin`, `npm run typecheck` and `npm run build` cover validation, authentication, RLS/grants, atomic publishing/conflicts, immutable pricing, private uploads/delivery, the management workflow and inventory export. Browser tests use separate ports 3103/54330 and disposable local databases. Hero isolation and smooth logo scrolling remain covered by the existing storefront browser tests. Cloud grants/storage must also be verified against the actual project after migration.
