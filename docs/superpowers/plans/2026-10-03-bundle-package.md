# Bundle Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (if explicitly selected) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a limited-time extension-plus-notifications bundle to pricing and make its amount, checkout summary, and local delivery preview consistent across the existing purchase flow.

**Architecture:** Add `bundle` to the shared plan catalog and calculate its price on the server from a fixed offer deadline. Build a focused client bundle card that owns the one-second countdown and use the existing checkout, order, and admin paths for purchase records and combined preview fulfillment.

**Tech Stack:** Next.js App Router, React client components, TypeScript, global CSS, existing SQLite-backed order store.

**Spec:** `docs/superpowers/specs/2026-10-03-bundle-package-design.md`

## Global Constraints

- The bundle contains one extension purchase plus the first semester of mobile notifications.
- Later notification semesters cost RM 11.99 per semester; this is not an automatic recurring charge.
- The active offer price is RM 30.00 and ends on 2026-10-13 at 23:59:59 MYT (UTC+08:00).
- After the offer, the bundle remains purchasable for RM 35.00.
- During the offer, RM 36.98 is shown as the crossed-out combined price, matching RM 24.99 + RM 11.99.
- The timer shows `[Days]天 [Hours]时 [Minutes]分 [Seconds]秒`, updates once per second, and stops at zero.
- Checkout remains a local simulation; it does not collect money, send email, or deliver a real extension or notification key.
- Existing individual plan prices and fulfillment remain unchanged.
- Do not accept a price supplied by the browser; store the server-calculated amount on each order.

## Review Focus

- Offer boundary and exact-deadline purchase: display may reach zero while server pricing changes to RM 35.00; server-calculated order amount is authoritative.
- Client clock skew: the countdown is a display; checkout uses server time and the fixed deadline.
- First client render: timer markup must be deterministic for server rendering and hydrate without a clock-dependent mismatch.
- Bundle fulfillment and expiration: the paid preview shows both inclusions and respects the existing seven-day preview lifetime.
- Historical individual orders: extension and mobile notification names, amounts, and delivery previews remain unchanged.

---

### Task 1: Add the Server-Priced Bundle Plan

**Files:**
- Modify: `lib/plans.ts`
- Modify: `lib/store.ts`

**Interfaces:**
- Produces: `PlanCode` includes `'bundle'`.
- Produces: `BUNDLE_OFFER_ENDS_AT: number` is the epoch timestamp for `2026-10-13T23:59:59+08:00`.
- Produces: `getPlanAmount(plan: PlanCode, now?: number): number`, returning integer cents; `bundle` returns 3000 before the deadline and 3500 at/after it, while existing plans return their current amounts.
- Consumes: `createOrder` continues accepting only `{ plan: unknown; locale: unknown }` and stores the amount returned by `getPlanAmount`.

- [x] **Step 1: Extend the catalog and canonical price helper**

  Add the `bundle` code and bilingual plan metadata describing the extension plus first notification semester. Keep regular catalog amount at 3500 cents and implement the exact-deadline rule in `getPlanAmount`; update `isPlan` to accept `bundle`.

- [x] **Step 2: Use the helper when creating orders**

  In `lib/store.ts`, use `getPlanAmount(input.plan)` in the stored `Order.amount`. Do not read an `amount` property from input.

- [x] **Step 3: Check TypeScript**

  Run: `npm run typecheck`
  Expected: PASS; plan narrowing and stored order amount compile.

### Task 2: Build the Featured Bundle Card and Countdown

**Files:**
- Create: `components/BundleOfferCard.tsx`
- Modify: `components/Landing.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `BUNDLE_OFFER_ENDS_AT` from `lib/plans.ts`, `useLocale`, and `BuyButton`.
- Produces: a featured pricing article whose purchase action calls `<BuyButton plan="bundle">` and whose timer shows days, hours, minutes, and seconds in the specified Chinese-unit format.

- [x] **Step 1: Implement a deterministic countdown component**

  In `components/BundleOfferCard.tsx`, create a client component with `useState` and `useEffect`. Start a one-second interval against `BUNDLE_OFFER_ENDS_AT`, calculate nonnegative remaining seconds, update immediately after mount and each tick, and clear the interval on unmount. Render a stable initial value for SSR/hydration, monospaced timer digits, and stop at zero.

- [x] **Step 2: Add the bundle card content and purchase action**

  Show the bilingual title and description, a locale-appropriate `BEST VALUE` / `限时特惠` badge, the active RM 36.98 strikethrough and RM 30.00 highlight, and combined feature bullets. At zero, show RM 35.00 without the active-offer strike-through. Keep checkout enabled. Use accessible timer labeling and the existing purchase button.

- [x] **Step 3: Restructure the pricing grid**

  Render the bundle card before the two existing cards in `Landing.tsx`. Keep individual cards unchanged. In `app/globals.css`, make the bundle span both desktop columns while the existing two cards remain side by side; preserve the single-column mobile layout. Add the requested subtle cyan accent/glow without changing the existing brand palette.

- [x] **Step 4: Check TypeScript**

  Run: `npm run typecheck`
  Expected: PASS; the new client component and plan prop compile.

### Task 3: Integrate Checkout and Combined Local Fulfillment

**Files:**
- Modify: `components/OrderStatus.tsx`

**Interfaces:**
- Consumes: `plans.bundle` for bilingual checkout/admin labels and the purchase-time `Order.amount` snapshot.
- Produces: a bundle checkout summary naming the extension plus first notification semester; a paid order preview showing both the extension ZIP placeholder and a DEMO notification key.

- [x] **Step 1: Confirm bundle plan lookup in checkout and admin**

  Ensure existing `plans[order.plan]` lookups handle `bundle`, and its billing-period copy states that the RM 30 bundle includes the first notification semester. Preserve use of `order.amount` for the checkout and admin amount.

- [x] **Step 2: Render both bundle inclusions in the order preview**

  In `components/OrderStatus.tsx`, add a `bundle` branch that states the ZIP is a local preview with the existing seven-day lifetime and shows the DEMO notification key with the existing test-only warning. Keep current extension and mobile-only branches intact.

- [x] **Step 3: Check TypeScript**

  Run: `npm run typecheck`
  Expected: PASS; all order-plan branches are exhaustive or valid for the expanded union.

### Task 4: Update Package Copy and Final Consistency

**Files:**
- Modify: `components/Landing.tsx`
- Modify: `components/BundleOfferCard.tsx`

**Interfaces:**
- Consumes: confirmed Chinese and English offer terms from the spec.
- Produces: package count, pricing description, workflow step, and FAQ copy consistent with the new bundle and renewal term.

- [x] **Step 1: Update nearby package descriptions**

  Change the hero package summary, pricing heading/summary, workflow package step, and FAQ answers that currently say there are only two packages or imply the bundle terms do not exist. Keep the two individual offers and their prices explicit.

- [x] **Step 2: Check the complete feature by code inspection and TypeScript**

  Confirm the fixed deadline is shared by countdown and server pricing, the bundle card is first and spans the desktop grid, the timer reaches zero without going negative, and all delivery-copy branches distinguish the bundle from the individual plans.

  Run: `npm run typecheck`
  Expected: PASS.

## Repository Note

This workspace currently has no Git metadata (`git status` reports that the directory is not a repository), so the implementer cannot make the frequent commits recommended by the workflow until the project is opened in its Git checkout.

