# Mobile purchase optimization

Source: `AUTO_CHECK_MOBILE_UI_UX_REDESIGN_CODEX_SPEC.md`, explicitly requested for implementation.

## Implementation

1. Audit existing storefront and capture desktop hero/pricing baselines at 1280, 1440 and 1920px.
2. Add a mobile purchase surface using existing SiteConfig, canonical offer schedule and BuyButton checkout.
3. Share selected mobile plan with a progressive sticky action; coordinate support, menu, forms and viewport constraints.
4. Compact the mobile header and second bundle card; preserve desktop CSS/rendering and full product disclosures.
5. Verify unit tests, typecheck, build, mobile widths/languages/journeys, expiry, and desktop screenshots.

## Decisions

- Preserve the existing disabled standalone extension checkout. HitPay currently accepts only bundle and notification plans; implementing a new payment product is outside the mobile redesign. Cost: extension remains unavailable until payment support is added.
- Reuse the fixed published launch schedule and server price validation. No visitor-specific timer or remote pricing service is needed.
- Keep the existing workspace so the result is directly reviewable here. No commit, deployment, or provider change is required.
- Preserve the checkout portal/modal change made concurrently in this workspace. Add mobile-safe geometry, focus trapping and the shared overlay marker. Cost: old purchase-card-scoped form assertions must target the dialog.

## Evidence

Screenshots and QA outputs are saved under `.local/mobile-optimization/` (ignored).

## File-by-file changes

| File | Change |
| --- | --- |
| `app/mobile.css` | Scoped phone typography, spacing, header, selector, purchase cards, safe areas, sticky/support clearance and modal geometry. |
| `app/layout.tsx` | Zoom-compatible `viewport-fit=cover`, mobile stylesheet and shared floating-control runtime. |
| `components/MobilePurchase.tsx` | Mobile hero, accessible product radios, one selected panel, notification billing disclosure, sticky action and final purchase action. |
| `components/MobileBundleCard.tsx` | Shared bundle price hierarchy, compact localized countdown and second bundle card with expandable full features. |
| `components/MobileFloatingControls.tsx` | Coordinate menus, checkout, focused inputs, constrained visual viewport and support visibility; discover streamed content. |
| `components/Homepage.tsx` | Compose mobile purchase view alongside the preserved desktop hero. |
| `components/BundleOfferCard.tsx` | Keep desktop bundle markup and add its mobile variant. |
| `components/Landing.tsx` | Add direct selected-plan purchase to the mobile final entry. |
| `components/SiteHeader.tsx` | Mobile menu focus, Escape dismissal, focus containment and responsive cleanup. |
| `components/BuyButton.tsx` | Preserve concurrent modal checkout; add trigger ref, overlay marker, focus containment, focus restoration to each purchase entry and mobile styling hooks. Payment request stays plan/email-only. |
| `lib/mobile-pricing.ts` | Derive current/regular/separate prices from existing published configuration; format money and compact countdown; honor enabled notification periods. |
| `lib/purchaseLocale.ts` | Chinese/English compact minute countdown strings. |
| `tests/mobile-pricing.test.ts` | Expiry boundary, independent price meanings, cents, localization and disabled-period regression tests. |
| `tests/e2e/mobile-purchase.spec.ts` | Desktop baselines, mobile matrix, sticky, support, keyboard/menu, focus trap, expiry and checkout failure journeys. |
| `playwright.mobile.config.ts` | Repeat mobile suite in WebKit or installed Chrome using an isolated development build. |
| Existing E2E files | Update mobile capture/selection targets and portal form assertions; retain desktop-specific layout checks. |
| `.gitignore`, `tsconfig.json` | Support the isolated mobile E2E build directory. |

## Verification

