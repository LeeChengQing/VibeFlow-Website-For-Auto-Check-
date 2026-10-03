# Admit-one receipt ticket and plan cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Degree Pass from new purchases, preserve old order records, and replace the paid-order receipt with a glossy black/grey Admit One ticket and accessible View Your Ticket overlay while fixing page overflow.

**Architecture:** Keep the active catalog in `lib/plans.ts`, with an explicit legacy-order type and safe presentation helper for stored retired plans. Build a generic shader-backed ticket in `components/ui`, map order data through a receipt adapter, and dynamically load one mounted ticket from the paid order page; keep its expanded overlay on that same instance. Validate purchase UI, server rules, receipt states, page geometry, and motion behavior at unit and browser levels.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, GSAP, Playwright, and exactly pinned `@paper-design/shaders-react@0.0.81`.

**Spec:** `docs/superpowers/specs/2026-10-03-admit-one-receipt-design.md`

## Global Constraints

- Keep notification options to Semester and Yearly; zh-CN period labels are “学期” and “年付”; EN labels are “Semester” and “Yearly.”
- Do not change bundle offer logic/countdown, or any non-Degree-Pass prices.
- Reject new `mobile_notification_degree_pass` and `period: "degree"` inputs; stored legacy orders must remain readable and labeled “Degree Pass (legacy).”
- Use `@paper-design/shaders-react@0.0.81`; cap effective DPR at 1.5, set `minPixelRatio={1}` and `maxPixelCount` near 1.2M.
- Start the Dithering shader with `colorBack="#050507"`, `colorFront="#2a2f36"`, `shape="warp"`, `type="random"`, and the smallest documented size; tune scale/shape from screenshots while retaining low contrast.
- Show the ticket only on paid orders; preserve local-test copy, delivery preview, expiry, copy, refresh, and support behavior.
- Ticket colors are glossy black, charcoal, and graphite greys. Teal is only a small status/detail accent; do not use the reference's orange colors.
- The ticket aspect ratio is 741:425. At widths below 640px keep ticket labels/footer at least 12px and the name at least 24px.
- One mounted ticket and at most one WebGL context per page. Do not use confetti/sound or React state updates per animation frame.
- Honor reduced motion, hidden-tab/offscreen pause, first-view per-order session replay, and `?replay=1`.
- Use the specified 1.6s entrance windows: ticket 0–600ms; shader 200–700ms; text 350–900ms in 70ms steps; specular sweep 500–1300ms; amount count 500–1200ms; perforations 600–1000ms. Freeze shader at ~2.5s.
- Fix horizontal overflow at its source. Do not add a global `overflow-x: hidden` workaround.
- Do not run `shadcn init`; use the existing `components/ui` directory.

## Review Focus

1. **Retired plan input vs persisted record:** reject new API orders using the removed plan code or `period: "degree"`, while checkout/order/admin display safely handles old stored rows. Pin with `tests/store.test.ts` and an API/browser legacy-record test.
2. **Locale persistence/hydration:** switching between zh-CN and EN must keep plan names, period labels, receipt text, and server/client output consistent. Pin with the localized Playwright pricing and paid-order tests plus console/page-error assertions.
3. **Shader unsupported or lost context:** unsupported WebGL2 or shader initialization failure must show the CSS graphite fallback without crashing the order view. Pin with a browser test that blocks WebGL2/context creation.
4. **Motion lifecycle:** first view, reload, forced replay, hidden tab, offscreen card, and reduced motion must not leave a ticker/canvas animating. Pin with the receipt behavior/performance tests.
5. **Long content and tight viewports:** CJK/English plan names, email/reference, 360px mobile, and the 1280×720 floor must not clip required details or introduce horizontal scrolling. Pin with the receipt layout matrix.

---

### Task 1: Split active plans from retired order records

**Files:**
- Modify: `lib/plans.ts`
- Modify: `lib/types.ts`
- Modify: `lib/store.ts`
- Modify: `components/Checkout.tsx`
- Modify: `components/OrderStatus.tsx`
- Modify: `components/AdminDashboard.tsx`
- Test: `tests/store.test.ts`
- Test: `tests/e2e/website.spec.ts` for API rejection

