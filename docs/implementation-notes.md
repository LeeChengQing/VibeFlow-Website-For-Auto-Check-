# Implementation notes

The user authorized development on 2026-10-03 following the earlier planning/mockup conversation. Latest pricing, monochrome theme, and removal of the landing email field supersede the initial plan. There is no Git repository, no cloud credential configuration, and no deployed backend. Work proceeds directly in the named workspace; no branch/worktree/commit is implied. The local acceptance scope is documented in the design and plan files. External payment/email/cloud verification remains a launch setup step requiring real credentials and assets.

## Review and decisions

- The cloud integrations are deferred because credentials, genuine ZIP and notification keys are absent. The local application must remain explicitly simulated; the cost of assuming cloud readiness would be an unusable live purchase flow. Cloud prerequisites are in README.
- Enforced local API rejection in production, even if .env.local enables LOCAL_DEMO. Unit regression failed first and then passed.
- Enforced delivery expiry in customer server reads, not just the UI. Expiry/resend regression failed first and then passed.
- Browser evidence showed Next normalizes request.url; origin comparison now uses the validated loopback Host authority and still rejects external origins and hosts. Security regressions failed first and then passed.
- Framer Motion initial styles are identical during SSR and hydration. Reduced-motion CSS shows the card immediately without movement, while the GIF is replaced by the static logo. Browser regression covers visibility and hydration.
- Reviewer classified unpaid support links and long subject overflow as minor; regraded them as important because valid customer input made support unusable or overflowed mobile. Both issues were reproduced in browser checks before correction.
- Data persistence was verified from an independently spawned Node process against the same SQLite database.
- An independent read-only reviewer inspected commerce, token access, admin authorization, and scope. Its two important findings are fixed; both usability findings are also fixed. No findings remain deferred in the local scope. Real cloud behavior and sandbox payments are unverified and remain outside this test deliverable.

## Initial website verification
- npm test: 12/12 passed.
- npm run typecheck: passed.
- npm run build: passed.
- npm run test:e2e: 7/7 passed (33.7 seconds).
- Visual inspection: desktop and mobile hero/showcase screenshots inspected; supplied images load, white card is contained, and dark image is inset.

## GSAP and smooth scrolling update

The user confirmed that the copied banking animation brief should be applied to the existing Soton website. Installed and read the requested Locomotive Scroll skill from `freshtechbro/claudedesignskills/.claude/skills/locomotive-scroll`; applied its accessibility and lifecycle guidance. Lenis is the single runtime scroll engine, as specified in the animation brief. No second scrolling library or transformed scrolling container was added.

Added masked headline lines, 1.5-second power4.out reveal, ScrollTrigger setup-card and product-feature entrances with 50px movement and 0.2-second stagger. Preserved the existing six product features and Framer Motion white showcase. Complete CDN HTML is in `public/animation-demo.html`, with frozen inspection frames at t=0,1.95,3.9.

Review and browser evidence prompted fixes for responsive card grouping, background scrolling beneath the guide dialog, interrupted native scroll before anchor navigation, and restoring feature styles during live reduced-motion changes. The stronger resize regression checks that the second mobile row stays hidden when only the first row crosses its trigger. Cleanup restores original owned styles and rejects late batch callbacks. Removed a functional batchMax option because GSAP's implementation installs a refresh listener that outlives its triggers. Independent review verified the final resize, modal, preference-toggle, and interrupted-anchor behavior; no important issues remain.

Final verification of this update:
- npm test: 12/12 passed.
- npm run typecheck and npm run build: passed.
- npx playwright test: 11/11 passed (35.0 seconds), including existing commerce/support flows.
- Standalone CDN example executed with no page errors; start/mid/end screenshots inspected.
- localhost:3000 and /animation-demo.html returned HTTP 200. Existing in-app browser refreshed and left open.
- Browser testing uses a separate .next-e2e directory and database on port 3001. Only one Playwright run is started at a time to preserve test artifacts.

