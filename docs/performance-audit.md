# Pricing and navigation performance audit

Implemented against `optimizeperformance.md`, 3 October 2026. This project uses Next.js 16.3.8 and React 19.3.0; the installed Next.js documentation governed routing changes.

## Findings and changes

| Pillar | Finding | Implementation |
| --- | --- | --- |
| CSS | Hero expansion interpolated `grid-template-rows`; controls interpolated background/border/color; primary buttons interpolated shadows. | Layout switches once; the panels fade/translate. Hover shadows fade through a static pseudo-element. Authored transitions use transform/opacity. Static header glass is isolated with backface visibility. |
| React | Pricing billing state lived in `Landing`, recreating the hero, shader and showcase JSX on each selection. | `NotificationPricingCard` owns billing state, price and purchase action. Hero product/billing state was already local; its static heading now uses `useMemo`. |
| Navigation | Checkout creation and payment completion used `window.location.assign`. | Both use `router.push`. Internal Links explicitly enable full prefetch. Animation setup runs in `useEffect` after paint. |
| Ambient work | Support video respected visibility/reduced motion but ignored scroll activity and device effects policy. | It shares scroll/effects subscriptions, avoids loading video in low mode, and shows a static poster. Video and electric-logo drawing also yield during package changes and route loading/entry. |

Responsive verification also found that the decorative compact countdown chip intercepted clicks on the bundle radio at mobile width. It now uses `pointer-events:none`; a real-click regression covers all three products at 1440px and 390px.

## Pricing card before and after

Previously, `Landing.tsx` owned the billing state alongside the entire hero, showcase, feature grid and guides:

```tsx
const [selectedNotificationPlan, setSelectedNotificationPlan] =
  useState<NotificationBillingPlan>('yearly');
const selectedNotificationCode = notificationPlanCodes[selectedNotificationPlan];

return <div className="landing">
  <section className="hero"><HeroAmbientLogo/><HeroPurchaseCard/></section>
  <Showcase/>
  <section id="pricing">
    <BillingSegmentedControl id="pricing-notification"
      value={selectedNotificationPlan} onChange={setSelectedNotificationPlan}/>
    <NotificationPriceDisplay id="pricing-notification-price" context="pricing"
      billingPlan={selectedNotificationPlan}/>
    <BuyButton plan={selectedNotificationCode}>{notificationCta}</BuyButton>
  </section>
</div>;
```

Now `Landing` renders `<NotificationPricingCard/>`. The new card's actual state and action wiring are:

```tsx
const { t, locale } = useLocale();
const [billingPlan, setBillingPlan] = useState<NotificationBillingPlan>('yearly');
const cta = purchaseText(locale, billingPlan === 'yearly' ? 'yearlyCta' : 'semesterCta');

// Inside the localized article and existing feature list:
<BillingSegmentedControl id="pricing-notification"
  value={billingPlan} onChange={setBillingPlan}/>
<NotificationPriceDisplay id="pricing-notification-price" context="pricing"
  billingPlan={billingPlan}/>
<BuyButton plan={notificationPlanCodes[billingPlan]}>{cta}</BuyButton>
```

The complete component is in `components/NotificationPricingCard.tsx`. Product codes, prices, default yearly selection, keyboard controls and localized copy are preserved. The development regression compares the committed props identities of `HeroPurchaseCard`, `HeroAmbientLogo` and `Showcase`: a pricing change previously replaced all three and now preserves them.

## Hero before and after

The existing `HeroPurchaseCard` already isolated product selection from `Landing`. Its header still created new JSX on every product/billing update:

```tsx
<div className="checkout-product">
  <Image src="/files/logo.png" alt="Auto-Check" width="64" height="64"
    sizes="64px" quality={100} loading="eager"/>
  <div><p className="eyebrow">AUTO-CHECK</p>
    <h2>{t('让签到简单一点。', 'A simpler class routine.')}</h2></div>
</div>
```

`HeroPurchaseCard.tsx` now caches the entire heading/subtitle JSX with `useMemo`, directly before its offer-expiry effect. The returned card inserts `{heading}` above the stateful radio group:

