# Site management dashboard

User approved the proposed feature scope and explicitly requested implementation. Extend the existing authenticated admin and preserve the key inventory and local commerce flow. Implement directly in the shared checkout; retain unrelated uncommitted work.

## Scope and contracts

- A versioned site configuration contains MYR integer-cent pricing for extension, semester notifications, yearly notifications and bundle; package metadata in en/zh; visibility, purchasing switches and display order; global offer enable/start/end; per-package promotional price and enable switch; guides, FAQs, Hero copy, announcements, video, contact details, purchase notices, maintenance and checkout switches, default locale and current extension release.
- Store draft and published configurations separately. Save, publish and restore use optimistic version checking. Publishing atomically records history and activity. Restore creates a draft, never silently replaces the published website. Admin-only preview consumes the draft. Customers only receive validated published settings.
- Supabase is the production persistence backend; no browser database credentials. Settings/history/activity tables are locked with RLS and service-role-only grants. Server reads of published settings are uncached. A development-only, explicit local persistence mode uses SQLite for a durable interactive preview without cloud credentials. Both paths expose the same repository contract.
- Existing admin authentication protects every action and upload. Public asset routes serve only published guide images. ZIP releases stay private and are served only for valid paid, unexpired orders. Validate magic bytes, allowed types, byte limits and filenames; use generated identifiers and immutable asset paths. Supabase stores production objects in a private bucket; local preview stores them outside public/.
- One shared price calculation selects promotional prices only when enabled and within the Malaysia-time schedule. The storefront displays the same calculation used on the server to create an order. Existing orders keep their amount and captured release. Disable/maintenance switches are enforced by checkout.
- Bring existing local orders/support into the authenticated dashboard, with search, detail, resend/correct email, demo refund, reply, close/reopen and linked-order details. This does not invent a live payment/email integration absent from the existing website. Production shows an explicit unavailable state for local-only operations.
- Key inventory retains one-time codes and export; add revocation, buyer/device/redemption details and activity records. Overview reports available keys, existing order totals/revenue, open support tickets and scheduled offers.
- Use the existing dark/glass UI with sidebar navigation, responsive forms, saving/error feedback, unsaved-change guard, live links, previews and change history. Avoid exposing secrets in messages or settings.

## Verification

Test schedule boundaries, monetary validation, disabled checkout, immutable order pricing, schema access and atomic publication/conflicts, restore semantics, action authorization, image/ZIP validation and private delivery. Browser test edit/save/preview/publish, storefront+checkout consistency, guide upload, order/support operations, revocation and mobile overflow. Existing key, checkout, Hero and navigation checks must remain green. Finish with typecheck/build and open the working localhost dashboard.
