# Checkout payment methods

All pricing buttons use `BuyButton` and the shared `PaymentMethodSelector` in the purchase modal. Stripe is selected by default. ToyyibPay / Touch 'n Go / DuitNow QR is available through `paymentMethods` in `lib/payment-checkout.ts`.

The pricing notice now uses payment-neutral copy. Previously saved copies of the shipped "Local test only; no payment is collected" notice are replaced when rendered, so existing published settings cannot falsely describe Stripe payments as a simulation. Customized purchase notices are preserved. The separate local simulation checkout remains explicitly labeled as a simulation.

## Stripe configuration

Configure these server environment variables locally in the ignored `.env.local`, and separately in your deployment environment:

- `STRIPE_SECRET_KEY`: secret or restricted API key with Checkout Sessions write permission. The supplied key is stored locally; it is never exposed through a `NEXT_PUBLIC_` variable.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the webhook endpoint below. Checkout returns `503 STRIPE_NOT_CONFIGURED` until both credentials are present, so orders cannot be charged before payment confirmation is configured.
- `APP_URL`: your public HTTPS origin, with no path, query or fragment. Development may use the requesting localhost origin if unset.
- Existing Supabase commerce and license encryption configuration remains required.

Register `https://YOUR_HOST/api/checkout/stripe/webhook` with Stripe for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use API version `2026-09-30.endive` to match the pinned Stripe SDK. Store that endpoint's signing secret in `STRIPE_WEBHOOK_SECRET`.

The server permits card and FPX using Stripe's current `allowed_payment_method_types` parameter. Enable those methods in the Stripe Dashboard. Apple Pay is part of card checkout and is shown only on eligible devices/accounts. See [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create) and [signature verification](https://docs.stripe.com/webhooks/signature).

## Request and response

`POST /api/checkout/stripe`, same origin, `Content-Type: application/json`:

```json
{ "buyer_email": "buyer@example.com", "plan": "bundle" }
```

Supported plans: `bundle`, `extension`, `semester`, `yearly`. The server normalizes the email, checks published storefront availability and prices, creates a pending order, then creates and records a Stripe Checkout Session. Browser-supplied amounts are ignored.

```json
{ "url": "https://checkout.stripe.com/c/pay/SESSION", "reference": "ORDER_UUID" }
```

The frontend checks the gateway URL, then displays its existing redirect countdown. Email, payment choices, submit and cancel controls are disabled during submission and redirect. Failure restores the form with a safe error and allows retry.

The webhook verifies Stripe's signature over the raw request body, then checks the stored session ID, order reference, amount and currency. Only paid sessions can record payment and call the existing atomic `assign_available_key` fulfillment function. Duplicate callbacks preserve the original capture. Inventory exhaustion preserves confirmed payment for operational recovery. `/success` supports both historical HitPay orders and new Stripe orders, and reads only server-confirmed entitlements.

## ToyyibPay reactivation

Configure `TOYYIBPAY_SECRET_KEY`, `TOYYIBPAY_CATEGORY_CODE` and `APP_URL` on the server, and enable DuitNow QR on the verified merchant account. `/api/checkout/toyyibpay` creates the pending order before creating the bill; `/api/webhook/toyyibpay` validates ToyyibPay's callback hash and fulfills with the atomic `assign_available_key` database function. See [ToyyibPay API reference](https://toyyibpay.com/apireference/).

## Verification

```text
npm test
npm run typecheck
npm run build
npx playwright test --config playwright.checkout.config.ts
```

Payment tests use mocked provider responses and real Stripe signature verification; they never create live sessions or charge the supplied key. Merchant permissions, enabled methods and delivery of real webhook events need verification after deployment configuration.