```tsx
const heading = useMemo(() => <>
  <div className="window-label"><span>YOUR NEXT SEMESTER, SORTED.</span>
    <span className="window-dots" aria-hidden>● ● ●</span></div>
  <div className="checkout-product">
    <Image src="/files/logo.png" alt="Auto-Check" width="64" height="64"
      sizes="64px" quality={100} loading="eager"/>
    <div><p className="eyebrow">AUTO-CHECK</p>
      <h2>{t('让签到简单一点。', 'A simpler class routine.')}</h2></div>
  </div>
  <p className="checkout-subtitle">{t('选择你需要的服务。', 'Choose the service you need.')}</p>
</>, [t]);
```

The dependency keeps language switching correct. No memoization is needed for a two-option price lookup. Keeping state local prevents parent renders directly; adding `React.memo` to every descendant would add unnecessary complexity.

## Expansion and layer hints

Before:

```css
transition: grid-template-rows .22s ease-out,
  opacity .22s ease-out, transform .22s ease-out;
```

After, for `.mini-bundle-promo-expand` and `.mini-notification-details-expand` in `app/globals.css`:

```css
transition: opacity .22s ease-out, transform .22s ease-out;
```

Closed/open grid rows still switch between `0fr`/`1fr` immediately. This performs layout once, then animates the fade/translation; it does not stretch text. `max-height` and grid-row interpolation would still perform layout each frame. Collapsed billing controls retain `inert`, `aria-hidden`, and keyboard behavior.

Existing `will-change` placements are retained: `useLandingMotion.ts` promotes hero lines, setup cards and feature cards when their tweens start and clears the hints at completion; `Showcase.tsx` does the same for its entrance; `.magic-bento-card[data-hovered="true"]` and active pointer layers receive hints only while active. There is no permanent `will-change-transform` on the entire hero/page. CSS fades can be promoted automatically by the browser. For glass, the header has `isolation:isolate; backface-visibility:hidden`; low-effects mode removes blur. Layer hints cannot make a large backdrop blur free.

## Navigation and background lifecycle

`BuyButton` now calls `beginAmbientNavigation(); router.push(data.url)` only after successful order creation. `Checkout` applies the same pattern after payment/cancellation succeeds. Private checkout URLs cannot be prefetched before an order exists; ordinary route Links now specify `prefetch={true}`. Prefetch is verified against actual successful `Next-Router-Prefetch` responses in production.

`PerformanceRuntime` records internal route-link clicks and selection input without React state. `lib/ambientActivity.ts` holds decorative work for 250ms after selection and during navigation, then allows 400ms for page entry after pathname commitment. A 5s fallback releases cancelled/failed navigation. Canvas subscriptions stop immediately while busy, preserving the existing 30fps/450,000-pixel shader budget and worker-based shape preprocessing. The support video remains paused while hidden, offscreen, scrolling or in low-effects mode. Every added subscription/listener has cleanup.

Changing `useLayoutEffect` to `useEffect` moves animation setup after paint; it does not eliminate the work. Shader initialization and other startup tasks still need to be considered in device measurements.

## Verification and reproducibility

Run `npm test`, `npm run typecheck`, and `npm run build`. Run the interaction regressions with `npx playwright test tests/e2e/package-performance.spec.ts` and production measurements with `npm run test:performance-audit`.

The production audit includes real route prefetching, media lifecycle, keyboard selection, header reuse, and frame sampling for scrolling, package selection, pricing billing, Bento and support hover at normal and 4x CPU. Development-only fiber-name assertions and local checkout mutations are intentionally skipped in production; production keeps its existing commerce lock. Metrics are written to `.local/perf/after-1x.json` and `after-4x.json`. Sampling uses browser requestAnimationFrame intervals, not presented-frame GPU tracing. Click stress sends selection changes every 50ms.

Passing correctness tests does not assert universal 60fps. Use `PERF_ENFORCE=true` when invoking the audit to require its existing strict frame thresholds; frame-budget failures must be read alongside startup tasks, viewport, CPU throttling and active effects mode.

## Decisions and scope