## Hero, navigation, and checkout alignment update

Applied the user's supplied layout directions to existing components. The header now displays Soton Auto-Check with a small by VibeFlow_MY credit. Desktop hero columns are centered within the viewport space below the header, replacing fixed top padding. Checkout has a dedicated two-column grid at 1024px and above, with the introduction/warning on the left and payment form on the right; smaller widths stack those sections. Short desktop viewports use compact spacing; the support orb moves beneath the checkout introduction so it does not cover payment controls.

Verification: production build and TypeScript passed; all 11 existing browser tests passed (36.0 seconds). Checked initial scroll position, element bounds, and horizontal overflow at 1440×900,1280×720,1024×480,390×844,320×700; also checked English at the short desktop and phone sizes. Both desktop cards fit at 1024×480, and the hero column centers match the remaining viewport midpoint. Mobile checkout stacks correctly and remains scrollable at narrow sizes. Inspected desktop/short/mobile screenshots, then refreshed the existing localhost browser tab.

## Ambient ElectricLogo and VibeFlow typography

Adapted the supplied ElectricLogo shader as a client-side JSX module with OGL. The later VibeFlow reference image supersedes the example's generic V shape. Used imagegen to create a transparent asset containing the emblem and wordmark, removing the circular ring, disc, background, and scattered dots. The project-owned asset is public/vibeflow-electric-mark.png; original Downloads files were preserved.

The hero has an isolated stacking context, with noninteractive artwork beneath content. Following live visual feedback, opacity is 0.32 on desktop and 0.24 on mobile, intensity is 0.7, and the artwork is shifted up and left. The navbar keeps Soton Auto-Check as primary text, with by VibeFlow using thin Vibe and bold Flow. A small pause control, static fallback for reduced motion or unavailable WebGL2, live preference handling, offscreen/hidden-document suspension, and renderer cleanup preserve usability. Raster resolution is capped at one million pixels.

Manual checks passed for actual shader draws, absence of console errors, unobstructed plan selection, pause/resume, live reduced-motion changes, offscreen suspension, route cleanup, mobile overflow, and unavailable-WebGL fallback. Desktop, mobile, and reduced-motion screenshots were inspected; existing hero and checkout bounds checks passed. Final production build and TypeScript passed; full browser regression passed 11/11 (46.0 seconds).

The previously intermittent route-cleanup assertion was traced to Lenis 1.3's native-scroll idle timer: destroy removes classes, but its delayed callback can change isScrolling afterward and re-add them. Calling public stop() before destroy resets that state before disposal, preventing a late class mutation. The existing regression failed before the fix and passed afterward; test assertions were unchanged.

## Support cue and compact pricing update

Added a permanent bilingual support cue (这里找客服 / Support here) above the customer-service orb. A separate rounded wrapper clips the GIF while allowing the label to remain visible. Reduced pricing font sizes, card padding, and list spacing, with further adjustments for short desktop viewports. All plan details and purchase controls remain present; mobile cards continue to stack and scroll naturally.

Checked nine viewport/language combinations: 1920×900,1365×640,1280×720,1024×600,1024×480,960×640,390×844,320×700, plus English at 1365×640. Both desktop pricing cards and purchase buttons fit below the sticky header, support labels remain within the viewport, and support links open /support. Production build passed. The final full browser rerun passed 11/11 (38.5 seconds). Earlier runs intermittently timed out on the existing route-cleanup assertion; a diagnostic rerun recorded no page errors and passed, followed by the successful full rerun. No motion changes or test assertion changes were made for that intermittent result. Desktop and mobile pricing screenshots were inspected and the existing localhost tab was refreshed.

## Dark MagicBento showcase and product features

The user replaced the earlier white showcase direction and confirmed that both the showcase and the six-feature section should share dark capsule cards. Removed the white carousel and its CaseStudyCard component and styles. The showcase is now an asymmetric six-card composition with a large extension preview, timetable and notification previews, two small setup/package cards, and a guide link. All six detailed product descriptions remain in the second Bento grid. Both sections use the same shell alignment, dark surfaces, large radii, and teal VibeFlow accents. Preview UI is explicitly labeled illustrative.

