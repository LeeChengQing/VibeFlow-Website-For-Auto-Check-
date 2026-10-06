# 当前基线自评（不是最终发布评分）

日期2026-10-06；仅静态审计。没有本次测试运行证据，任何维度不得超过7。评分是当前可发行程度，不是代码量；历史PASS不能替代本次验收。

| 维度 | 当前分/10 | 实证基础 | 未满分原因/所需证据 |
|---|---:|---|---|
| 授权激活 | 2 | E受控手机兑换/设备凭据；W库存RPC | 整款core未保护，JWS/两席/解绑/续期/grace缺失 |
| 支付正确性 | 5 | W验签/金额/订单/幂等源码和现有tests | tests未运行，Toyyib二次查询、生命周期、真实testE2E欠缺 |
| 退款争议 | 1 | schema允许refunded，单独license revoke | 没有真实联动、退款/争议/权益/topic/审计闭环 |
| 数据权限 | 4 | Wforced RLS/明确grants；Edeny policies/RPC | 两源未合并、部分Egrants/FORCE弱、fresh/rollback未跑 |
| 通知 | 4 | Eatomic lease/dedupe/发送权益检查/uncertain | 入队校验/TTL/caps/认证/topic轮换/retention欠缺，未运行 |
| 扩展质量 | 5 | Forms可靠性、课表、MV3、QR、构建/大量测试源码 | core/grace/config缺失，当前包未完整scan/安装验证 |
| 网站商业 | 2 | landing/四SKU/托管入口/票据 | 邮件/找回/客服/terms/下载断点，通知receipt映射缺陷 |
| 运维 | 2 | stock error、worker/恢复handler、部分runbook | 无统一health/reconcile/持久告警/生产订单台/MFA |
| 测试CI | 3 | 多层测试源码/3连接测试/ZIPprovenance | 本次零运行、隔离风险、无CI/覆盖/全面秘密scan |
| 文档交接 | 4 | 本次AUDIT/架构/迁移/决策/待办 | 其余第18节文档与最终证据未交付，历史说明漂移 |

**发布结论：未达到9.5–10，不能标可直接发行。** 阶段B–K与商业P0尚未执行。完成后逐项用测试命令、日志、提交、artifact SHA与人类签署证据替换此基线，不因为目标要求高分而提高分数。
