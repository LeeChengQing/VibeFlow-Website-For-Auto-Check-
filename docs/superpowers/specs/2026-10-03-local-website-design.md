# Vibeflow Auto-Check local website

Build the previously discussed site in this workspace and run it on localhost. The user's latest design and pricing instructions supersede the initial blue-theme blueprint: monochrome premium, extension RM24.99 one-time, mobile notifications RM11.99/sem, exactly two packages, no email field on the landing page, supplied logo and animated GIF support orb, inset white showcase card, four tutorial images, and a reserved tutorial video area. Chinese is default; English is selectable.

## Scope and acceptance

Use Next.js, React, Tailwind, and native CSS. Landing links, bilingual copy, showcase controls, tutorial enlargement, FAQ, checkout selection, checkout email validation, cancellation/success status, customer support submission/conversation, and an authenticated admin dashboard must work locally. Orders, messages, delivery previews, and refunds persist in a local SQLite database. Both payment scenarios are clearly labeled local simulations. No real payment, outbound email, extension download, or activation key is fabricated.

The original cloud plan requires user-specific HitPay, Supabase, Gmail OAuth credentials, a real extension ZIP, and an actual notification key pool. Those are not configured in this workspace. This deliverable supplies a complete local testing flow and records cloud launch requirements without pretending a simulation is a live integration. Production startup must fail closed for local APIs.

## Security and behavior

Prices come from the server catalog. Order and ticket links use random access tokens. Support verifies order reference and matching email. Admin sessions are HTTP-only, expire after eight hours, and require a configured local password. All mutations require same origin. Refund invalidates simulated delivery; cancelled/unpaid orders never receive delivery. Repeated completion does not duplicate fulfillment. Demo files and keys are never presented as real purchases.

## Verification

Node tests cover server price, state transitions, duplicate completion, support access, cancellation, refund, and token expiry. Browser tests cover desktop/mobile, language selection, checkout, support, admin authentication/reply, and image viewer keyboard dismissal. Production build and TypeScript checks must pass. Keep the verified localhost server running for the user.