Adapted the supplied React Bits MagicBento effects into a typed data-driven client component. The official source/license were checked and the complete MIT + Commons Clause notice preserved in licenses/react-bits.txt. Desktop pointer interactions include a scoped spotlight, proximity border glow, twelve drifting particles, gentle tilt/magnetism, and a transient click ripple. Grid effects never add body overlays. Touch/narrow screens and reduced motion show static cards; live preferences and route cleanup remove listeners, particles, tweens, and owned transforms. Product entrance animation owns the outer slot while hover effects own the inner article, preventing transform conflicts.

Browser diagnostics reproduced a hover/scroll ordering bug: a scroll event cancelled a queued pointer paint in the same frame. Scroll now schedules a fresh bounds check for the active pointer; moving out of the grid clears particles. Cleanup also explicitly restores each card's original transform because nested GSAP contexts can leave an identity matrix. The interaction regression failed before these fixes and passed afterward. The resize regression now positions each mobile card against the actual trigger threshold rather than allowing Playwright's centered scroll to bring the following card into view.

Verification: final production build and TypeScript passed; full browser suite passed 12/12 in 45.0 seconds, including language, mobile content bounds, hover/click effects, live reduced-motion cleanup, navigation, and the existing checkout/support/admin flows. Manual layout checks covered 1440×1000,1365×640,1024×600,768×900,390×844,320×700 and English at 320×700 with no horizontal overflow or clipped card content. Final desktop showcase/features and mobile screenshots were inspected. Existing localhost:3000 browser tab was refreshed and left at #showcase.

## Native input and decorative rendering performance

The user requested a close input-to-scroll relationship and a deeper rendering audit. Replaced the 1.2-second wheel smoothing path with browser-native wheel/trackpad/touch/keyboard scrolling. Lenis remains solely for 0.4-second explicit anchors, with virtual input listeners attached to an inert node and a GSAP ticker active only during an anchor. A monotonic active-time clock excludes idle intervals. Passive user-input listeners interrupt anchors, while the existing dialog stop/start lock remains intact. Global CSS scrolling is auto, window/content resize refreshes are debounced, and the standalone CDN example follows the same native-input policy.

ElectricLogo's existing offscreen observer is retained and guarded at frame entry. Pending frames now cancel during scroll activity as well as offscreen/hidden/pause/disposal. Rendering resumes after 120ms idle, capped at 30 draws per second and 450,000 pixels with DPR at most 1. Cached color conversion, reused color arrays, and removal of unnecessary noninteractive pointer listeners reduce idle work. MagicBento no longer updates proximity gradients and reads card bounds on every scroll. It suspends particles and active hover tweens, performs no work for inactive grids, and checks the last pointer once after idle. There is no scroll-position React state. Layer hints are temporary and released after entrance/hover effects.

Measured the same localhost/headless Chrome scenario before and after. A 300px input reached 90% in about 404ms before and the first sampled frame after (~0.8ms in this headless run). Small-delta stream P95 frame callback gaps fell from 30.2ms to 8.8ms; GL submissions in the input-plus-settling window fell from 139 to 8, with zero submissions during active input and zero while offscreen. No measured input long tasks exceeded 50ms. These are local developer measurements, not physical 120Hz or input-to-photon guarantees; sampling details and sources are in docs/scroll-performance.md.

Final production build and TypeScript passed. The full browser suite passed 16/16 (1.2 minutes), including four new performance regressions for native unprevented deltas, anchor interruption/idle clocks/height changes, actual GL draw and pending-frame counts, idle/offscreen/reduced-motion cleanup, and temporary layer hints. Existing responsive, modal, bilingual, checkout, support, and admin flows all passed. Native scrolling can be tested directly at localhost:3000.
