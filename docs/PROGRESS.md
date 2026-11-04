# 执行进度与验证账本

任务：按CODEX_SPEC附录A.5完成生产化；来源W/E见AUDIT。所有“通过”必须有本次命令/日志/提交证据，未执行不可记PASS。

| 阶段 | 当前状态 | 本次证据 | 提交 |
|---|---|---|---|
| A只读审计 | 静态审计完成；应用测试未运行 | 三输入完整阅读；W/E源码/迁移/函数/测试/环境使用与artifact元数据审查；AUDIT/ARCHITECTURE/MIGRATION_PLAN | 待文档验收提交 |
| P0测试隔离前置 | 进行中 | 新隔离测试先观察6项缺失边界RED；网络探测在guard存在前不启动；实现与GREEN待记录 | 无 |
| A.4 P0商业1–9 | 待开始 | 先测试后实现；必要最小迁移随功能 | 无 |
| B数据库 | 待开始 | 空库/RLS/状态机/legacy/回滚/并发 | 无 |
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
