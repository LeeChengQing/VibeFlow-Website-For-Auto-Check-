# Admit-one receipt ticket and plan cleanup

## Status

Design approved; implementation-plan review pending. The ticket finish is glossy black/charcoal/graphite grey as confirmed by the user.

## User outcome

On a successful local checkout, customers see an order-specific, black glossy “Admit One” ticket attached to the receipt area. A prominent **View Your Ticket** action opens an enlarged, accessible view of that same ticket. The uploaded orange ticket is a visual reference for the perforated admission-ticket composition; its sample name, event, venue, and dates are not copied into the product.

The broader supplied brief also requests removing Degree Pass from sale, preserving old stored orders, translating notification periods, and fixing horizontal overflow. The existing bundle promotion and its countdown/prices remain as they are.

## Project findings and component decision

The project is Next.js 16, React 19, TypeScript, and Tailwind 4. It already has `components/ui`; it does not need `shadcn init`. The current receipt card is `components/ui/ticket-confirmation-card.tsx`. The pasted component is a large compiled bundle containing a copy of a shader engine and unrelated image/remix/audio helpers; both newly attached source files are identical. The repo does not currently contain the separately mentioned `docs/reference/admit-one-ticket.tsx`.

Use a small typed generic component in `components/ui/admit-one-ticket.tsx` and a separate `components/receipt/ReceiptTicket.tsx` adapter that maps the stored order to the ticket's presentation props. Do not copy the attachment's hard-coded Y Combinator sample data or inline the entire compiled shader bundle. Use `@paper-design/shaders-react@0.0.81`, pinned exactly, for the Dithering background: its current package metadata accepts React 18 or 19, and the official Dithering documentation exposes the requested colors, shape, type, size, speed, scale, `minPixelRatio`, and `maxPixelCount` props.

## Paid-order presentation

At widths of 1024px and above, the success view has a two-column layout. The left column keeps the back link, `YOUR ORDER / LOCAL PREVIEW`, one H1, subtitle, local-test notice, and all existing delivery-preview text, expiry, demo key, copy action, and order actions. The right column places the new ticket first, followed by a compact details panel for paid status, masked delivery email, simulated payment with a local-test label, and the purchased plan's included items. Preserve current delivery and refresh/support behavior.

Below 1024px, stack the heading and subtitle, ticket, details, delivery block, and local-test notice in that order. Size the ticket from its measured container, keep its 741:425 aspect ratio, clamp it to 520–680px on desktop, and use available container width on mobile. For screens at 1280×720, keep the ticket, status, and amount visible; at the specified larger desktop sizes, fit the ticket, details, and delivery preview below the 85px header without page scrolling. Hide the global footer on this focused order view if it is the only remaining source of page overflow.

**View Your Ticket** is a real button beside/attached to the ticket preview. It expands the same mounted ticket into a modal-style overlay; do not mount a duplicate shader/ticket. The overlay has `role="dialog"`, `aria-modal`, an accessible name, focus management/return, Escape/close support, and a visible focus ring. On mobile the action remains at least 44px high. The ticket and action remain available only for paid orders; pending/cancelled/refunded states keep the existing plain order card and controls.

## Ticket content and behavior

The adapter derives all content from the order record and active locale: presenter “VibeFlow presents,” event “Soton Auto-Check,” localized purchased plan name, order reference, paid date, amount, and PAID watermark. Notification variants are Semester or Yearly only. The amount counts up once; a separate screen-reader value always contains the final MYR amount. The ticket includes teal PAID and local-test pills, and the receipt view announces payment success once. No card number, card brand, real-payment implication, confetti, or sound is introduced. Keep the site's local-test notice.

Mask the email using one flip-able constant. Format the stored `paidAt` in an explicit `Asia/Kuala_Lumpur` timezone and active locale. Any order-seeded rendering identifiers remain deterministic for server/client parity. CJK-aware line fitting avoids uppercasing CJK text; under 640px, ticket typography ratios keep normal labels/footer text at least 12px and the name at least 24px, omitting the ticket footer date when it cannot fit because the date is still in the details panel.

The appearance follows the uploaded ticket's perforated geometry but is finished in glossy black, charcoal, and graphite greys; no orange from the reference. Use a low-contrast black/graphite Dithering texture, restrained grey-white specular band, soft top-left glint, thin grey gradient edge, dark bottom vignette, pale ink, subtle grey watermark, and dashed perforations. Teal is limited to small status/detail accents. Add a separate static shadow layer and hover tilt/glare only for fine pointers. Tilt is disabled for coarse pointers and reduced motion. Use transform/opacity for motion and pointer-follow updates throttled through `requestAnimationFrame`.

Lazy-load the ticket/shader code so it does not delay first paint. Render a CSS graphite fallback if WebGL2 or shader setup fails. Keep one shader canvas, cap DPR at 1.5, `minPixelRatio` at 1 and `maxPixelCount` near 1.2M. Pause it off-screen and when the document is hidden; set speed to zero after roughly 2.5s and dispose on unmount. The 1.6s ticket entrance and one-time, per-order session replay follow the supplied timings. `?replay=1` forces playback; reduced-motion users see the completed state immediately with the shader paused. Do not update React state each animation frame.

## Plan catalog and stored-order compatibility

Remove Degree Pass from the active plan catalog and controls: no option, label, best-value badge, savings/duration copy, CTA, displayed price, checkout plan, or newly accepted order value. The yearly plan remains a data-driven 17% savings display and its period is localized as zh-CN “年付” and EN “Yearly.” Do not alter bundle pricing/countdown or other plan prices.

Separate active plan codes from legacy persisted codes. Server validation rejects both an old Degree Pass plan code and a `degree` period for new orders. Existing records already stored with the retired code render safely on checkout/status/admin/receipt surfaces using the neutral “Degree Pass (legacy)” label and their persisted order amount; they are not recreated as an active catalog price. Delivery still follows the saved record, and display paths must not index the active catalog unsafely.

## Horizontal overflow

Diagnose `document.documentElement.scrollWidth` against `clientWidth` on the home, checkout, and paid success pages. Find and correct the element causing overflow instead of masking all horizontal overflow globally. Add browser assertions at 1366, 1536, 1920, and 390px widths.

## Verification and outputs

- Search the repository for Degree Pass strings and prices; only the intentional legacy label and its compatibility tests should remain.
- Unit/API tests prove new legacy-plan/`degree` requests are rejected while seeded legacy records render.
- Browser tests verify the two-period control, localized labels, current prices and bundle timer unchanged, checkout behavior, ticket content, View Your Ticket dialog, masked email, reduced motion, replay behavior, and no console/hydration errors.
- Capture requested pricing/hero, checkout, and receipt screenshots in zh-CN and EN at 1366×768, 1440×900, 1536×864, 1920×1080, and 390×844 for bundle, extension, notification semester, and notification yearly. Capture six ticket-entrance frames. Assert desktop fit and mobile no-horizontal-overflow.
- Report normal and 4× CPU performance measurements (entrance and idle), p95 frame interval, frames over 20ms, long tasks, and production bundle delta for the success route.
- Run `npm run typecheck`, `npm test`, `npm run build`, and relevant Playwright tests.

## Assumptions for review

1. “View Your Ticket” expands the one mounted ticket into an accessible overlay, preserving a single WebGL context.
2. The two identical pasted component attachments are one reference; the uploaded orange graphic guides ticket geometry, while actual text/data come only from the order.
3. Existing Degree Pass records remain viewable but are never offered or accepted for new orders.
