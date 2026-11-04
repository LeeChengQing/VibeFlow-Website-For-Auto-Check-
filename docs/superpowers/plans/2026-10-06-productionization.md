# Auto-Check Productionization Implementation Plan

> Agent workers: execute the ordered tasks below using test-first changes. The user's instruction explicitly authorizes autonomous execution and default decisions; no additional design/plan approval gate. Appendix A of CODEX_SPEC overrides older plans.

**Goal:** Finish the website→payment→key→extension→notification→refund lifecycle with honest local/dev evidence and a human-controlled production release.

**Architecture:** Preserve Source-W commerce tables, payment signature checks and order-level atomic allocation. Consolidate the authoritative backend in Source-W, adapting Source-E's existing device registry, outbox leasing and recovery rather than deploying the independent prototype. Keep the MV3 client source in Source-E and track both repository commits.

**Tech stack:** Installed Next16.3.8/React19.3.0, Node24+, Stripe23, Supabase JS2.117.2, Postgres, Deno Edge, browser WebCrypto, existing esbuild/Playwright.

**Spec:** `docs/CODEX_SPEC.md` and appendix A; findings `docs/AUDIT.md`; defaults `docs/DECISIONS.md`.

## Global Constraints

- Never production: no existing .env credentials, linked DB, live payment, deployment, push or real school submission.
- Preserve reviewed original dirty files; use isolated W/E worktrees, explicit paths, fake fixtures, blocked external runtime network.
- No key/token/ciphertext/PII in logs, Git, snapshots or release ZIP; failure logs scrubbed before writing.
- Keep orders/key_inventory/issued_licenses and published pricing. No parallel plans/payments/license_keys.
- Keep raw-body payment verification, server amounts, capture-before-allocation, order locks/SKIP LOCKED/unique constraints.
- New core perpetual +12mo support; bundle one core+130day key; notify requires core; 2 devices;7day JWS;24h refresh;72h post-exp grace;self-unbind2/30days.
- Use first-activation notification duration, preserve historical expiries and legacy hashes/canonicalization/AAD.
- Every stage: acceptance + observed RED → implementation → all controlled tests → progress/evidence → explicit files commit; no false PASS for unavailable external validation.

## Review Focus

- A paid-but-pending stock failure remains a recorded capture and recovers without a second charge/key/mail task.
- Lost activation/refund/recovery/provider-create responses must not reset identity, reassign stock or resend uncertain messages.
- Signed offline core authorization must preserve local Forms reliability while server notification failure remains isolated.
- Partial/early/duplicate refunds or disputes must revoke every linked entitlement without making stock saleable.
- Legacy region/key/expiry/AAD mapping must preserve original state and not erase active/revoked evidence.

### Task 1: P0.0 safe test boundary and baseline

**Files:** W `scripts/lib/test-environment.mjs`, `scripts/test-network-guard.mjs`, `scripts/test-isolated.mjs`, `scripts/test-all.mjs`, `tests/test-isolation.test.ts`; explicit Playwright scope/config guards. E smoke/concurrency safeguards only if required by a failing safety test.

**Interface:** `isolatedTestEnvironment(sourceEnv, workdir, mode)` produces a minimal env without source credentials; `test-isolated` executes child tests with network guard; `test-all --extension-repo PATH` enumerates all controlled layers and reports each command, exit and evidence file.

- [ ] Write tests: arbitrary inherited SECRET/provider/database/proxy values are absent; fake loopback is explicit; nonloopback HTTP/fetch/socket denied before connection; local server allowed; output redact JWT/PEM/provider credentials; browser production hosts blocked; sample PII env absent.
- [ ] Run isolation test first. Expected: meaningful failure for missing safety boundary.
- [ ] Implement minimal runner/guards; keep dependency setup distinct from app runtime tests. No production .env copied.
- [ ] Run W/E baseline Node, Deno, browser/SQL/build layers available under safe config; record failures by name, investigate without asking for routine approval. Do not claim full green while any layer fails/unavailable.
- [ ] Validate documents/initial audit and commit audit snapshot separately from behavior changes; record hashes/command evidence.

### Task 2: Appendix A.4 P0 commercial closure 1–9

**Files:** W additive migrations for order consent/access/release + durable mail/alerts/jobs + refunds/support/admin audit; `lib/commerce/*`, existing checkout/fulfillment hook extensions, `app/success`, order recovery/support/legal/admin surfaces; tests for every acceptance below. Do not replace existing crypto/atomic mechanics.

**Interfaces:** one DB↔UI plan map; order capability store/hash/consume; unique order outbox event; versioned published release; controlled `retry_fulfillment` and `process_refund`; real admin auth requires whitelist+AAL2; consent policy version singleton.

