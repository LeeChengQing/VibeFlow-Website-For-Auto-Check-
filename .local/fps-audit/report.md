# Hardware evidence gate — 2026-11-05

Decision: STOP speculative FPS optimization. Hardware performance UNVERIFIED. adb was unavailable on PATH and absent from the two checked common locations (user Android SDK platform-tools and C:/platform-tools). No accessible physical Android connection was established; this does not prove that no USB phone exists. No further emulation/A-B benchmark was run. No production code changes. No confirmed real-device defect and no fix proposal.

Existing SVG/GSAP cleanup and the last 15 passing regression scenarios remain unchanged; they were not rerun in this documentation/measurement-output update. Previous typecheck/build PASS remains historical evidence, not a new run.

## Cold/warm reliability

Earlier runs used fresh browser contexts but did not control browser-process, disk, font, GPU/shader or OS caches. They must be labeled UNCLASSIFIED start state, not automatically called cold or warm. The existing stability collector now explicitly labels this limitation and reports initialization statistics separately. It was not run again; no new measurements are claimed.

For physical tests keep two distinct datasets for each available display mode, never pooled:
- Cold-load: close/reopen Chrome and clear the tested origin's cache/site data before a trial; document precisely what was cleared. This is a defined browser cold-load, not proof of a cold GPU/OS cache. Record initial load and initialization separately.
- Warm-load: first complete an unmeasured visit, then keep the same browser/tab/profile/cache; remove only sessionStorage['vf-intro'] before a normal reload to exercise Intro again. This deliberate reset is for testing only. Separately verify that normal reload WITHOUT removal does not replay Intro.
- Run at least five cold-load and five warm-load trials at each supported 60/120Hz mode. Keep production version, URL, connection, viewport orientation, battery mode and temperature comparable; record trial order. Do not discard first-run results or merge initialization into animation tails.

Use unchanged windows: initialization before first fractional ring offset; active Intro from first observed drawing through intro:done; reveal-only from intro:reveal to intro:done; idle separately. Preserve stage-boundary and raw frames. The existing collector's initialization excludes the single boundary-crossing frame; retain that separately. Report both raw animation and resource-overlap-tagged views, never selectively remove unexplained spikes. Initialization includes deliberate intro delays as well as browser startup work, so it is not solely CPU loading cost.

## Minimal physical-device procedure

1. Record phone model, Android/Chrome versions, production revision, battery/thermal state and power-saving settings. In Android display settings select each available 60Hz and 120Hz mode. Verify the on-device refresh-rate indicator if supported; record actual adaptive changes. A setting or screen resolution alone is not evidence of delivered 120Hz.
2. Enable Developer options and USB debugging. Connect by USB, accept the authorization prompt. Open desktop Chrome chrome://inspect/#devices, enable Discover USB devices and Inspect the actual PHONE tab. Use port forwarding for a local production server if required. See [Chrome's official instructions](https://developer.chrome.com/docs/devtools/remote-debugging).
3. Install the existing stability-probe.cjs collector before application execution via CDP Page.addScriptToEvaluateOnNewDocument or a temporary local document override. Use the actual device tab, not a new emulated viewport/context. Enable no CPU/network throttle or FPS cap. Keep the phone foreground, awake and unlocked. Export frameAudit, Resource Timing and trial metadata after frameAudit.complete. Export long tasks and visibility transitions as well as intervals. Remove instrumentation/overrides when testing ends.
4. Timing pass: disable DevTools screencasting and recording. Use the smallest collector; remote inspection and collector code still have overhead. Save median, p95, p99, tail-mean 1% low, literal >8.33ms and >16.67ms counts/denominators, maximum interval, long tasks and timestamps. Use the SAME formulas/windows for all modes and start classes. Record per-run results; do not compare a pooled quantile against median-of-run statistics.
5. Jitter: retain raw timestamps and precision; 8.34ms alone is not proof of a dropped 120Hz display frame because 1000/120=8.333...ms and timer quantization/scheduling jitter exists. Report literal thresholds as requested AND inspect cadence, sustained runs and roughly doubled/tripled intervals. Do not derive presented-frame drops from those counts. Visibility changes invalidate a timing trial; adaptive refresh or coarse cadence changes must be logged, not silently classified as animation defects.
6. Diagnostic pass only if stutter repeats: capture a separate Chrome Performance trace with exact event/stage timestamps, Frames/Main/rendering/raster activity. Compare tracing-on versus tracing-off trials rather than mixing them. Record video separately at the highest ACTUALLY supported capture FPS; keep file metadata. A 60FPS recording cannot establish 120FPS smoothness. Prefer an external high-speed camera if screen recording changes load. Check circle direction, delayed tick, circular reveal, flashes, stutter and layout before/during/after reveal. Exercise Skip in circle/tick/reveal, reduced motion and session behavior.

