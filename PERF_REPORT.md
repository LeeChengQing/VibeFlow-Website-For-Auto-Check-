# Production rendering audit

## Baseline and measurement

Measured 2026-10-03 using the unchanged application, `npm run build` followed by `npm run start`, Chrome 154.0.8037.97, headless, 1440×900 at DPR 1, GPU rasterization enabled. Each pass uses native mouse-wheel input at a fixed 50ms cadence: 8 seconds down to the footer, 8 seconds back to the top, then 3 seconds of pointer movement over MagicBento and 3 seconds over SupportOrb. Both directions are checked for full-page coverage. Separate default and CDP 4× CPU runs are saved in `.local/perf/before-{1,4}x.json`.

The rAF sampler reports browser frame delivery, including GPU/compositor stalls. 1% low = 1000 / the mean of the slowest ceil(1% × frame count) intervals. Script time/frame is the phase's CDP ScriptDuration delta divided by sampled frames; it is an **average**, not a per-frame maximum. Load long tasks are recorded separately from interaction phases. A high average FPS does not prove absence of stutter.

## Continuous-work inventory (baseline source lines)

- `components/useLandingMotion.ts:28–34`: GSAP ticker drives Lenis only during anchor navigation. Native wheel input remains unprevented. ScrollTrigger also processes native scroll and entrance animations. Refresh work runs on size/load/toggle changes, not each scroll.
- `components/ElectricLogo.jsx:641–734`: separate rAF loop wakes at display cadence, draws at ≤30fps when visible and idle; scroll and hidden-tab gates already stop it. Per draw it allocates placement objects and uniform arrays. `:549–561` traces the source image on the main thread at load.
- `components/MagicBento.tsx:87–106`: a separate pointer rAF reads grid plus six slot bounds, updates radial-gradient centers on all six cards, and retargets quickTo tweens. `:43–52` creates 12 nodes/tweens on each card enter, kills/removes them on leave; `:114–124` allocates an unbounded series of ripples. Only hovered cards run particle loops. Existing scroll/offscreen/hidden gates stop them.
- `lib/scrollActivity.ts:7–24`: shared passive scroll/wheel/touch events signal activity and an idle deadline using one timer; subscribers synchronously modify effects on activity transitions. No scroll position goes into React state.
- `components/Showcase.tsx:47`: Framer Motion runs a one-time opacity/y entrance. `HeroPurchaseCard.tsx:3,135–143`, `NotificationPriceDisplay.tsx:3,37–44`, `BillingSegmentedControl.tsx:4,60–64`: transient UI animation, including animated height and a small layoutId pill. No useScroll/useTransform, large layout animations, or scroll-driven React state exist.
- `components/useBundleCountdown.ts:19`: two independent 1-second clocks update hero/bundle text; they are business countdowns, not scroll animation. `TicketView.tsx:11`: 15-second support polling, only on a ticket route.
- `components/SupportOrb.tsx:4`, `app/globals.css:11`: fixed 94px orb continually decodes a 600×600, 50-frame GIF (1,444,869 bytes) and scales it 1.72×. Static reduced-motion fallback exists.
- `components/SiteHeader.tsx`, `app/globals.css:7`: sticky translucent header with 16px backdrop blur. No custom JS scroll handler. Mobile navigation extends beyond the header; paint containment on the whole header would clip it.
- `Landing.tsx`: only state for locale/product/dialog; static gradients/shadows, native lazy guide images (one 6.3MB). Root layout uses system fonts; there are **no downloaded fonts or font-loading reflows**.
- `public/animation-demo.html`: standalone page, its own anchor-only Lenis/GSAP ticker, not loaded by the landing page.

## Ranked bottlenecks

