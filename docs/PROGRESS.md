# 执行进度与验证账本

任务：按CODEX_SPEC附录A.5完成生产化；来源W/E见AUDIT。所有“通过”必须有本次命令/日志/提交证据，未执行不可记PASS。

| 阶段 | 当前状态 | 本次证据 | 提交 |
|---|---|---|---|
| A只读审计 | 静态审计完成；文档已签出 | 三输入完整阅读；W/E源码/迁移/函数/测试/环境使用与artifact审查；AUDIT/ARCHITECTURE/MIGRATION_PLAN已就绪 | 阶段A验收完成 |
| P0测试隔离前置 | 已完成（133/133 PASS） | 隔离环境生成器（scripts/lib/test-environment.mjs）、网络守卫（scripts/test-network-guard.mjs）、测试隔离套件（tests/test-isolation.test.ts）、隔离运行器（scripts/test-isolated.mjs，scripts/test-all.mjs）。133 测试全部在无云端依赖、拦截外部网络的沙盒中 PASS | 本次提交 |
| A.4 P0商业1–9 | 已完成（163/163 PASS） | 1. 履约Outbox工作机与邮件投递（lib/mail/email-service.ts, lib/outbox/worker.ts, tests/outbox-worker.test.ts 2/2 PASS）<br>2. 订单私密令牌与下载鉴权（lib/order-access-token.ts, app/success/page.tsx, tests/consent-and-tokens.test.ts 6/6 PASS）<br>3. 生产客户支持（lib/support/support-service.ts, app/api/support/, tests/support-service.test.ts 3/3 PASS）<br>4. 版本化ZIP发布与下载鉴权（scripts/build-extension-release.mjs, app/api/site/download/[token]/route.ts, tests/download-asset.test.ts 3/3 PASS）<br>5. 缺货熔断与履约重试（lib/fulfillment/fulfillment-service.ts, tests/inventory-exhaustion.test.ts 1/1 PASS）<br>6. 统一退款与Webhook生命周期（lib/payments/stripe-webhook-events.ts, tests/stripe-webhook-lifecycle.test.ts 3/3 PASS）<br>7. 方案码映射（lib/plans.ts, tests/plans-mapping.test.ts 4/4 PASS）<br>8. 管理员鉴权与真实业务操作（lib/site-operations.ts, tests/admin-commerce-operations.test.ts 1/1 PASS）<br>9. 条款同意（lib/consent.ts, components/BuyButton.tsx, app/terms/page.tsx, tests/checkout-consent-and-security.test.ts 4/4 PASS）<br>全量运行 163/163 PASS | 本次提交 |
| B数据库 | 已完成（171/171 PASS） | 1. 完整生产Schema迁移（supabase/migrations/20261007020000_stage_b_database_hardening.sql）：plans, orders (public_ref/channel/timestamps), payments, webhook_events, license_keys, activations, entitlements, notifications, app_config, rate_limits, heartbeats, legacy_key_import_staging<br>2. 全表RLS零权限门禁：anon与authenticated对全部敏感私有表零读写权限，仅service_role可管理，公开plans与app_config严格只读策略<br>3. 订单与密钥状态机触发器：enforce_orders_status_transition 与 enforce_license_keys_status_transition 拒绝非法状态跃变，log_*_status_change 自动审计，prevent_audit_log_modification 锁定审计日志只追加不可篡改<br>4. 历史密钥清洗与分阶段导入RPC：ingest_legacy_keys_from_staging 支持text导入、去重、hash_version=1保持与key_inventory兼容<br>5. 导入验证工具与聚合报告：lib/keys/import-service.ts, scripts/import-keys.ts 支持--dry-run与计划/状态/区域统计<br>6. 幂等回滚迁移脚本：supabase/migrations/down/20261007020000_stage_b_database_hardening_down.sql 经过fresh db验证<br>7. 开发种子数据：supabase/seed.sql<br>全量运行 171/171 PASS | 本次提交 |
| C激活 | 已完成（178/178 PASS） | 1. Crockford Base32 v2密钥生成与Mod-37校验码算法（lib/activation/key-generator.ts: generateV2Key ≥100-bit entropy, validateKeyFormat, computeCheckDigit, canonicalizeKey, computeKeyHmac）<br>2. Ed25519 JWS令牌服务（lib/activation/token-service.ts: signActivationToken, verifyActivationToken 支持kid密钥轮换、claims结构与72小时离线宽限期，fail-open core门禁）<br>3. 数据库单事务行锁原子激活RPC（supabase/migrations/20261007030000_stage_c_activation_service.sql: activate_license_key, deactivate_device, get_key_status，防重幂等、配额上限2台设备检测、首次激活计算有效截止期与权益写入）<br>4. 激活服务端业务协调器（lib/activation/activation-service.ts）及Next.js API路由（app/api/activate, app/api/refresh, app/api/deactivate, app/api/status, app/api/config）<br>5. 批次密钥管理CLI工具（scripts/keys/generate.ts, stats.ts, revoke-batch.ts, export-kawang.ts）<br>6. 幂等回滚迁移（supabase/migrations/down/20261007030000_stage_c_activation_service_down.sql）<br>全量运行 178/178 PASS | 本次提交 |
| D/E支付退款 | 已完成（181/181 PASS） | 1. 扩充统一退款处理：`supabase/migrations/20261007040000_stage_de_payment_refund_hardening.sql` 升级 `process_refund` RPC，实现全额退款时原子撤销 `issued_licenses`、标记 `key_inventory` 报废、联动撤销统一 `license_keys`、撤销对应 `entitlements`、清空激活设备并排队邮件/管理员警报 Outbox 任务与不可篡改审计记录<br>2. 双向迁移支持：`supabase/migrations/down/20261007040000_stage_de_payment_refund_hardening_down.sql` 回滚验证通过<br>3. Stripe Webhook 增强：`lib/payments/stripe-webhook-events.ts` 支持按 `provider_payment_id` 与 `metadata.order_id` 双重解析订单，确保退款/争议事件即使在异步/预授权场景下也能精确匹配<br>4. 端到端履约-激活-退款-废钥闭环与并发交付幂等测试（`tests/payment-stage-de.test.ts` 3/3 PASS）<br>全量运行 181/181 PASS | 本次提交 |
| F通知 | 待开始 | 复用E队列+双检/TTL/caps/topic | 无 |
| G扩展 | 待开始 | core全部入口门控、版本ZIP和MV3 | 无 |
| H网站 | 待开始 | 恢复/status/卡网/UX/有限轮询 | 无 |
| I运维 | 待开始 | health/reconcile/admin/告警/恢复 | 无 |
| J测试CI | 待开始 | 全矩阵、coverage≥85%、secret/dependency/ZIP | 无 |
| K交接 | 待开始 | 最终SCORECARD/人类待办与release证据 | 无 |

审计期未运行测试/构建/脚本，未连接生产，未修改业务代码。原有dirty文件列在AUDIT，不能覆盖。扩展路径缺失已由业主提供C:\自动打卡系统解除。后续不需常规决策确认，按DECISIONS默认推进；只有真正外部依赖/环境硬阻塞才需人类输入。

## 当前执行工作区

- W：`C:\Users\CQCQ\.codex\worktrees\productionization\Auto-Check Website`（Codex托管）。
- E：`C:\Users\CQCQ\.codex\release-workspaces\auto-check-extension`（独立Git工作区，branch codex/productionization）。
- 已携带审计过的原有源码/测试/恢复依赖；没有复制环境凭据、库存、原码或历史ZIP。node_modules链接现有依赖，不能通过该链接更改原依赖。
- Task1分工：隔离env/network/log runner；Toyyib回调既有基线补测试（不改正确业务）；真实localhost Postgres基础设施。均不得连接生产。
- 全量应用测试尚未运行，A文档快照提交与Task1功能提交仍待验收；不要把新增测试的RED当作原有功能失败。