## Required results and decision

Physical measurements: NOT AVAILABLE. Display settings/60Hz/120Hz delivered cadence, raw phone rAF distributions, long tasks, visible flickering and recording results: UNVERIFIED. No hardware performance PASS or animation optimization COMPLETE claim is supported.

If repeatable real-device defects occur, attach device/mode/start-class/trial timestamps, uninstrumented visual evidence and separate traces; identify a rendering operation before proposing the smallest fix. If the complete physical test set is smooth and functional, mark optimization COMPLETE for the tested devices/modes only. With no accessible phone, stop here. Final hardware assessment: UNVERIFIED; no additional optimization proposed.

---

# Historical emulation evidence — not physical-device validation

# Reveal controlled A/B investigation

Conclusion: INCONCLUSIVE for the cause of sporadic reveal frame-time spikes. Dynamic radial masking has measurable rendering cost, but removing it did not establish a reproducible frame-pacing improvement over the current baseline. No runtime optimization or source change was made this follow-up.

## Design

Same production build throughout; desktop headless installed Chrome, mobile emulation, DPR3, height844. Widths360/390/430. Each variant has FIVE runs at EACH width (75 sequential independent fresh contexts). For each width, run0 order A B C D E, run1 B C D E A, etc., balancing positions. Widths tested sequentially, not randomized; the first full-browser A trial is cold and can still differ from later trials. No CPU/network throttling, artificial frame caps, screenshots, trace capture or parallel benchmark during those 75 runs. Default production storefront includes the backend-unavailable notice; results are not physical-device measurements.

Variants are injected ONLY into isolated browser contexts by the local harness, never into SiteIntro.tsx or intro.css:
- A current implementation.
- B suppress setProperty('--r',...) after intro:reveal; the initial radial state remains frozen. No animated circular reveal is visible, making this an ablation, not an acceptable production replacement. About200 radial writes are suppressed per run. The common setter wrapper exists in all variants.
- C force #main transform:none and scale:none. Inspection confirms there is NO #main scale tween in current SiteIntro; C is intentionally a negative/no-op control.
- D hide .si-grid; its masked grid stops rendering, but other reveal operations remain.
- E freeze .si-grid opacity at1, .si-veil opacity at0, .si-content opacity at1, using CSS overrides. Other opacity tweens still execute JS but their rendered fades are suppressed. This tests removal of rendered fades, not removal of all tween bookkeeping; it deliberately changes appearance.

A single production build is used for all variants. Temporary overrides disappear on browser-context close. No experiment flag, override or loop was added to application code. The replay harness is retained under .local/fps-audit/reveal-ab.cjs and runs only when explicitly launched.

## Fixed reveal window and metrics

Window is intro:reveal to intro:done (normally timeline2.4–3.6s); only native-rAF intervals entirely inside the same event-bounded window are selected. Intervals crossing window edges are excluded identically in every variant. No slow intervals are otherwise filtered. No resource request spans overlap selected intervals in any of75 runs; no hidden samples or background visibility transitions. Durations and raw timestamps are saved. Thresholds refer to callback intervals, not presented frames or CPU execution time.

Same nearest-rank formulas as the methodology audit: Q(p)=sorted[ceil(n*p)-1]; 1% low=1000/mean(slowest ceil(.01*n) intervals). Each reveal contains roughly200 intervals, so its 1% low depends on only2–3 observations and is noisy. Summary median/p95/p99/1%low columns below are MEDIANS of per-run statistics over15 runs; threshold counts are SUMS with denominator, maximum is worst observed. Do not interpret these as pooled quantiles or reciprocal metrics.