1. **MagicBento pointer paint/layout and allocation** — `MagicBento.tsx:87–104`, `MagicBento.css:4–5`. Six changing radial gradients plus bounding-box reads, particle churn, and retargeting idle card tweens. At 4× CPU: average 25.19fps, p95 78.7ms, 1% low 11.00fps, 21 interaction long tasks, average script 6.555ms/frame. Highest measured impact.
2. **Cold image tracing / shader startup** — `ElectricLogo.jsx:153–265,549–561,599–622`. Synchronous distance transform, coverage, blur and contour extraction, plus shader compilation. Baseline startup tasks reach 794ms normal / 1148ms at 4×. A subsequent production CPU profile attributes approximately 597ms at 4× to OGL `setShaders`; parallel shader completion and worker preparation improve startup, but do not eliminate driver/module initialization costs. These are outside the scroll measurement but affect initial responsiveness.
3. **Repeated full-page image raster/decode and fixed GIF** — `SupportOrb.tsx:4`, `Landing.tsx:84–85`. 1.44MB continuous 600px GIF and oversized guide/logo assets. First 4× downward pass p95 18.2ms, 3.326% >20ms, one 59ms long task; upward warm pass is much faster. Image decode/raster is a likely contributor.
4. **Multiple application frame queues / per-draw allocations** — `ElectricLogo.jsx:643,729,733`, `MagicBento.tsx:106`, `useLandingMotion.ts:28`. Existing scroll suspension helps, but independent queues and WebGL uniform allocation can cause collisions and GC when idle/hover resumes.
5. **Large composited blur/masks/shadows** — `globals.css:7,11,69`. Sticky backdrop blur and fixed shadow are plausible GPU costs, but not proven dominant by baseline script averages. Normal-mode blur removal requires the user's visual choice. Preserve the mobile menu and orb hint when containing paint.
6. **Eager animation bundles and absent adaptive gating** — top-level OGL/Framer imports; no touch/low-hardware/runtime FPS policy. Optimize only without delaying critical content or changing desktop appearance.

## Test boundary

`lib/security.ts:7` intentionally rejects local checkout/support/admin APIs when NODE_ENV is production. This audit does not relax that guard. Browser rendering and performance tests run against production. Store/security unit tests verify backend logic. Existing development-only simulated-commerce browser tests cannot truthfully be run successfully against the locked production API; they remain intact and are excluded from the production UI run.

## Category measurements and final comparison

Measured interaction targets: p95 ≤16.7ms; <1% intervals >20ms; slowest-1%-average ≥55fps; no tasks >50ms; average script/frame <4ms. The final strict run **passes all interaction targets in both CPU modes**. Both runs stay in **normal effects mode**, with 20 reported logical cores and 16GB browser-reported memory: improvements are not obtained by silently disabling desktop effects. Native wheel travel covers 0 to 6443px and back to zero.

| CPU | Phase | Average FPS | p95 ms | 1% low FPS | >20ms % | Long tasks | Avg script ms/frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1× | scroll down 8s | 154.087 → 164.516 | 6.8 → 6.2 | 31.878 → 124.666 | 0.483 → 0.076 | 0 → 0 | 0.192 → 0.083 |
| 1× | scroll up 8s | 160.169 → 165.014 | 6.7 → 6.2 | 82.592 → 153.005 | 0 → 0 | 0 → 0 | 0.123 → 0.058 |
| 1× | MagicBento pointer 3s | 131.675 → 162.686 | 12.2 → 6.2 | 16.077 → 65.876 | 1.013 → 0.205 | 0 → 0 | 0.503 → 0.104 |
| 1× | SupportOrb pointer 3s | 158.372 → 165.014 | 6.6 → 6.2 | 58.824 → 156.74 | 0.21 → 0 | 0 → 0 | 0.133 → 0.052 |
| 4× | scroll down 8s | 116.337 → 161.524 | 18.2 → 6.2 | 17.37 → 70.157 | 3.326 → 0.077 | 1 → 0 | 0.916 → 0.437 |
| 4× | scroll up 8s | 158.278 → 165.019 | 6.3 → 6.2 | 64.838 → 156.775 | 0 → 0 | 0 → 0 | 0.417 → 0.266 |
| 4× | MagicBento pointer 3s | 25.186 → 163.024 | 78.7 → 6.2 | 11.001 → 82.372 | 72.368 → 0 | 21 → 0 | 6.555 → 0.484 |
| 4× | SupportOrb pointer 3s | 150.735 → 164.36 | 12.1 → 6.2 | 45.746 → 101.42 | 0.22 → 0 | 0 → 0 | 0.515 → 0.313 |

Values are before → after. Raw records: `.local/perf/before-{1,4}x.json`, `.local/perf/after-{1,4}x.json`. Cold load is deliberately separate from scroll/hover:

| CPU | Before maximum startup task | After maximum startup task |
| --- | ---: | ---: |
| 1× | 794ms | 149ms |
| 4× | 1148ms | 720ms |

Each implementation category was built and measured before continuing. These sequential measurements include normal run-to-run variance; they do not isolate each change's marginal contribution. The 4× MagicBento phase makes the largest bottleneck easiest to compare:

| Build/category, in execution order | Hover p95 ms | 1% low FPS | >20ms % | Long tasks | Avg script ms/frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| A: shared clock | 66.7 | 6.592 | 68.675 | 23 | 6.315 |
| B: cached geometry/static gradient layers/pool | 18.4 | 18.265 | 4.702 | 1 | 1.845 |
| B: remove ripple invalidation (reverted) | 30.4 | 22.288 | 16.45 | 0 | 2.452 |
| C: worker shape preparation/reused uniforms | 30.3 | 20.59 | 15.51 | 0 | 2.297 |
| C: defer parallel shader queries | 30.4 | 17.422 | 24 | 1 | 3.144 |
| D: compositor particles/active layers/containment | 8.5 | 34.632 | 0.831 | 0 | 0.652 |
| E: sized video + Next Image | 12.2 | 48.45 | 0.461 | 0 | 0.564 |
| A: LazyMotion + transform-only UI | 12.2 | 81.699 | 0 | 0 | 0.559 |
| F: static/adaptive policy | 8.3 | 51.546 | 0.264 | 0 | 0.613 |
| B: dispatch activity only on shared ticker | 12 | 74.516 | 0 | 0 | 0.514 |
| D: offscreen content skipping | 6.2 | 74.738 | 0 | 0 | 0.524 |
| Lifecycle build: concurrent receipt benchmark detected | 24.4 | 15.723 | 17.895 | 0 | 1.574 |
| Lifecycle build: repeat after other benchmark exits | 18.1 | 26.403 | 1.262 | 0 | 0.928 |
| B: one vector tween per card (reverted) | 42.4 | 13.184 | 34.932 | 4 | 2.298 |
| A: decorative ticker capped at 120Hz | 12.2 | 51.44 | 0.229 | 0 | 0.573 |
| Final strict verification | 6.2 | 82.372 | 0 | 0 | 0.484 |

The ripple experiment removing tween invalidation regressed p95 from 18.4ms to 30.4ms and was reverted. A later single-vector card tween also regressed 4× hover p95 to 42.4ms and was reverted. The shared-clock category alone did not solve the dominant gradient/style work; it was retained for the required single ownership/cleanup model, then verified with the later fixes. Worker/shader changes address cold preparation; the hover numbers alone do not establish their benefit. A diagnostic trace after category B found 319 UpdateLayoutTree events totalling roughly 1102ms, versus only 6 Layout events (~13ms) and 26 Paint events (~35ms). Category D therefore moved stars to native compositor animations and scoped gradient layer hints, rather than reducing visible content or removing normal-mode blur.

A late production trace found 638 UpdateLayoutTree events (~1031ms), but only 5 Layout events (~9ms) and 38 Paint events (~20ms). FunctionCall time was ~395ms across that diagnostic interaction. Thus repeated style work remains material even when forced reflow and JS costs are low. The application GSAP clock is now capped at 120Hz, preserving native wheel/browser frame delivery while avoiding decorative style updates above the requested 120Hz target. Its category run improved 4× hover p95 from 18.1ms to 12.2ms and average script/frame from .928ms to .573ms. That category's 1% low was still 51.44fps, so the final verification above remains necessary.

The late contended run and the subsequent isolated repeat are both retained. During the contended run another chat's receipt-performance Playwright process was observed on this same host; it produced materially worse results. That is a measured environmental confound, not justification to hide the failed run. The isolated repeat also missed targets, leading to the additional 120Hz scheduling change rather than merely rerunning until a pass.

Earlier post-optimization runs had MagicBento 1% lows of 48–82fps. The final result above is the full final run, not a guarantee that every future invocation will pass. Keep raw runs and use the strict command to detect regressions; headless frame delivery on this host varies around 130–165fps. A physical 60/120Hz device is needed to measure displayed FPS and input-to-photon latency.

## Visual choices

User-approved choice: **keep the 16px navbar blur in normal mode; disable it only in low-effects mode.** System fonts remain unchanged: adding a different next/font would change typography and solve no current font-download issue. No new fonts or heavyweight dependencies were added.


## Per-file implementation summary

