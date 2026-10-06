# 执行进度与验证账本

任务：按CODEX_SPEC附录A.5完成生产化；来源W/E见AUDIT。所有“通过”必须有本次命令/日志/提交证据，未执行不可记PASS。

| 阶段 | 当前状态 | 本次证据 | 提交 |
|---|---|---|---|
| A只读审计 | 静态审计完成；文档已签出 | 三输入完整阅读；W/E源码/迁移/函数/测试/环境使用与artifact审查；AUDIT/ARCHITECTURE/MIGRATION_PLAN已就绪 | 阶段A验收完成 |
| P0测试隔离前置 | 已完成（133/133 PASS） | 隔离环境生成器（scripts/lib/test-environment.mjs）、网络守卫（scripts/test-network-guard.mjs）、测试隔离套件（tests/test-isolation.test.ts）、隔离运行器（scripts/test-isolated.mjs，scripts/test-all.mjs）。133 测试全部在无云端依赖、拦截外部网络的沙盒中 PASS | 本次提交 |
| A.4 P0商业1–9 | 已完成（163/163 PASS） | 1. 履约Outbox工作机与邮件投递（lib/mail/email-service.ts, lib/outbox/worker.ts, tests/outbox-worker.test.ts 2/2 PASS）<br>2. 订单私密令牌与下载鉴权（lib/order-access-token.ts, app/success/page.tsx, tests/consent-and-tokens.test.ts 6/6 PASS）<br>3. 生产客户支持（lib/support/support-service.ts, app/api/support/, tests/support-service.test.ts 3/3 PASS）<br>4. 版本化ZIP发布与下载鉴权（scripts/build-extension-release.mjs, app/api/site/download/[token]/route.ts, tests/download-asset.test.ts 3/3 PASS）<br>5. 缺货熔断与履约重试（lib/fulfillment/fulfillment-service.ts, tests/inventory-exhaustion.test.ts 1/1 PASS）<br>6. 统一退款与Webhook生命周期（lib/payments/stripe-webhook-events.ts, tests/stripe-webhook-lifecycle.test.ts 3/3 PASS）<br>7. 方案码映射（lib/plans.ts, tests/plans-mapping.test.ts 4/4 PASS）<br>8. 管理员鉴权与真实业务操作（lib/site-operations.ts, tests/admin-commerce-operations.test.ts 1/1 PASS）<br>9. 条款同意（lib/consent.ts, components/BuyButton.tsx, app/terms/page.tsx, tests/checkout-consent-and-security.test.ts 4/4 PASS）<br>全量运行 163/163 PASS | 本次提交 |
| B数据库 | 进行中 | 空库/RLS/状态机/legacy/回滚/并发 | 待开始 |
| C激活 | 待开始 | core/notify/JWS/devices/grace接口 | 无 |
| D/E支付退款 | 待开始 | 保留基线，扩事件/二次确认/退款争议 | 无 |
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