| Variant | Median ms | p95 ms | p99 ms | 1% low FPS | >8.33ms / samples | >16.67ms | Max ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | 6.10 | 6.20 | 6.30 | 158.73 | 5 / 2948 | 1 | 30.30 |
| B | 6.10 | 6.20 | 6.20 | 158.73 | 0 / 2954 | 0 | 6.90 |
| C | 6.10 | 6.20 | 6.30 | 158.73 | 0 / 2956 | 0 | 7.30 |
| D | 6.10 | 6.20 | 6.30 | 155.04 | 1 / 2954 | 0 | 12.00 |
| E | 6.10 | 6.20 | 6.30 | 158.73 | 23 / 2931 | 1 | 18.70 |

### Width-specific five-run results

| Variant | Width | Median p95 ms | Median p99 ms | Median 1%low FPS | Sum >8.33ms | Worst ms |
|---|---:|---:|---:|---:|---:|---:|
| A | 360 | 6.20 | 6.30 | 158.73 | 5 | 30.30 |
| A | 390 | 6.20 | 6.30 | 158.73 | 0 | 7.20 |
| A | 430 | 6.10 | 6.30 | 158.73 | 0 | 6.80 |
| B | 360 | 6.20 | 6.30 | 158.73 | 0 | 6.60 |
| B | 390 | 6.10 | 6.20 | 157.48 | 0 | 6.70 |
| B | 430 | 6.20 | 6.20 | 158.73 | 0 | 6.90 |
| C | 360 | 6.20 | 6.30 | 155.04 | 0 | 7.30 |
| C | 390 | 6.20 | 6.20 | 161.29 | 0 | 6.50 |
| C | 430 | 6.20 | 6.30 | 157.48 | 0 | 6.80 |
| D | 360 | 6.20 | 6.30 | 152.67 | 1 | 12.00 |
| D | 390 | 6.20 | 6.20 | 156.25 | 0 | 6.70 |
| D | 430 | 6.20 | 6.60 | 151.52 | 0 | 6.80 |
| E | 360 | 6.20 | 6.30 | 153.85 | 2 | 12.10 |
| E | 390 | 6.20 | 6.20 | 160.00 | 0 | 7.00 |
| E | 430 | 6.20 | 6.30 | 158.73 | 21 | 18.70 |

Baseline A violations all came from the FIRST 360px/run0 trial (5 >8.33ms, including one30.3ms). The other14 baseline trials had no >8.33ms interval. The no-op C control also had zero misses. B cannot therefore be credited with eliminating a repeatable bottleneck; subsequent baseline runs already behaved similarly. E had23 misses despite disabling rendered fades, which also does not establish a consistent opacity bottleneck. No statistically supported frame-pacing gain is claimed. Earlier24-miss measurements used a different session and longer active-intro window; they are not direct before/after numbers for this reveal-only experiment.

## Rendering diagnostics — separate from primary timings

One additional trace at430px per variant, sequential A–E, stored in ab-trace-A.json through ab-trace-E.json. These five diagnostic runs are NOT the five repeated primary runs and cannot establish rendering-cost variance. Phase event marks bound the reveal. Paint/style/RunTask use renderer main thread; RasterTask includes renderer raster worker threads. Durations of concurrent/nested events must not be summed as wall-clock elapsed time or compared as full GPU presentation latency.

| Variant | Paint total ms | Style update total ms | RasterTask total ms | Largest main-thread task ms |
|---|---:|---:|---:|---:|
| A | 49.59 | 69.20 | 92.25 | 3.92 |
| B | 0.99 | 15.85 | 86.78 | 3.45 |
| C | 44.65 | 64.96 | 94.65 | 3.18 |
| D | 34.76 | 47.76 | 58.82 | 3.06 |
| E | 48.57 | 75.29 | 145.39 | 4.08 |

B strongly reduces paint/style work in this diagnostic, confirming that radial updates generate rendering work. D reduces grid-related paint/raster work. These ablations remove visible content or motion and are not equivalent-appearance optimizations. Neither diagnostic proves that the original work caused the intermittent callback misses. GPU/compositor scheduling, process startup and host variance remain possible causes, not confirmed explanations. The zero-change C differences illustrate diagnostic variability.

