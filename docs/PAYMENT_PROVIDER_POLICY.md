# Payment provider policy — 2026-10-20
New purchases support ONLY Stripe and ToyyibPay. HitPay is permanently retired, including local/sandbox/admin/internal_check creation.
- UI PaymentMethod and paymentMethods already contain exactly stripe/toyyibpay. Server provider-status always rejects HitPay, regardless of old enable flags.
- POST /api/hitpay/checkout always returns HTTP410 PROVIDER_RETIRED, no-store, before parsing, credentials, orders or provider calls. There is no administrator exception.
- Both active providers delegate price snapshots, verified callbacks and idempotent fulfillment to canonical Supabase qckpwckfukyurkobrsig. Either works without the other's credentials.
- Canonical server amounts, pricing campaign schedule, AC-LIC, private ZIP, phone-only grants, owner-only canary and buyer-email recovery are preserved. No database migration or historical record update accompanies retirement.
- Public sales remain CLOSED. Current production uses the older deployment and published site configuration v12 checkoutEnabled=false; this local policy change has NOT been deployed.

## Historical HitPay: isolated, optional, disabled by default
Retain historical order/provider references, receipts, event/audit/refund evidence and signature/amount/currency/transaction/idempotency checks. Never relabel or delete historical rows.
The integrated release callback uses getHistoricalHitPayDatabase, pinned to existing legacy project pocsafloidsjsgriopip. It NEVER falls back to canonical SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
Only a separately approved historical settlement can enable HITPAY_LEGACY_SETTLEMENT_ENABLED=true with the separate server-only HITPAY_LEGACY_SUPABASE_SERVICE_ROLE_KEY and HITPAY_WEBHOOK_SALT. These are OPTIONAL historical settings, never Stripe/ToyyibPay startup or launch prerequisites.
Missing opt-in/key/signing secret fails closed. A verified signed callback must match an already-existing HitPay order and saved provider request, exact amount/currency and transaction identity. No callback creates a new order.
Historical fulfillment RPC code remains available; do not activate it or replay callbacks merely because a stored row claims payment. Confirm provider/environment/payment first and obtain the required order/fulfillment approval.
Removed the unused HitPay creation configuration helper and new-sale example variables. Retained shared historical signature/parsing/receipt/diagnostic code; no SDK/package or infrastructure was added.

## Reconciliation and approval
Two historical extension orders are provider-confirmed SANDBOX completed, each expected/received MYR24.99, transaction/order references matched, refunded amount0, legacy issued licenses0, INVENTORY_EXHAUSTED. No real customer license/refund is justified by a sandbox event.
Seven HitPay provider requests were read-only verified: two completed sandbox, five pending sandbox. Ten additional HitPay pending rows have no saved request ID and remain ambiguous; preserve them.
Full pending inventory: Stripe9 (5 requests), ToyyibPay12 (5 requests), HitPay17 (7 requests), total38. Of21 without request IDs, do not assume failed/unpaid; a timed-out creation may have an orphan request.
The five Stripe requests lack usable local query credentials; five ToyyibPay live status lookups returned no verifiable transaction array. They remain UNVERIFIED. Confirm their merchant-side state before replacing legacy Stripe/ToyyibPay callbacks with canonical-only routing. Preserve an authenticated historical settlement route if any remain payable; no cancellation/refund/replay is authorized here.
No historical order, license, entitlement, refund or merchant setting was changed.
For production, separately approve either the narrowly scoped retirement-only patch or the separately reviewed canonical release. Push, deployment, migration, historical settlement/fulfillment/refund and public launch each retain their existing approval boundaries.