**Interfaces:**
- `PlanCode` represents active purchasable plans only.
- `OrderPlanCode = PlanCode | 'mobile_notification_degree_pass'` represents order data that may already be persisted.
- `Order.plan` uses `OrderPlanCode`.
- `isPlan(value: unknown): value is PlanCode` accepts only active purchase codes.
- `isNotificationPlan(value: OrderPlanCode): value is Exclude<OrderPlanCode, 'extension' | 'bundle'>` continues to recognize the stored legacy notification code for delivery rendering.
- Add a safe display helper for active and legacy codes; legacy presentation returns “Degree Pass (legacy)” and does not add a retired price back to the active catalog.
- `createOrder(input)` rejects a retired plan code and `period === 'degree'` before persistence.

- [ ] **Step 1: Add failing `createOrder rejects retired Degree Pass inputs but reads legacy orders` store tests** asserting active Semester/Yearly order creation works, `mobile_notification_degree_pass` is rejected, `period: 'degree'` is rejected, and a seeded legacy row retains its stored fields.
- [ ] **Step 2: Run `npm test` and confirm the retired-input tests fail for the missing rejection/type support.**
- [ ] **Step 3: Update active and stored-order plan types, preserve `isNotificationPlan` recognition for stored legacy rows, and add safe active/legacy display resolution.** Keep persisted amounts as order fields; remove retired catalog prices and billing metadata.
- [ ] **Step 4: Add a store fixture that writes an old order JSON record with the retired plan code and confirms reads preserve its reference, amount, and status.**
- [ ] **Step 5: Update checkout, order status, and admin package display to use the safe display helper; retain existing order amount and delivery data.**
- [ ] **Step 6: Add API coverage that POST rejects the old plan code and a valid plan plus `period: 'degree'`; verify a seeded legacy order can render its legacy label.**
- [ ] **Step 7: Run `npm test` and the focused legacy order/API Playwright test; expect all active order flows to pass and legacy creation to fail with the existing invalid-plan response.**

### Task 2: Remove Degree Pass from purchase UI and localize periods

**Files:**
- Modify: `lib/plans.ts`
- Modify: `lib/purchaseLocale.ts`
- Modify: `components/BillingSegmentedControl.tsx`
- Modify: `components/NotificationPriceDisplay.tsx`
- Modify: `components/HeroPurchaseCard.tsx`
- Modify: `components/Landing.tsx`
- Modify: `tests/e2e/website.spec.ts`
- Modify: `tests/e2e/adaptive.spec.ts`

**Interfaces:**
- `NotificationBillingPlan = 'semester' | 'yearly'`.
- `notificationBillingOptions` contains exactly two equal-width options.
- Existing bundle countdown, bundle pricing, extension price, notification semester price, and notification yearly price remain unchanged.

- [ ] **Step 1: Add failing `billing tabs expose only localized Semester and Yearly options` browser assertions** for exactly two tabs, zh-CN “学期”/“年付”, EN “Semester”/“Yearly”, and absence of retired price/badge/duration/CTA copy.
- [ ] **Step 2: Run the focused adaptive/pricing tests and confirm they fail against the current three-option catalog.**
- [ ] **Step 3: Remove retired plan controls and branches; localize period labels and keep yearly savings computed from original/current values (rounded to 17%).**
- [ ] **Step 4: Keep the bundle purchase default, promotion timer, all other price values, and keyboard navigation behavior.**
- [ ] **Step 5: Run `npx playwright test tests/e2e/adaptive.spec.ts tests/e2e/website.spec.ts --grep "hero recommends|pricing|bundle"`; expect the new two-option assertions and existing bundle checkout behavior to pass.**

### Task 3: Build the generic glossy Admit One ticket