## Changes and verification

Modified this follow-up: local replay script and report only. SiteIntro.tsx, intro.css, SVG path data, autoRound:false, label timings, session behavior, GSAP context cleanup and shared scheduling remain unchanged. No baseline/optimized comparison exists because no runtime optimization was justified.

npm run typecheck and npm run build: PASS. Existing15 visual regression cases rerun on the unmodified baseline production build: normal, Skip in circle/checkmark/reveal, reduced-motion, at360/390/430, including event counts, detached-node GSAP style cleanup, listener cleanup and session reload checks. PASS. Experiment variants deliberately do not preserve appearance; they are never shipped and are not included in the baseline visual acceptance result.

Assessment: A/B execution PASS; baseline functional regression/build PASS; confirming the source of avoidable spikes INCONCLUSIVE; strict zero >8.33ms budget FAIL in observed baseline (5 intervals); real Android120Hz and physical presentation performance UNVERIFIED. Preserve existing circular reveal. No claim of guaranteed/global120 FPS.

---

# Earlier methodology and historical results

# Current benchmark methodology audit — authoritative results

Status: methodology arithmetic PASS; production typecheck/build PASS; true display-presented frame pacing and physical Android 120Hz UNVERIFIED. No runtime source changes in this audit. The existing 15 regression cases remain the last recorded browser regression result; they were not rerun because only the benchmark/report changed.

Modified: `.local/stability-probe.cjs` and this report. Located and audited `.local/fps-probe.cjs`, `.local/intro-probe.cjs`, `.local/stability-probe.cjs`; the first two remain historical probes, not comparable alternatives. `.local/stability-visual.cjs` is a visual/regression probe, not a performance benchmark. Historical raw files remain intact.

## Formula audit

The apparent contradiction is mathematically valid. In legacy `stability-after.json`, width 430/run 1 has 602 intervals. Its slowest seven are 6.8, 12.0, 12.2, 18.1, 18.3, 18.3, 91.1 ms. Their mean is 25.257ms, so 1% low is 1000/25.257 = 39.59 FPS. p99 is the tail boundary (6.8ms in that run), not the tail mean. The median p99 across three runs was 6.6ms; reporting medians of separate metrics further hides individual-run pairing. Neither 1% low nor p99 is reciprocal to the other.

For the corrected script, sort the SAME selected positive native-rAF intervals ascending, a[0..n-1]:
- Quantile Q(p) = a[ceil(p*n)-1], nearest-rank convention; median Q(.5), p95 Q(.95), p99 Q(.99). The old floor(p*n) index selected one position too high when p*n was an integer.
- k = ceil(.01*n); 1% low FPS = 1000 / arithmetic mean(a[n-k..n-1]). This is explicitly a tail-mean definition, not 1000/p99.
- >8.33ms and >16.67ms are literal strict counts, with counts AND denominators reported. Values are rounded only for display.
- Longest frame interval = max(a). These are rAF callback timestamp intervals, not CPU frame execution time, compositor presentation intervals, or captured video frames.
- Removed inferred dropped-frame counts from the new methodology. An 8.33ms threshold is a comparison budget, not evidence that this desktop browser is driving a 120Hz phone display.

Independent recomputation checked all nine runs' sample counts, quantiles, 1% lows, thresholds and maxima against raw samples.

## Measurement windows and exclusions

Environment: production `next start`, installed headless desktop Chrome, mobile emulation widths 360/390/430, height 844, DPR3, touch enabled. Same production code, three sequential fresh contexts per width. Default storefront with unavailable backend notice. No CPU/network throttle setting, synthetic clock, screenshot capture, or trace recording in the nine measurement runs.

The collector records native requestAnimationFrame timestamps. Initialization ends at the first observed fractional ring offset (0 < offset < 1), rather than `data-intro=playing`, which also covered fonts/hydration waiting. Intervals before that point are retained as initialization but excluded from animation metrics. The first partial interval is excluded; phase-transition intervals inside the animation are RETAINED as boundary samples. The completion-crossing interval is retained (it may include less than one rAF period after completion). The next 500ms is collected separately as idle and never merged into animation statistics.

