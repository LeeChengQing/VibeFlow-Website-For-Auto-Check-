# Local Website Implementation Plan

**Goal:** Implement the agreed website and a working local testing flow.
**Architecture:** Next.js App Router serves the bilingual sales page and customer/admin routes; SQLite persists local simulated commerce and support.
**Tech Stack:** Next.js, React, Tailwind v4, node:sqlite, Node tests, Playwright.
**Spec:** ../specs/2026-10-03-local-website-design.md

## Global constraints

- Two packages: extension RM24.99 one-time; mobile_notification RM11.99/sem.
- Preserve latest monochrome design and supplied assets.
- No email collection on landing; collect in separate simulated checkout.
- Local-only simulation; never claim real payments or deliveries.

## Review focus

- Price tampering, duplicate callbacks, cancellation/refund delivery gating.
- Unauthorized order/ticket/admin access and same-origin mutation validation.
- Missing credentials/assets; production must fail closed.
- Mobile overflow, keyboard navigation, bilingual form errors.
- Persistent state and helpful error feedback.

## Task 1: Local commerce and support

- [x] Write tests for server catalog, paid/cancelled/refunded order transitions, duplicate fulfillment, support tokens and email validation; run failing tests.
- [x] Implement lib/plans.ts, lib/store.ts and authenticated same-origin API routes.
- [x] Run npm test; expected all pass.

## Task 2: Approved sales page

- [x] Implement responsive bilingual landing, interactive showcase, pricing, full-size tutorial viewer, FAQ, and animated support orb.
- [x] Reuse existing CaseStudyCard structure and supplied assets.
- [x] Test actual rendering and mobile width in browser.

## Task 3: Local checkout and customer/admin portals

- [x] Implement checkout, order status, support creation/conversation, admin login/orders/tickets/refund/reply/resend previews.
- [x] Test end-to-end flows, language persistence and unauthorized access.

## Task 4: Verification and localhost handoff

- [x] Write README and .env.example documenting local demo boundaries and cloud setup.
- [x] Run unit, type, production build and browser checks; review whole implementation.
- [x] Start server on localhost:3000, open preview, and leave it running.