**Files:**
- Create: `components/ui/admit-one-ticket.tsx`
- Create: `components/ui/admit-one-ticket.module.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: new focused assertions in `tests/e2e/admit-one-receipt.spec.ts`

**Interfaces:**
- Export `AdmitOneTicketProps` with `name`, `presenter`, `event`, `venue`, `dates`, `stubText`, `watermark`, and measured `width`.
- Export `AdmitOneTicket` as a client component with CJK-aware `splitName`/`fitScale`, the reference's perforated geometry and 741:425 ratio, plus a narrow-screen layout profile.
- Dithering props use the verified Paper Shaders API; shader and ticket internals remain generic and contain no order-store imports.

- [ ] **Step 1: Add failing `AdmitOneTicket renders CJK and Latin content within its measured width` browser assertions** for required accessible text, 741:425 rendered ratio, CJK name wrapping, and 12px/24px small-screen floors.
- [ ] **Step 2: Run the focused spec and verify the ticket component is absent.**
- [ ] **Step 3: Before adding a dependency, build the current app and measure/save the production success-route JavaScript transfer baseline for later bundle comparison.**
- [ ] **Step 4: Install the exact verified version with `npm install --save-exact @paper-design/shaders-react@0.0.81`; inspect installed declarations/runtime and confirm React 19 peer compatibility before implementation.**
- [ ] **Step 5: Implement only the typed ticket geometry/rendering needed from the supplied component; format presenter and event as separate readable lines. Do not include its bundled shader engine, image shader, remix helpers, drift helpers, or sound code.**
- [ ] **Step 6: Style the ticket with low-contrast glossy black/charcoal/graphite greys, pale ink, an SVG gradient edge along the ticket clip path, grey perforations, subtle watermark, and small teal status accents. Add a static shadow behind it; no filter drop-shadow on the ticket/canvas.**
- [ ] **Step 7: Add responsive layout profiles, measured width support, CJK-aware sizing without uppercasing CJK, stable render values, and the CSS fallback for WebGL failure.**
- [ ] **Step 8: Run `npm run typecheck` and the focused ticket browser test at desktop, 640px, and 390px; expect no clipping, render mismatch, or text under the specified floors.**

### Task 4: Add order adapter, single-instance overlay, and success-page layout

**Files:**
- Create: `components/receipt/ReceiptTicket.tsx`
- Create: `tests/e2e/helpers/orders.ts`
- Modify: `components/OrderStatus.tsx`
- Modify: `tests/e2e/website.spec.ts` (move paid-order helper to shared test utility)
- Modify: `app/globals.css`
- Delete: `components/ui/ticket-confirmation-card.tsx` after confirming it has no remaining imports
- Test: `tests/e2e/admit-one-receipt.spec.ts`

**Interfaces:**
- `ReceiptTicket` takes the persisted paid `Order` and locale through existing `useLocale`; maps order values to `AdmitOneTicketProps` and owns measured width, shader visibility/lifecycle, entrance/replay, reduced-motion behavior, and the “View Your Ticket” overlay.
- `OrderStatus` dynamically imports one `ReceiptTicket` only for `order.status === 'paid'`; one mounted canvas moves into the accessible expanded overlay instead of rendering a duplicate.
- Non-paid records continue to use the existing plain status card.

- [ ] **Step 1: Add failing `paid orders expose one accessible ticket and modal while non-paid orders do not` browser assertions** for order-derived localized ticket content, amount, date, masked email, one status announcement, expand/close/Escape/focus return, and absence of ticket UI for non-paid orders.
- [ ] **Step 2: Run the focused receipt test and verify ticket/overlay expectations fail.**
- [ ] **Step 3: Move `createPaidOrder` into `tests/e2e/helpers/orders.ts` and update existing website tests to import it, so receipt tests reuse the same API setup.**
- [ ] **Step 4: Implement the order-to-ticket adapter using only order fields and localized plan data; set presenter/event to “VibeFlow presents”/“Soton Auto-Check”, use `Asia/Kuala_Lumpur` and stored `paidAt`, map bundle/extension/notification names and amount, add PAID/LOCAL TEST pills, and add one flip-able email-mask constant.**
- [ ] **Step 5: Dynamically load the paid-only adapter per the installed Next 16 guide; add accessible loading and CSS fallback states.**
- [ ] **Step 6: Implement the `View Your Ticket` button and same-instance overlay with dialog semantics, focus management/return, Escape/close behavior, and 44px mobile target.**
- [ ] **Step 7: Move notice and complete delivery preview to the left; place ticket and compact status/email/payment/plan-includes details on the right at >=1024px and stack heading, ticket, details, delivery, notice below 1024px. Keep one page H1 and no nested `<main>`.**
- [ ] **Step 8: Implement the 1.6s transform/opacity sequence, amount count-up via GSAP ticker/ref, replay session key per order, reduced-motion completion, offscreen/tab pause, 2.5s shader idle, and unmount disposal. Remove old confetti animation.**
- [ ] **Step 9: Run focused paid, pending, cancelled, refunded, replay, reduced-motion, overlay keyboard, and localization tests; expect no console errors or hydration warnings.**

### Task 5: Find and fix horizontal overflow at its source

**Files:**
- Modify: the offending source stylesheet/component discovered through measurement
- Modify: `tests/e2e/admit-one-receipt.spec.ts` or a focused `tests/e2e/layout-overflow.spec.ts`

**Interfaces:**
- No new global clipping rule. Tests compare `document.documentElement.scrollWidth` with `clientWidth` on home, checkout, and paid order pages.

- [ ] **Step 1: Add failing `home checkout and order pages have no horizontal overflow at target widths` browser assertions** at 1366px, 1536px, 1920px, and 390px; include diagnostics listing elements extending past the viewport.
- [ ] **Step 2: Run the focused test and record the overflowing element at 1920px and mobile.**
- [ ] **Step 3: Fix the measured source (including decorative bleed bounds where applicable) without clipping legitimate page content.**
- [ ] **Step 4: Rerun the overflow test and assert each route has `scrollWidth <= clientWidth`.**

### Task 6: Capture final viewport matrix and measure performance/bundle delta

**Files:**
- Create/modify: `tests/e2e/admit-one-receipt.spec.ts`
- Modify: `tests/e2e/website.spec.ts` to import the shared order helper
- Modify: `tests/e2e/receipt-performance.spec.ts`
- Create: `.local/admit-one-screenshots/` outputs (ignored local artifacts)
- Report: final JS transfer/bundle comparison and performance figures

**Interfaces:**
- Use `createPaidOrder` from `tests/e2e/helpers/orders.ts` in the receipt screenshot/performance tests.
- Capture performance for a 3s entrance and 3s idle period at normal and 4× CPU throttle; no additional production dependencies for analysis.

- [ ] **Step 1: Add the final screenshot/layout matrix for pricing/hero (both billing periods), checkout, and each active paid plan (bundle, extension, notification semester, notification yearly), in zh-CN/EN at 1366×768, 1440×900, 1536×864, 1920×1080, and 390×844.**
- [ ] **Step 2: Add 6 entrance-frame captures and desktop fit assertions for ticket/details/delivery; assert the 1280×720 floor exposes ticket, status, and amount.**
- [ ] **Step 3: Add `ticket entrance and idle meet the frame budget at normal and 4x CPU` production-route measurements**; record loaded order-route JS transfer baseline/final, normal/4× entrance and idle p95, frames over 20ms, and Long Tasks.
- [ ] **Step 4: If normal-speed entrance p95 exceeds 16.7ms, reduce `maxPixelCount` near 0.6M and repeat the measurement.**
- [ ] **Step 5: Run `npm run typecheck`, `npm test`, `npm run build`, and focused Playwright suites; then run the full relevant E2E suite and verify there are no hydration warnings or console errors.**
- [ ] **Step 6: Review repository searches for Degree Pass/retired prices and prepare final changed-file list, removed-option list, package/version, performance/bundle delta, screenshots, and open questions.**