| File(s) | Change and purpose |
| --- | --- |
| `lib/animationScheduler.ts` | One GSAP-ticker-backed application queue, lagSmoothing(0), 120Hz decorative-clock ceiling, hidden-tab suspension, cancellable subscriptions and one-shot writes; newly registered jobs cannot run inside their registering event. Native wheel and browser refresh cadence remain independent. |
| `components/useLandingMotion.ts` | One Lenis instance; direct shared milliseconds; autoRaf/autoResize false; native wheel target, .2 lerp and .4s anchors; rebase idle clock; passive input interruption; no proxies; remove listeners/tickers/triggers. Restore reading position after the complete ScrollTrigger media refresh, rather than inside partially reverted cleanup. |
| `public/animation-demo.html` | Independent HTML/CDN demonstration now uses the same direct GSAP time ×1000 / lagSmoothing(0) policy; it is never loaded by the landing page. |
| `lib/scrollActivity.ts` | Passive input handlers record an activity deadline only. Subscriber notifications and idle completion run in the shared ticker; no timer or React scroll state. |
| `components/MagicBento.tsx`, `lib/bentoMotion.ts` | Keep card content server-rendered; import optional interaction engine only near viewport and when effects are permitted. Cache document-layout bounds in ResizeObserver; pointer input records coordinates, shared callback applies writes. Reuse quickTo tweens, 12 particle nodes/native animation handles and 2 ripple nodes/tweens per grid; one hovered card at a time. Suspend on scroll/offscreen/hidden/low mode, dispose all resources on unmount. |
| `components/MagicBento.css` | Replace changing gradient centers on cards with fixed radial-gradient child layers translated under the same rounded masks. Preserve teal proximity/border glow and dark capsule styling. |
| `components/ElectricLogo.jsx` | Shared ≤30fps rendering subscription; cache uniforms/placement/arc records and render options; cap DPR≤1 and framebuffer ≤450,000 pixels. Stop on scrolling/offscreen/hidden/low; release GPU resources and terminate preparation worker on cleanup. |
| `public/electric-shape.worker.js` | Same tracing/distance/glow algorithm moved to OffscreenCanvas worker; transfer prepared buffers back once. Unsupported worker preparation leaves the static logo fallback. This is preparation, **not** worker WebGL rendering. |
| `lib/DeferredProgram.js` | OGL 1.0.11-compatible deferred completion/introspection when KHR_parallel_shader_compile exists; preserve normal shader path otherwise. No frame-loop object allocation in application code; OGL may still allocate internally. |
| `components/HeroAmbientLogo.tsx` | Defer WebGL module with next/dynamic and preserve static brand mask while loading; IO removes the entire ambient mask layer from painting offscreen without changing geometry. |
| `components/SupportOrb.tsx`, `public/files/customer-assist.mp4`, `customer-assist-poster.png` | Convert original 600px/1,444,869-byte GIF to cropped 192px/445,233-byte video + 48,607-byte poster, preserving the visible grain/circle and hint. Remove CSS scale-up. Pause video on hidden/offscreen/static visits; do not attach video source in initial low mode. Original asset retained. |
| `components/MotionProvider.tsx`, `motionFeatures.ts`, `app/layout.tsx` | Async LazyMotion/domAnimation, m.* primitives, and root adaptive runtime. |
| `HeroPurchaseCard.tsx`, `BillingSegmentedControl.tsx`, `NotificationPriceDisplay.tsx`, `Showcase.tsx` | Small UI animations use m.*, opacity and transforms. Remove animated height and layoutId pill; use natural final height and a translated single pill. Preserve plan state, keyboard access and final styling. No useScroll/useTransform or scroll-state hooks existed to replace. |
| `components/Landing.tsx`, `SiteHeader.tsx`, `Showcase.tsx`, `HeroPurchaseCard.tsx`, `GuideViewer.tsx`, `Checkout.tsx`, `next.config.ts` | Next Image dimensions/sizes, lazy below-fold images and quality 100 for sharp supplied guide text; loaded dialog uses full readable resolution. Preserve system font stack and geometry. |
| `lib/performancePolicy.ts`, `components/PerformanceRuntime.tsx` | Imperative root data-perf policy for reduced motion/touch/≤4 cores/≤4GB; two consecutive 1s windows averaging >20ms trigger sticky runtime low mode. No React frame/scroll state. Hidden gaps reset samples; timeline/compositor animations pause. Policy lookups reuse the root mode rather than creating MediaQueryList objects every frame. |
| `app/globals.css` | Layout/paint containment on card surfaces, ambient and orb artwork; desktop-only header containment avoids clipping mobile menu, orb-link layout-only containment preserves outside hint. Active-only layer hints, low-mode blur removal, video sizing, height-only intrinsic placeholders for below-fold guide/FAQ content. |
| `tests/perf.spec.ts`, `playwright.perf.config.ts`, `package.json` | Production normal + 4× CDP benchmark, GPU raster flag, fixed wheel/pointer cadence, rAF/Long Task/CDP script metrics, full-page coverage and JSON artifacts. PERF_ENFORCE=true adds strict interaction assertions. |
| `tests/e2e/adaptive.spec.ts`, `performance.spec.ts`, `website.spec.ts`, `playwright.production.config.ts` | Production lifecycle/static/runtime degradation, media pause/recovery, particle pooling/bounds cache, native input/GL disposal and preference scroll-position regressions. GL tests observe real draw calls, not callback.toString names that break after minification. Idle ripple test uses a visible real pointer click so locator auto-scroll does not deliberately suspend the effect. |
| `README.md`, `docs/scroll-performance.md`, `PERF_REPORT.md` | Commands, behavior/limits, complete audit and raw measurement references. |