- [ ] Before implementation write failing tests for all9: unique/retry mail; bare UUID denied/access TTL+cap/recovery anti-enumeration; production ticket/reply; release/version ZIP; stock alarm+replenish/retry; full/partial/early refund and revoked inventory; 4SKU receipt rendering; MFA/whitelist/lockout; checkbox+server consent evidence.
- [ ] Implement dependency slices with minimal migrations, source-safe logging, default configurable policies and durable outbox. Public ZIP release is not marked ready until Task7 core gate/build proof.
- [ ] Preserve success-page layout, existing focus/motion/payment URL checks; mobile WebView gets usable safe delivery/recovery path.
- [ ] Run complete controlled suite incl DB/clients/browser, update PROGRESS, commit P0 closure only when actual acceptance green; explicitly carry external mail/Stripe test evidence gaps.

### Task 3: B database, permissions, legacy import and rollback

**Files:** W new migrations/config/seed/rollback, Supabase typed rows, `scripts/keys/*`, `scripts/import-keys.*`, DB permission/transition/import/rollback/concurrency tests. Legacy E schemas remain historical inputs, never concatenated.

**Interfaces:** extend stock kind/channel/region/batch/hash_version/activation deadline; issued license optional anonymous channel ownership; activations and separate core/phone entitlements linked to original stock/order; reused devices/outbox/recovery; service-only transition/RPC boundaries.

- [ ] RED tests: all sensitive anon/authenticated CRUD/TRUNCATE denied including accidental grants; state rejection audited; first-activation expiry; v1 case/hash/AAD preserved;200fixture import counts/dedup/status; fresh migration and reapplication runner; rollback conserves provenance; true independent session key/order/seat locks.
- [ ] Apply only localhost/dev migrations after current CLI help verification. Seed synthetic data only. New files carry rollback/data-retention notes.
- [ ] Run all layers and record migration checksum/list, permission query outputs as safe aggregates; PROGRESS then commit.

### Task 4: C core/notify key and signed activation service

**Files:** W `supabase/functions/{activate,refresh,deactivate,status,config}/`, shared validation/token/crypto, service-only atomic RPCs, key CLI; crypto/endpoint/DB contract tests.

**Interfaces:** strict `{key,device_id,app_version}` where device_id is client random-ID SHA256; Ed25519 compact JWS alg/kid/sub/did/plan/feat/iat/exp/ver/min_app; core required before notify redemption. Status raw key never in URL/log, ownership token in header.

- [ ] RED: 100bit CSPRNG+checksum/v2HMAC; legacy vectors; normal/same-device replay/2seat/excess/unbind2per30days; notify-no-core refusal; expired/revoked/refunded activation+refresh; alg/kid/device/signature/token tampering; rate limit/anti-enumeration/body/CORS; key rotation/config.
- [ ] Implement audited server-only signing/config plus transactional activation/renewal and safe error dictionary. HMAC/private/encryption keys exclusively env secrets.
- [ ] Full suite/real multi-session tests; update progress/commit.

### Task 5: D/E payment lifecycle and refund/dispute depth

**Files:** existing W Stripe/Toyyib handlers extended; provider query adapter; webhook audit; unified refunds/disputes/evidence/jobs; tests.

**Interfaces:** retain signature/capture/RPC; provider confirmation adapter returns canonical request/payment/amount/currency/status; refund/dispute events route through same lifecycle transaction; Toyyib unsupported refund enters human queue.

- [ ] RED: forged/repeated/reordered success/failure/expired/refund/dispute; sameorder concurrent callbacks; price/identity/currency mismatch; Toyyib hash valid but official status unpaid rejects; return/callback race; creation timeout no new bill and safe recovery; idempotency keys on writes; switch/test-live guard.
- [ ] Reuse suitable authoritative query logic from E prototype, verify public official docs, don't deploy its parallel schema.
- [ ] Full suite and explicit Stripe test-mode dev E2E only with owner-provided allowlisted dev config. If unavailable, preserve hard evidence gap; never use live key.
- [ ] Progress/commit after controlled tests; external acceptance separately labelled.

### Task 6: F existing notification pipeline expansion

**Files:** W adapted E device/outbox/worker/reminder/recovery services and RPCs, ntfy adapter/config, queue tests/load script.

**Interfaces:** signed token + device + core/phone entitlement at ingress and at send; unique hash(entitlement,event); preserve atomic lease and uncertain state; TTL20min/day60/retention30days/caps; random≥128bit topics disclosed only after authorization; refund/expiry/abuse rotate.