Stage labels are observed from existing inline stroke offsets and intro events: circle, gap, checkmark, hold, reveal. No computed-style/layout reads; labels are accurate to callback sampling, not exact GSAP internal timestamps. All startup, boundary and idle data remain in `data.frames` for inspection. Any entirely unobserved stage due to a very long stall cannot be reconstructed perfectly from this probe.

Two views are saved: raw active animation and resource-overlap-excluded animation (`quiet`). Quiet excludes intervals overlapping Resource Timing request/response spans; all excluded intervals and raw statistics are retained. This removes concurrent loading intervals, not CPU work that happens after a response. A fully isolated animation microbenchmark would require a different harness and is NOT claimed here. Long tasks (>50ms) are recorded and correlated but are NOT silently removed. Arbitrarily discarding slow frames would invalidate the audit.

Visibility changes and hidden frame samples invalidate a run. None of nine runs was hidden or had a visibility transition. Idle cadence is recorded separately to expose coarse cadence changes. This detects background visibility, not every OS/GPU power or thermal throttle. Browser cadence near 6.1ms is not a verified physical refresh rate.

## Corrected results (not a runtime before/after comparison)

Table pools the three compatible quiet-window runs at each width. It does NOT take medians of separately computed metrics. Resource overlap exclusions total 17 intervals; none of the excluded intervals exceeded 8.33ms in this run. All primary raw results also remain available. No comparison with the older six-second, startup-inclusive or autoRound-era windows is valid.

| Width | n | Median ms | p95 ms | p99 ms | 1% low FPS | >8.33ms | >16.67ms | Longest ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 360 | 1618 | 6.10 | 6.20 | 6.80 | 105.26 | 7 (0.43%) | 1 (0.06%) | 18.10 |
| 390 | 1626 | 6.10 | 6.20 | 6.20 | 148.99 | 1 (0.06%) | 0 | 12.00 |
| 430 | 1611 | 6.10 | 6.20 | 7.30 | 84.37 | 16 (0.99%) | 0 | 13.30 |

Raw distributions, per-run raw/quiet/idle metrics, stage metrics, visibility records, resource spans and long-task records: `methodology-results.json`. Higher tail values compared with some individual runs reflect pooling, not contradictory formulas. These results establish a new baseline; they do not demonstrate an optimization gain.

## Slow-frame and trace investigation

24 active intervals exceeded 8.33ms: 23 in reveal, 1 in hold. None in circle/checkmark or phase boundaries. The only >16.67ms interval was 18.1ms in reveal. The longest consecutive cluster was two intervals in a 360px reveal; the 430px second run had repeated isolated reveal misses. Several other runs had none, so a deterministic identical spike is not established. No slow active interval overlapped the recorded >50ms long tasks or active resource spans. Startup long tasks were retained outside the animation window.

A SEPARATE diagnostic run (`node .local/stability-probe.cjs --trace`) writes `methodology-trace.json` and `methodology-diagnostic.json`. It enables devtools.timeline, blink.user_timing and disabled-by-default-devtools.timeline. Timing marks align observed phases with trace events on the renderer main thread. Its metrics are excluded from the nine-run table: tracing itself changes overhead (diagnostic longest interval 24.3ms).

| Diagnostic stage | Paint total ms | Style/update total ms | Main-thread RunTask max ms |
|---|---:|---:|---:|
| Circle | 13.03 | 9.06 | 1.35 |
| Checkmark | 7.24 | 5.69 | 1.42 |
| Hold | 1.91 | 13.22 | 9.55 |
| Reveal | 48.55 | 72.16 | 3.78 |

Totals span different stage durations and are not normalized per frame. Across active phases: maximum Paint 0.808ms, maximum style update 0.884ms, four Layout events totaling 0.302ms. Nested trace categories must NOT be summed as independent elapsed costs. Main-thread Paint events do not capture all raster/GPU/compositor work. Reveal is a repeatedly observed cost concentration and slow-interval location; the trace does NOT prove radial masks alone cause the misses. No animation or global scheduling rewrite is justified by this evidence.