- `npm test`: 94 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Lint: no lint script or configured lint runner in this project.
- WebKit mobile E2E: 5 passed, 0 failed.
- Chrome mobile E2E: 5 passed, 0 failed.
- Width/height matrix in both engines and languages: 360×800, 375×812, 384×832, 390×844, 393×852, 402×714, 402×754, 402×874, 412×915, 428×926, 430×932, 440×956. No horizontal overflow; initial inline CTA fits; selector controls and purchase buttons meet target sizes.
- Checked: menu focus/escape, landscape fallback, mobile→desktop→mobile observer recovery, first and second checkout entry, final purchase action, focus restoration after cancellation/Escape, price change while open, normalized plan/email request without a supplied price, retry after checkout failure, and no page errors during the matrix.
- Desktop hero and pricing compared at 1280×800, 1440×900, 1920×1080 with moving artwork/countdown masked and reduced motion. Pricing images are pixel-identical at all three sizes; hero images are pixel-identical at 1280 and 1920. At 1440, 670 pixels differ by one channel level (out of 1,296,000 pixels), consistent with negligible raster variation. Exact pixel metrics are recorded in `.local/mobile-optimization/desktop-comparison.json`.

## Remaining verification and availability limits

- Real iPhone Safari and Android Chrome toolbar expansion/collapse, hardware safe areas, software keyboards, pinch zoom, navigation chin and browser back/foreground restoration still need physical-device QA. Engine emulation does not establish those guarantees.
- Standalone extension purchase remains disabled by the existing HitPay product mapping. Mobile makes that existing state explicit; no new payment product was invented.
- Payment tests check flow initiation and retry behavior, not a real charge or external hosted checkout completion.
- The broad legacy E2E run recorded 33 passed, 24 failed, 2 skipped. It ran while concurrent checkout changes and final mobile fixes were being integrated. The three mobile journey failures subsequently passed in both engines; two desktop form assertions were updated to target the concurrent portal dialog and passed in a focused rerun. Other observed failures include old Chinese-default expectations, old ticket/ambient-toggle controls, private React Fiber assumptions, canvas/particle runtime behavior and receipt budgets. The suite is **not** reported as fully passing.

## Full E2E run: observed failing test names

- adaptive.spec.ts >> bounded effects reuse nodes and avoid pointer-driven layout measurements
- adaptive.spec.ts >> static effects on hardware preserve content, navigation and purchase controls
- adaptive.spec.ts >> static effects on touch preserve content, navigation and purchase controls
- adaptive.spec.ts >> sustained slow frames trigger runtime low mode without changing content
- admit-one-receipt.spec.ts >> paid receipt exposes the order ticket and a View Your Ticket action
- admit-one-receipt.spec.ts >> unsupported WebGL keeps the CSS graphite ticket visible without page errors
- hero-isolation.spec.ts >> the isolated hero still follows language changes without replacing its canvas
- layout-overflow.spec.ts >> desktop hero purchase card keeps CTA and ambient toggle in a padded flow footer
- mobile-purchase.spec.ts >> menu focus, keyboard fallback, landscape and later purchase stay usable
- mobile-purchase.spec.ts >> mobile decision, selected plan, sticky purchase and checkout stay connected
- mobile-purchase.spec.ts >> mobile expiry updates all purchase entries and checkout error is recoverable
- motion.spec.ts >> headline masks, native wheel input, feature reveals, and anchor navigation
- motion.spec.ts >> reduced motion leaves native input and all content visible, including live preference changes
- package-performance.spec.ts >> hero selection reuses the static heading while updating the purchase action
- package-performance.spec.ts >> storefront email entry retains the document and correct purchase amount before hosted checkout
- performance.spec.ts >> anchor clock excludes idle time and refreshes the scroll limit after height changes
- performance.spec.ts >> wheel and trackpad-sized deltas stay native and anchors yield to input
- receipt-performance.spec.ts >> ticket entrance and idle frame budget at normal and 4x CPU with paid-route JS transfer
- website.spec.ts >> bento hover effects are scoped and clean up on live reduced motion and navigation
- website.spec.ts >> dark bento showcase, language, guide dialog, and page links
- website.spec.ts >> hero recommends the complete bundle while keeping notification plans optional and keyboard-accessible
- website.spec.ts >> long ticket subjects fit mobile and cancelled orders open usable support
- website.spec.ts >> mobile bento layout keeps complete content without horizontal overflow
- website.spec.ts >> paid receipt and delivery previews fit the requested viewports for each plan and locale