- [ ] RED: unauthorized ingress/anon write; enqueue then refund drops; dedupe/lease replay; expired messages;429/5xx bounded backoff/final alarm; topic rotation; quota/cap/suspension; no PII fields; recoverycode limits/replay/expiry/concurrent ownership;optionalheartbeat disabled.
- [ ] Reuse E reliable registered-device/lease/uncertain recovery, add strict request/body/origin/logging and dedicated recovery secret. Configurable authenticated/self-host ntfy.
- [ ] Run all suite plus synthetic capacity; preserve distinction sent/provideraccepted/user-receipt; update/commit.

### Task 7: G integrate actual MV3 core gate and release build

**Files:** E src license/token/config/client/UI/storage/outbox modules, existing background/content/key/backup/build/package/smoke scripts; tests and W versioned release record integration.

**Interfaces:** local signature verification before startup/scheduling/GET_RUN/RESERVE/manual key actions; independent free local-notify within authorized extension;24h refresh and7d+72h grace; trusted storage + guarded background profile retrieval; only signed-authorized Edge queue.

- [ ] RED: fresh profile locked; validcore executes during notification outage; notify requirescore; all critical gates; offline grace exact boundaries/version/kill/configTTL; invalidkid/device/signature; recovery response-loss; localbuffer TTL/caps; diagnostics/backup no secret;install/update/QR/testnotify/topicreset UI.
- [ ] Preserve Forms once-submit/watchdog/uncertain evidence and local timetable parsing. No school sign-in/CAPTCHA bypass or real Forms submission in tests.
- [ ] Build unique version ZIP, scan every allowed file/content without printing matches, deterministic hash/provenance includes dirty/untracked/cross-repo state; real isolated MV3 smoke.
- [ ] Full W/E suite; record artifactSHA and platform limits; progress and commits per repo.

### Task 8: H remaining website UX and public surfaces

**Files:** W recovery/status/kawang/legal/version/FAQ routes, shared copy/config, bounded payment polling, sensitive headers/CSP, tests.

- [ ] RED: pending notcalledfailed;3min exponential-backoff cap/manual refresh; normalized4SKU/language receipt; access window/count; recovery generic responses; all contacts/policyversion consistent; keyboard/ARIA/contrast/laptop/mobile bounds; missingcriticalenv fail explicit.
- [ ] Implement source-grounded legal drafts labelled professional-review-required; defaultChinese+English; preserve approved layout/motion.
- [ ] Full suite and accessibility/performance checks; progress/commit with measured limits.

### Task 9: I management and operations

**Files:** W MFA ops/order timeline/key/seat/expiry/refund/dispute/queue/config/report tools; health/reconcile/alert scheduler; backup/restore scripts/docs.

- [ ] RED: actor/MFA/confirmation requirements, unauthorized operations, persisted audit, compensation, topic resets, duplicate alerts10min, DB/worker/backlog health degradation; daily reconcile detects paid-no-key/refunded-active/mismatch/stuckqueue/lowstock/device abuse; cached config changes.
- [ ] Implement local/dev scheduling/provisioning plus redacted structured correlationlogs; verified restore drill only disposabledev; human controls prod.
- [ ] Full suite/reconcile/alerts mock and externaldev when configured; progress/commit.

### Task 10: J full tests, CI and release gates

**Files:** explicit scripts/matrix, both repo CI/checkouts, coverage/secret/dependency/ZIP scans, true Postgres contention, all E2E contracts.

- [ ] RED: fail CI on forgedtoken/permission/openenv/secret-marker-in-any-ZIP-entry/dependencythreshold/coverage<85%;tests enumerate all layers without regex drift;devallowlist forbidsproduction/live.
- [ ] Run clean dependency install, lint/typecheck/unit/integration/SQL/rollback/multisession/Deno/browser/MV3/build/ZIP/coverage/gitleaks/dependency audit; test configs synthetic only.
- [ ] Record every layer evidence; missingexternaldev/platform/liverequirements remain explicit rather than skippedPASS; update/commit.

### Task 11: K documentation and honest acceptance

**Files:** all §18 docs, release checklist/FAQ/runbook/ENV/SECRETS/threat/pricing/restore/ntfy-selfhost/legal drafts; final SCORECARD/HUMAN_TODO/PROGRESS.

- [ ] Check every §17/§19 and appendixA.6 requirement maps to test/run/commit/hash or an explicit human-only/unverified gap.
- [ ] Finish full controlled suite and fresh independent review; fix important findings test-first. No shipping claim based on mocktest alone.
- [ ] Record actual score≤7 where test proof unavailable, all human actions and three highestrelease risks; final doc commit. No productiondeploy/push/merge without later user instruction.