## Physical Android Chrome procedure — UNVERIFIED here

No physical device connection was available; adb was not on PATH. Record phone model, Android/Chrome versions, battery/power mode, temperature and display settings. Choose the phone's supported 120Hz/high-refresh mode and observe its refresh-rate overlay if available; adaptive panels can still change cadence. Do not force a browser FPS cap.

Enable Android USB debugging, connect directly by USB and accept authorization. Open desktop Chrome `chrome://inspect/#devices`, enable Discover USB devices, and Inspect the phone's actual Chrome tab. Disable DevTools screencasting during timing measurements because it lowers frame rate. These steps follow [Chrome's official remote-debugging guide](https://developer.chrome.com/docs/devtools/remote-debugging). Use its port-forwarding workflow for the local production URL if needed.

For matching rAF measurements, install the collector body from this script's `p.addInitScript` before app execution using CDP `Page.addScriptToEvaluateOnNewDocument` (or a temporary DevTools document Local Override), on the physical tab. Do not create an emulated context or apply a viewport override. Clear only `sessionStorage['vf-intro']` for a fresh trial, reload, keep the tab foreground/unlocked, wait for `frameAudit.complete`, and export `frameAudit` plus Resource Timing entries. Use the same stage windows and `stats()` formulas. Repeat three or more trials. Startup intervals must remain separate.

Record Chrome Performance in a separate run to inspect Main/Frames/rendering and mark phases. Record Intro separately at the highest capture FPS actually supported; record the file's real FPS metadata. Prefer an external high-speed camera when phone capture is limited to 60 FPS or alters performance. Do not infer 120Hz smoothness from a 60 FPS recording; inspect repeated/dropped captured frames with that limitation explicit.

## Final assessment

- PASS: formula audit and independent numerical recomputation; initialization/animation/idle separation; background-state logging; production typecheck and build.
- PASS (retained prior evidence): SVG sequence, cleanup and 15 browser regression cases. No animation, CSS, scheduler or payment source changed this audit.
- FAIL for an absolute zero-violation 8.33ms budget in this emulation: 24 of 4855 quiet animation intervals exceed it. This is not a statement about physical 120Hz display output.
- UNVERIFIED: guaranteed no frame-pacing regression, causal bottleneck attribution, physical display-synchronized 120 FPS, real Android recording and thermal behavior. No improvement claim.

---

# Historical archive — incompatible windows; do not compare with current results

# Production frame pacing comparison

Environment: local production next start, headless installed Chrome, 390x844 mobile emulation, DPR 3, touch enabled. Same machine and probe, three fresh browser contexts per version, 6 seconds per navigation. Intro enabled by overriding webdriver detection; no artificial refresh-rate flags or frame timers. Server uses default storefront config because production database is unavailable; checkout availability message is present in both versions.

Metrics use requestAnimationFrame timestamps (not presented GPU frames). First five intervals discarded. Average FPS = 1000 / mean interval. 1% low = 1000 / mean slowest ceil(1% * sample count) intervals. Table reports median of three runs.

| Metric | Before | After |
|---|---:|---:|
| Average FPS | 163.52 | 163.34 |
| 1% low FPS | 86.28 | 81.17 |
| p95 interval ms | 6.20 | 6.20 |
| Total recorded Paint duration ms | 45.01 | 55.26 |

No measured FPS improvement; low-tail result worsened slightly. Touch devices now retain effects unless reduced-motion, hardware hints or sustained runtime frame misses call for reduction. More enabled effects can increase paint work. This benchmark does not isolate each change's causal contribution.

Changes: animationScheduler removes explicit 120 FPS cap, retaining GSAP's existing native rAF-based shared ticker and cancellation logic. It does not add another scheduling loop or guarantee refresh-rate delivery. PerformanceRuntime uses fastest observed valid ticker interval (initial baseline 60Hz) to detect two sustained slow windows; it removes obsolete touch-policy listener and resumes owned connected paused animations during teardown. performancePolicy removes blanket touch-device downgrade while preserving reduced-motion and hardware protection.

SiteIntro unchanged: single context-owned timeline, asynchronous active guard, timer/listener cleanup and context.revert already present. No temporary will-change hints are introduced. Radial reveal retained: trace Paint totals do not justify a visual rewrite. Chrome devtools.timeline traces retained as before-0.json through after-2.json; paint totals parsed from complete Paint events. RunTask long-task count reported zero, but this trace category may not expose all task slices, so that is not proof of absence of long tasks.

Validation: npm run typecheck and npm run build passed. Intro reached done in all six production runs. No new React frame state or loops introduced.

Limitations: desktop headless mobile emulation is not physical mobile hardware. Its approximately 164Hz callback pacing is not a claim of a 164Hz screen. No actual 60/90/120Hz devices tested, no thermal/battery tests, no heap growth study, no frame-by-frame visual equivalence or layout-shift measurement in this benchmark. Offscreen effect ownership was not traced outside the requested files. Stable 120 FPS is not established.

# Intro correctness verification — current follow-up

Modified components/SiteIntro.tsx and this report. app/intro.css inspected and retained: logo starts at opacity 0, both paths have normalized dasharray/dashoffset 1, and no permanent will-change. Existing blur removal, radial masks, path geometry, gradients, scheduling and checkout logic retained.

Actual correctness defect: GSAP CSSPlugin auto-rounded the normalized stroke offset to integer pixels. Captured values were only 1px and 0px, producing a sudden stroke appearance even though the tween lasted 0.7 seconds. autoRound:false on the ring and tick tweens now produces continuous offsets (sample ring: .7933, .2207, .023, 0; tick remains 1 until ring completes).

Timing relative to normal timeline start:
- circleStart label: 0.30s; ring draws 1 -> 0 over .70s, finishing 1.00s.
- circleComplete label follows ring tween end; tick starts circleComplete+=0.05, at 1.05s, finishing at 1.40s (.35s duration).
- Skip still accelerates timeline 4x; reduced motion retains its separate fade branch.

Visual verification: production Chrome screenshots stroke-0.png through stroke-6.png captured in a separate controlled-clock run, excluded from final benchmark. Inspected partial upper arc, extended lower arc, and tick frames. SVG getPointAtLength samples: (776,475), (544.61,430.28), (419.19,630.01), (561.43,818.18), (790,756), confirming upper-right -> top -> left -> bottom -> lower-right counterclockwise direction. Sampled offsets never reversed and ring/tick drawing never overlapped. The original white intro background is intentional and retained. Sparse screenshots cannot prove absence of every possible flash on every device.

Normal, Skip and reduced-motion runs each emitted intro:prewarm, intro:reveal, intro:done exactly once and completed. Existing context.revert, active guard, timer and listener cleanup retained. No new timeline, state, package or will-change hints.

## Intro-specific production benchmark

Same installed headless Chrome, 390x844 mobile emulation, DPR3, touch enabled, default production storefront, three fresh contexts per version; final performance runs have no concurrent screenshot capture. Native rAF timestamps sampled during intro. Analysis begins at first observed ring offset below 1 and ends at intro completion; rounding in the old implementation means that criterion starts later before the fix, so this is not an exact equal-duration workload comparison. Approximately 6.1ms median callback interval is a headless desktop measurement, not a physical mobile display refresh claim.

| Metric | Before runs | After runs | Before median | After median |
|---|---|---|---:|---:|
| p95 ms | 6.30, 6.20, 6.20 | 6.30, 6.20, 6.20 | 6.20 | 6.20 |
| p99 ms | 6.60, 12.10, 12.10 | 12.20, 6.20, 6.30 | 12.10 | 6.30 |
| Estimated missed callback slots | 6, 16, 14 | 29, 4, 0 | 14 | 4 |

Estimated missed slots = sum(max(0, round(interval / median interval) - 1)); these are NOT GPU-presented dropped-frame counts. Raw data: intro-before-0.json through intro-after-2.json. No reversal or drawing overlap in all six runs; lifecycle events each fired once. p95 is unchanged; p99 medians improved in this small sample but the worst after run missed more slots. No reliable universal performance improvement or no-regression claim follows from these results.

npm run typecheck and npm run build passed after the final autoRound fix.

Remaining limitations: no real 120Hz mobile hardware available; stable 120 FPS unverified. No physical Safari test, exhaustive black/white-flash analysis, heap/leak endurance test or new layout-shift measurement. Visual and frame-interval checks establish the observed drawing correction, not all-device frame consistency.


# Final stability validation (current follow-up)

Reproducible defect: completing Intro removed its DOM but left GSAP inline transforms, opacity and dash offsets on the retained detached nodes. The mounted component's effect-owned context was only reverted on later unmount. Minimal fix in components/SiteIntro.tsx: finish() now calls context.revert() and releases tl instead of only killing tl. This reverts captured styles and clears tracked context animations. It runs after html[data-intro] becomes done, so restoring initial styles cannot display the white overlay again. This is a verified cleanup omission, not proof of unbounded heap growth. app/intro.css remains unchanged.

Production typecheck and build: PASS, before and after the final one-line fix.

Browser regression: PASS, 15 cases: widths 360,390,430 x normal, Skip during circle, Skip during checkmark, Skip during reveal, reduced motion. In every case: Intro element removed, retained child nodes have no nonempty inline styles, tracked Intro pointerdown/keydown listener count returns to zero, three lifecycle events emitted exactly once, no pageerror, and reload in the same context does not replay Intro. No duplicate lifecycle execution was observed. This does not substitute for a heap/endurance audit of all GSAP internals.

Visual: initial white background is original intentional design, not an unexpected flash. Inspected initial, partial arc, reveal-mask and final screenshots. A 390px near-completion capture and post-completion capture both show the homepage with no visible geometry jump or blank black/white frame; small opacity/raster differences are expected while the veil finishes. No reproducible visible defect was found in these sampled frames. Screenshots are discrete controlled-clock samples, not exhaustive high-FPS video; a universal no-flash guarantee remains UNVERIFIED. Existing mask, SVG, labels, autoRound:false, rAF scheduling and payment logic unchanged.

## Repeated production frame measurements

Same desktop headless installed Chrome, mobile emulation, 844px height, DPR3, touch enabled. Default production storefront (database unavailable, checkout-unavailable notice present). Three fresh contexts per width per version, no simultaneous screenshot runs. Capture every native rAF interval while data-intro=playing, including initial load/hydration waiting. No controlled clock in these benchmark runs. Full raw distributions in stability-before.json and stability-after.json. This window differs from earlier report sections; do not directly compare these values with the earlier stroke-only window.

1% low FPS = 1000 / mean of slowest ceil(1% * interval count) intervals. p95/p99 are observed interval quantiles. Estimated missed slots = sum(max(0,round(interval / run median interval)-1)); not actual compositor-presented frame drops. Table values are medians of three runs.

| Width | p95 ms before → after | p99 ms before → after | 1% low FPS before → after | Estimated missed slots before → after |
|---|---|---|---|---|
| 360 | 6.20 → 6.30 | 12.20 → 12.10 | 31.76 → 34.11 | 49 → 25 |
| 390 | 6.20 → 6.30 | 12.20 → 6.70 | 26.75 → 37.08 | 41 → 24 |
| 430 | 12.10 → 6.30 | 12.20 → 6.60 | 26.76 → 39.64 | 57 → 22 |

High startup outliers lower 1% low substantially; run variance is large. p95 has small regressions at 360/390 and improves at 430. Tail medians improve in this sample, but the cleanup patch is not established as the cause. No statistically supported global performance improvement or strict no-regression conclusion.

Real Android Chrome 120Hz: UNVERIFIED. adb was not available on PATH, and no physical Android device connection or refresh-rate setting was supplied/observed. No physical display configuration, actual phone rAF distribution, maximum-supported-FPS phone recording or dropped video-frame inspection was possible. Desktop callback pacing around 6.1ms is not evidence of 120Hz phone performance.

Final assessment: browser functional/cleanup regression PASS; sampled visual inspection PASS; typecheck/build PASS; strict frame-pacing no-regression UNVERIFIED; real-device stable 120 FPS UNVERIFIED. Overall full acceptance UNVERIFIED. Only source change this follow-up: SiteIntro.tsx completion cleanup. Verification report updated; scripts, raw samples and screenshots are local audit artifacts.
