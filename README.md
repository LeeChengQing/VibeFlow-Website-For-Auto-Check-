# Vibeflow_MY · Soton Auto-Check

A bilingual Next.js website based on the approved monochrome mockup. Includes responsive sales page, dark rounded Bento showcase and feature cards, two package cards, supplied illustrated guides with full-size viewer, FAQ, animated customer support orb, and working local checkout/support/admin flows.

## Run locally

Requires Node.js 24+ (uses native SQLite).

```powershell
npm install
Copy-Item .env.example .env.local
# Set LOCAL_ADMIN_PASSWORD to at least 12 characters in .env.local.
npm run dev
```

Open http://localhost:3000. The dev server binds to 127.0.0.1. Admin: http://localhost:3000/admin. The current local development password is `Vibeflow-Local-2026!`; replace it in `.env.local` if desired.

## Landing page animations

The existing Soton site uses GSAP 3.15.0 and Lenis 1.3.26 through npm. Wheel, trackpad, touch, and keyboard input scroll natively without additional library inertia. Lenis handles only 0.4-second anchor transitions; its virtual input listeners attach to an inert element. The GSAP ticker driving Lenis runs only during an anchor transition and stops on completion or user input. Masked headline lines (1.5s, `power4.out`) and ScrollTrigger card reveals (50px, 0.8s, 0.2s stagger) remain. All six product features remain, with viewport entries batched as rows come into view. The dark Bento showcase keeps its separate Framer Motion entrance.

Both product sections share `components/MagicBento.tsx`, adapted from React Bits with the notice in `licenses/react-bits.txt`. Desktop hover uses VibeFlow teal spotlight and border glow, 12 drifting particles, subtle tilt/magnetism, and a transient click ripple. Card content stays fully readable. Phone/touch and reduced-motion visits use static cards. Live preference changes and unmounting remove effects, listeners, particles, and transforms. Effects stay inside each grid and never add a body overlay. A shared passive activity signal suspends hover effects during scroll, then updates the last pointer once after 120ms of idle. GPU layer hints apply only during animation/hover and are removed when idle.

The ambient ElectricLogo removes its shared-ticker subscription when offscreen, hidden, or scrolling. It resumes after scrolling settles, at a maximum of 30 rendered frames per second with a 450,000-pixel framebuffer budget. Shape tracing runs in a worker; the WebGL module and optional bento engine load separately. Noninteractive artwork has no pointer listeners. No scroll coordinates enter React state; scroll activity stays outside React.

Reduced-motion preferences disable animated anchors and leave content visible, including when changed during a visit. Global CSS scrolling is `auto`; smooth scrolling is scoped to explicit anchor clicks. Navigation respects CSS scroll padding; the guide dialog uses `data-lenis-prevent` for native scrolling and locks the background with the stopped Lenis class. Unmounting removes the ticker, Lenis instance, listeners, observers, and GSAP animations/triggers.

`public/animation-demo.html` is the complete standalone HTML/CDN example, with Soton copy, a three-card grid, and inline JavaScript. Open http://localhost:3000/animation-demo.html or open the file directly; keep the sibling `files` directory for its logos. CDN access requires an internet connection. `?t=0`, `?t=1.95`, and `?t=3.9` freeze inspection frames; ordinary visits use ScrollTrigger for cards and the white showcase. The live Next.js page uses bundled libraries instead of CDN scripts.

The requested Locomotive Scroll skill was installed at `C:/Users/CQCQ/.codex/skills/locomotive-scroll/SKILL.md` and its accessibility, synchronization, and cleanup guidance applied. Lenis is the sole runtime scroll engine.

Browser tests run on port 3001 using a separate `.next-e2e` build directory and SQLite database, so localhost:3000 can remain open during verification.

## Production rendering audit

See [PERF_REPORT.md](PERF_REPORT.md) for the production baseline, category measurements, final comparison, and remaining startup costs. The landing page uses one application GSAP scheduler for Lenis anchors, optional WebGL draws, pointer work, activity deadlines, and the adaptive monitor. Framer Motion uses asynchronous LazyMotion/domAnimation. Bento particles use pooled native compositor animations; the support orb uses a correctly sized, pausable video instead of the original GIF.

Normal desktop mode retains the 16px navbar blur. Reduced motion, touch, low hardware (≤4 cores or ≤4GB), or two consecutive slow sampling windows enable static effects and remove blur. Guide/FAQ contents skip rendering offscreen while keeping their intrinsic height. The decorative GSAP clock has a 120Hz ceiling; native wheel input retains the browser's refresh cadence.

```powershell
npm run test:ui:prod
npm run test:perf
# Optional strict interaction thresholds (baseline collection leaves this unset):
$env:PERF_ENFORCE='true'
npm run test:perf
Remove-Item Env:PERF_ENFORCE
```

Both commands build and serve production on port 3002. The production UI configuration excludes simulated-commerce tests, including receipt tests, because `lib/security.ts` deliberately returns 403 for these APIs in production. Their development tests remain available via `test:e2e`; they are not production performance evidence. Measurement-only runs report metrics without asserting thresholds; strict runs assert all five interaction targets. Startup long tasks are reported separately.

## What you can test now

- Switch Chinese/English, choose a package, and open checkout. No email field appears on the landing page.
- Simulate successful or cancelled checkout. Server prices are RM24.99 one-time and RM11.99/sem, ignoring client-supplied price.
- View private order status and a clearly labeled delivery preview. Extension has no real ZIP attached; notification values start with DEMO and cannot activate service.
- Submit a support ticket, save its private link, and add messages. Linked orders require the matching checkout email. Pre-purchase questions can omit the reference.
- Sign in to admin, inspect/search orders and tickets, correct an email and refresh a delivery preview, simulate a refund, reply to a customer, or close a ticket.
- Enlarge all four illustrated tutorials; Escape closes the viewer. Add a future video with `NEXT_PUBLIC_TUTORIAL_VIDEO_URL`.

Local data persists in `.local/vibeflow.sqlite`, outside the public directory. Test browser data uses `.local/e2e.sqlite`. Token links are private capabilities; do not share them publicly.

## Verify

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome or Microsoft Edge. If neither exists, install Playwright Chromium with `npx playwright install chromium`.

## Cloud launch requirements

This is a local test application, not a live checkout service. The local APIs reject production mode and non-loopback hostnames, and require `LOCAL_DEMO=true`; use `npm run dev` for the complete local flow. The localhost server cannot be used as a public backend. No real payments or outgoing email are performed.

The earlier cloud plan remains separate work requiring actual accounts and assets:

1. Configure Supabase database, admin Auth, RLS, private ZIP bucket, and a real notification key pool. Replace the local SQLite service with a cloud implementation of the same commerce/support operations.
2. Create HitPay sandbox credentials and hosted payment requests from the fixed server catalog. Collect email on hosted checkout, verify signed server callbacks, check request/reference/currency/amount, and atomically fulfill each order once. A return-page redirect alone must never mark payment complete.
3. Authorize the Vibeflow Gmail sender using server-only OAuth credentials. Add retryable email delivery and logs. No Gmail connector sends are invoked by this application.
4. Upload the actual extension ZIP, import genuine keys, configure the semester expiry policy, and test real seven-day download expiry and refund revocation.
5. Verify sandbox payment, callback, private delivery, email correction/resend, support reply notification, and admin authorization before public deployment.

References: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [HitPay Payment APIs](https://hitpayapp.com/paymentapis), [Supabase security](https://supabase.com/docs/guides/security/product-security).