The user's simultaneous order/receipt work was preserved. OrderStatus, TicketConfirmationCard, receipt CSS/tests and utility changes from that work are not attributed to this audit.

## Verification and scope

- `npm run typecheck`: passed.
- `npm test`: **13/13 passed**, including production fail-closed security and transactional pricing/delivery behavior.
- `npm run build`: passed on the final source.
- Production UI suite: **18/18 passed** against next start. Includes mobile geometry/no horizontal overflow, dark showcase, both locales, readable guide loading/dialog scroll lock, headline/card reveals, native wheel displacement, anchor cancellation/resize, real GL cap/pause/disposal, particle reuse/ripple bounds, live motion recovery without a scroll jump, low-device policy and runtime slow-frame policy.
- Final production performance suite: see the comparison and its strict threshold result above; raw JSON is retained for both modes. The rAF sampler is measurement-only, separate from the site's scheduler. CDP script/frame is an average; maximum JS slice or physical input latency is not directly measured.
- Simulated checkout/support/admin/paid-receipt browser tests require development mode and are excluded from this production suite. They remain unchanged for that workflow. No production API protection was relaxed to make browser tests pass. The 18 production UI passes do **not** imply those commerce tests were run against production.
- Inspected desktop/mobile screenshots in `.local`; preserve dark rounded card layout, original hero/card sizing, VibeFlow brand, support hint and supplied tutorial art. Normal blur remains per the user's explicit selection.

## Remaining limits and recommendations

1. **First-load long tasks still exceed 50ms** (maximums listed above), although the measured scroll/hover phases have the results shown in the main table. Moving tracing into a worker and deferring shader-status queries does not move context creation, module evaluation or all driver work off the main thread. The fallback shader path can still block. Do a cold-load trace on the target GPU before a larger OffscreenCanvas rendering-worker refactor; that refactor was not silently introduced into this visual-preservation task.
2. Headless local results do not guarantee 60/120 displayed frames on every GPU, battery state, browser or monitor. Repeat strict runs on a physical target and profile compositor/raster stalls when a 1% low falls short. CPU throttle does not model a low-end GPU; adaptive static mode is additionally covered by separate functional tests.
3. Essential GSAP/ScrollTrigger/Lenis are kept eager for the first headline reveal and navigation. Optional OGL, bento engine and Motion features are deferred. No scroll coordinates enter React state. Browser-native compositor animations and Framer transient queues are not monkey-patched into GSAP; there is only one persistent **application-owned** frame clock. Business countdown/poll timers retain their purpose.
4. Fonts are already local system fonts; introducing next/font would change the design without addressing any downloaded-font reflow. Existing static shadows remain because the diagnostic trace identified style recalculation as dominant, not shadow paint. Small pre-existing button/border/color hover transitions and non-landing receipt animations are outside the continuous scroll/particle rewrite; they were not given a misleading compositor-only guarantee.
5. Paint containment was intentionally not applied to the entire mobile header or support link, where it would crop the menu/hint. Containment is on the desktop header and orb artwork instead. Intrinsic placeholders are height-only so mobile layout does not inherit a desktop-width minimum.

Implementation references: [GSAP ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker/), [Motion LazyMotion](https://motion.dev/docs/react-lazy-motion), [KHR parallel shader completion](https://developer.mozilla.org/en-US/docs/Web/API/KHR_parallel_shader_compile). The installed Next.js image/lazy-loading docs and local OGL/GSAP/Lenis source were checked for this project's versions.