- Work remains on `codex/optimize-performance` in the existing checkout. Concurrent page-transition and order-layout changes are preserved and not authored by this task.
- Panel height switches immediately so that transitions use only transform/opacity; the visual tradeoff is a height snap at the start of the fade.
- Support-form submission and admin external/new-tab navigation retain their existing behavior; this change optimizes checkout and internal route links.
- Backend commerce/security and receipt internals remain outside this audit beyond navigation and hover CSS.

## Measured results

Production Chrome 154, 1440×900, hardware concurrency 20, device memory 16GB, normal effects. Frame samples are from the final production audit after the shared ambient gate was added; they are not a controlled before/after benchmark against the original deployment.

| Interaction | Normal CPU p95 frame interval | 4x CPU p95 frame interval | 4x frames over 20ms | Interaction long tasks |
| --- | ---: | ---: | ---: | ---: |
| Hero package selection | 6.2ms | 12.2ms | 0.491% | 0 |
| Pricing billing selection | 6.2ms | 12.2ms | 1.028% | 0 |
| Scroll down | 6.2ms | 6.2ms | 0.079% | 0 |
| Scroll up | 6.2ms | 6.2ms | 0% | 0 |
| Bento pointer effects | 6.2ms | 18.2ms | 0.637% | 0 |
| Support orb pointer | 6.2ms | 6.2ms | 0.205% | 0 |

Startup still recorded one 104ms task on normal CPU; the 4x run recorded 567ms, 131ms, 65ms and 83ms tasks. These measurements support smoother package interaction but do not prove strict 60fps: throttled outliers and Bento pointer motion remain, and rAF sampling does not measure every presented GPU frame. No comparison to the live Vercel deployment was performed.

Build, TypeScript and all 13 unit tests passed. The production audit passed nine cases, with two deliberate skips (the development-only fiber-name probe and production-locked checkout mutations). After the countdown-badge fix, the focused development suite passed nine cases, with its production-only prefetch check skipped. Existing electric rendering and Bento pause/cleanup regressions also passed. Desktop/mobile screenshots were inspected; the purchase action fits the card and neither viewport has horizontal overflow.

Concurrent receipt-download restyling added a new background hover transition after this audit's CSS rewrite. That separate change is preserved; the transform/opacity claim applies to styles authored by this audit, not every concurrently edited file.

## Broader browser suite limitations

The complete existing development suite ran: **26 passed, 17 failed, 1 skipped**. Its failures include assumptions about a Chinese default locale, the old Soton brand, and a removed ambient toggle. Other failures include receipt layout/detail expectations. These assertions were not rewritten as part of this audit, and the suite is not claimed green. With concurrent edits present, every failure is listed rather than attributed to this change or dismissed as pre-existing without a controlled baseline run.

Failed cases:

- `adaptive.spec.ts`: static effects on hardware; static effects on touch; sustained slow frames trigger runtime low mode.
- `admit-one-receipt.spec.ts`: paid receipt exposes the order ticket and a View Your Ticket action.
- `layout-overflow.spec.ts`: hero purchase card keeps CTA and ambient toggle in a padded flow footer.
- `motion.spec.ts`: headline masks/native wheel/feature reveals/anchor navigation; reduced motion/native input/live preference changes.
- `performance.spec.ts`: wheel and trackpad-sized deltas stay native and anchors yield to input; anchor clock excludes idle time and refreshes the scroll limit after height changes.
- `website.spec.ts`: dark bento showcase/language/guide/page links; mobile bento content/overflow; bento hover cleanup; complete extension checkout/ticket/admin/resend/refund; paid receipt/delivery viewports; mobile notification DEMO/cancellation; hero bundle/optional notifications/keyboard access; long ticket subjects/cancelled-order support.

The frame harness originally required reaching the exact bottom in a fixed eight-second interval. Under 4x CPU, Playwright sent fewer wheel events, causing a correctness failure before it could collect package metrics. It now verifies travel direction over at least half the page and positions the next phase outside its measurement window. The tradeoff is that an unusually slow but functioning scroll can pass that correctness check; frame measurements still expose its timing cost.
