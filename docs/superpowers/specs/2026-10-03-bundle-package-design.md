# Bundle Package Pricing and Checkout Design

**Date:** 2026-10-03  
**Status:** Draft for review

## Goal

Add a purchasable all-in-one bundle to the pricing section. It includes the Soton Auto-Check extension and the first semester of mobile notifications. The bundle should stand out visually, explain the limited offer, and continue to use the site's existing checkout and order-management flow.

## Confirmed product rules

- The bundle contains one extension purchase plus the first semester of mobile notifications.
- Later notification semesters cost RM 11.99 per semester; this is not an automatic recurring charge.
- The active offer price is RM 30.00.
- The offer ends on **2026-10-13 at 23:59:59 MYT** (UTC+08:00), ten calendar days after the current date, 2026-10-03.
- After the offer, the bundle remains purchasable for RM 35.00.
- During the offer, RM 36.98 is shown as the crossed-out combined price, matching RM 24.99 + RM 11.99.
- The timer shows `[Days]天 [Hours]时 [Minutes]分 [Seconds]秒`, updates once per second, and stops at zero.
- Checkout remains a local simulation: it does not collect money, send email, or deliver a real extension or notification key.

## Pricing section

Replace the current two-card-only grid with a vertical composition: the bundle card spans the full pricing width at the top, followed by the existing extension and mobile-notification cards side by side on desktop. Keep the mobile layout stacked. Style the bundle with a subtle VibeFlow cyan accent/glow, a `BEST VALUE` / `限时特惠` badge, the requested title and description, and combined feature bullets drawn from both existing plans.

During the active offer, show RM 36.98 struck through beside the prominent RM 30.00 amount. When the timer expires, show RM 35.00 as the current price, remove the offer countdown and crossed-out price, and keep checkout enabled. The existing individual cards retain their current prices and actions.

Add Chinese and English copy for the card and update nearby package-count/description and FAQ copy so the bundle and first-semester/renewal terms are represented accurately. This includes the hero package summary, pricing heading copy, workflow step, and purchase FAQ. Existing individual pricing remains unchanged.

## Countdown and hydration

Implement the countdown in a client-side component using `useEffect` and a one-second interval. Use the fixed MYT offer deadline above; do not calculate a fresh deadline from page mount time, which would restart the offer on reload. Derive days, hours, minutes, and seconds from the remaining milliseconds. Clean up the interval on unmount. Keep the first render deterministic, then update from the current time in the effect to avoid server/client hydration differences.

## Shared plan, checkout, and delivery

Add `bundle` as a `PlanCode` and server-recognized plan. The client submits only the plan code. The server chooses RM 30.00 before the deadline or RM 35.00 at/after it, and stores that amount in the order so later checkout display and admin reports use the purchase-time amount. Do not trust a client-supplied price.

Reuse the current checkout route and order model. The checkout summary should name the complete bundle and describe the one-time extension plus first notification semester. The order status page's local delivery preview should represent both inclusions: a placeholder for the 7-day extension ZIP delivery and a generated DEMO notification key with a notice that it is only for testing. Admin order listings should resolve the new plan name and stored amount. Existing plan orders and fulfillment remain unchanged.

## Validation

- TypeScript accepts the expanded plan union and all plan lookups.
- The pricing layout shows the featured bundle above the two existing cards and stacks at the mobile breakpoint.
- The countdown renders the requested format, decrements once per second, and stops at zero.
- Orders created before and after the deadline use RM 30.00 and RM 35.00 respectively, regardless of client payload.
- A paid bundle order shows both local-preview deliverables; the existing individual order previews still work.
- Existing package prices and checkout amounts remain unchanged.
