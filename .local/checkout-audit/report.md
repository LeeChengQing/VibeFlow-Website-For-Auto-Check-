# Mobile checkout verification

Implemented in C:/Auto-Check Website. No commit or deployment performed.

## Root causes and changes

- BuyButton.tsx: removed the GSAP fade on shared #main. React transition keeps existing content visible while routing; pending state prevents repeat clicks.
- CheckoutPage.tsx: removed post-paint GSAP entrance mutation and added the existing checkout-open marker. Payment requests, prices, provider selection, consent and validation are untouched.
- checkout.module.css: desktop-only CSS entrance starts with the stylesheet. The summary never transforms, so the single fixed mobile payment bar keeps the viewport as its containing block. Existing bottom safe-area padding and scrolling clearance remain.
- SiteIntro.tsx: intro no longer scales or clears styles on shared #main. Its overlay animation remains.
- app/layout.tsx: first-load intro runs only on the homepage, avoiding checkout overlays before hydration.
- PageTransitionWrapper.tsx: homepage uses a visible static wrapper instead of replaying a whole-page opacity/transform entrance when returning. Existing homepage local animations and other page transitions remain.
- MobilePurchase.tsx: removed obsolete modal-era scrolling after purchase; scrolling remains for expanding notification choices.

Compared main ef81920 with PR #3 head 814b63d. PR #3 is not merged; its mobile-only exclusions leave shared desktop fade and homepage return behavior. Changes were implemented directly on the initially clean main workspace, without merging the PR.

## Evidence

Playwright with local Chrome, local storefront configuration and a mocked pricing response (no live payments):

- Before, 390px delayed route: 151 sampled transparent frames, 70 misplaced payment-bar frames, 70 transformed-ancestor frames. Back navigation also sampled one transparent frame.
- After: 31 scenarios, 5684 sampled frames; zero transparent frames, zero misplaced payment-bar frames, zero transformed payment-bar ancestors.
- Widths: 360, 390, 430 and desktop 1440. Covered purchase, checkout Back button, repeated navigation, browser Back/Forward, direct checkout, small-height resize/focus, reduced motion and throttled network.
- Zero browser page errors in the matrix.
- 360/390/430 no-JavaScript direct visits: payment CTA correctly positioned by initial CSS, before hydration.
- Fresh direct checkout with webdriver flag disabled: intro state done, no layout-shift entries.
- Stripe and ToyyibPay UI simulations: invalid email and missing consent rejected; valid form sends normalized email, bundle plan and consent version to the existing endpoint and follows an intercepted provider URL. No actual charge or gateway request.
- npm run typecheck: passed, including final run after restoring generated configuration changes.
- npm run build: passed.

## Limitations and remaining findings

- Raw layout-shift totals are not zero: slow-network homepage stabilization contributes approximately 0.104-0.105; removing the shared header when checkout mounts moves #main (approximately 0.068 mobile, 0.059 desktop). These entries do not identify checkout fields or the fixed payment bar. Do not interpret the passing CTA checks as a claim that all site-wide CLS has been eliminated.
- Existing backend tests: payment-checkout.test.ts passed; five checkout-consent-and-security.test.ts cases failed. Plain runner hit the server-only import guard; rerunning with --conditions=react-server reached assertions, including 403 instead of 400 and a missing expected false result. Backend tests are not all green; payment server code was not changed.
- Tests ran against the development server; production compilation passed but production browser validation was not run.
- No physical iOS/Safari keyboard or toolbar verification; desktop Chrome mobile emulation and viewport resizing are not equivalent to real-device testing.
- The referenced mobile recording was not included with the supplied text attachment.

Screenshots, frame JSON, matrix summaries and command logs are in this directory. Temporary Next cache was archived as build-cache; verification scripts remain in the ignored .local directory.
