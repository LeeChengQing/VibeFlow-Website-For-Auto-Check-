# Auto-Check Production Operations Runbook (生产运维应急手册)

本文档是 Auto-Check 生产环境的标准运维与故障处置手册（SOP），供系统管理员与发布负责人执行日常巡检和应急响应。

---

## 1. 紧急止损与支付通道熔断 (Killswitches)

当某个支付平台发生通道故障、欺诈激增或结算异常时，无需修改业务代码，直接在 Vercel / 部署环境更新环境变量即可毫秒级独立下线：

```bash
# 暂停 Stripe 结账通道
PAYMENTS_STRIPE_ENABLED="false"

# 暂停 ToyyibPay 结账通道
PAYMENTS_TOYYIBPAY_ENABLED="false"
```

下线后，前端结账弹窗将对该通道展示"维护中/暂时不可用"，其他支付通道正常运行。

---

## 2. 密钥吊销与设备解绑操作 (Key & Device Management)

### 2.1 吊销指定订单或密钥
若发生退款或风控吊销，在 Supabase SQL Editor 或通过管理员权限执行原子 RPC：
```sql
-- 方式 A：按订单执行完整退款联动吊销（自动作废许可证、报废库存、注销 topic、排队通知）
select public.process_refund(
  '00000000-0000-0000-0000-000000000000'::uuid, -- p_order_id
  3500,                                           -- p_amount_minor
  'Customer requested refund within 7 days',      -- p_reason
  'admin_ops'                                     -- p_initiated_by
);

-- 方式 B：批量脚本废除
npx tsx scripts/keys/revoke-batch.ts --batch 202610-B1 --reason "Defective batch"
```

### 2.2 用户申请设备解绑 (更换电脑)
当用户更换电脑且已达到 2 台配额上限时：
```sql
select public.deactivate_device(
  'a1b2c3d4...', -- p_key_hash
  'e5f6g7h8...'  -- p_device_id_hash
);
```

---

## 3. 库存补货与缺货自动恢复 (Inventory Restocking)

### 3.1 生成并入库 v2 Crockford Base32 密钥
```bash
# 1. 预生成 100 把 core 密钥 (具备 ≥100-bit 熵与 Mod-37 校验位)
npx tsx scripts/keys/generate.ts --count 100 --plan core --channel website --region global --output stock_core_100.json

# 2. 演练导入 (Dry-run 验证校验和与熵)
npx tsx scripts/import-keys.ts --file stock_core_100.json --dry-run

# 3. 正式导入数据库
npx tsx scripts/import-keys.ts --file stock_core_100.json
```

### 3.2 补货后重试积压订单
当补货完成后，此前因 `INVENTORY_EXHAUSTED` 挂起的已付款订单可通过以下 RPC 或服务方法一键完成原子履约与邮件补发：
```sql
select public.assign_available_key('pending-order-uuid'::uuid);
```

---

## 4. 每日对账与可观测性巡检 (Daily Reconciliation)

### 4.1 手动触发全库对账
```bash
npx tsx -e "
import { getServiceRoleClient } from './lib/supabase-admin';
import { runDailyReconciliation } from './lib/ops/reconcile';

async function main() {
  const supabase = getServiceRoleClient();
  const report = await runDailyReconciliation(supabase, { lowStockThreshold: 10, adminAlert: true });
  console.log(JSON.stringify(report, null, 2));
}
main();
"
```

### 4.2 异常告警响应等级
| 异常类型 | 等级 | 自动动作 | 处置步骤 |
|---|---|---|---|
| `PAID_ORDER_UNFULFILLED` | Critical (P5) | 管理员 ntfy 警报 | 检查是否缺货，运行 3.1 补货并运行 3.2 重试履约 |
| `LOW_STOCK_WARNING` | Warning (P4) | 管理员 ntfy 警报 | 在 24 小时内生成新批次卡密入库 |
| `ORPHANED_LICENSE` | Critical (P5) | 管理员 ntfy 警报 | 核对订单支付提供方 ID 与 audit_log |

---

## 5. 探活与健康检查 (Health Probe)

外部探活服务（如 UptimeRobot, BetterUptime）每 60 秒轮询：
```
GET https://auto-check.example/api/health
```
- 正常响应：HTTP 200 `{"status":"healthy","database":"connected","release_asset_ready":true}`
- 故障响应：HTTP 503 `{"status":"degraded",...}`
- **安全保障：** 此接口绝不泄露数据库连接串、密码或环境变量私钥。

---

## 6. 试运营退出条件与紧急关停 SOP (Exit Criteria & Shutdown SOP, 附录 B.2 / B.5)

Southampton 约 300 人试运营期间，若发生以下情况，必须在 15 分钟内执行关停响应：

### 6.1 退出触发条件
1. **校方干预/纪律合规风险**：收到学校任何形式的关于自动签到的违规警示、封锁通告或纪律调查，**必须立即永久关停商业化服务**。
2. **打卡异常率超标**：连续 3 天打卡失败率超过 5%，或学校签到系统（Forms / e-Attendance）全面改版导致脚本无法在 24 小时内修复。
3. **关键基础设施熔断**：ntfy 免费通道被封禁或滥用超限，且无法在当日恢复推送；或客服积压工单超过 20 单无法处理。

### 6.2 紧急关停执行流程 (15 分钟 SOP)
1. **下线所有结账通道**：
   在 Vercel 环境变量中将 `PAYMENTS_STRIPE_ENABLED` 和 `PAYMENTS_TOYYIBPAY_ENABLED` 设置为 `"false"` 并重新部署，彻底切断新订单入口。
2. **发布首页维护与停运公告**：
   通过环境配置或公告横幅展示停运说明与退款指引。
3. **扩展门禁保护**：
   服务端保持已激活用户的“失败时宽松”（Fail-open）策略，确保扩展不中断学生正常的本地浏览器使用。
4. **统一清退与工单处置**：
   对 7 天内购买且受影响的用户执行全额退款（运行 `select public.process_refund(...)`），并导出完整审计日志备查。

---

## 7. 免费层升级触发条件 (Upgrade Triggers, 附录 B.5)

当前运行于零成本模式（Vercel Hobby + Supabase Free + Best-effort Email），满足以下任意条件时，应触发升级至付费层：

| 触发条件 | 当前指标基线 | 目标动作 | 成本评估 |
|---|---|---|---|
| **月净利润持续达标** | 试运营月营收持续 > $50 USD，净利润 > $30 USD 且平稳运行 1 个月 | 1. 购买独立域名（如 .com/.io）<br>2. 升级 Supabase Pro 计划（解锁每日自动备份与更大连接池） | 域名 ~$10/年<br>Supabase Pro $25/月 |
| **存储容量告警** | 数据库已用空间 > 400 MB（达到 500 MB 免费额度 80%） | 执行历史日志归档转储；若不可归档则升级 Supabase Pro | $25/月 |
| **用户规模越界** | 活跃付费学生数超过 300 人，或每日 API 调用 > 15,000 次 | 结束校内试运营，正式完成商业化公司/主体注册并上云 | 按商业方案立项 |

---

## 8. 独立域名切换清单 (Custom Domain Migration Checklist, 附录 B.8)

当从 `vercel.app` 迁移至独立域名时，按以下检查清单严格依序操作（系统已实现零硬编码解耦）：

- [ ] **1. DNS 配置**：购买域名，配置 A / CNAME 解析至 Vercel，等待 SSL 证书自动签发生效。
- [ ] **2. 发信域名验证**：在 Resend / 邮件服务商后台添加 SPF（`v=spf1 include:... ~all`）、DKIM（CNAME）与 DMARC（`v=DMARC1; p=none`）记录，向校园邮箱发送测试信确认进入收件箱。
- [ ] **3. Vercel 环境变量更新**：
  - 更新 `APP_URL="https://your-domain.com"`
  - 更新 `PUBLIC_BASE_URL="https://your-domain.com"`
- [ ] **4. 支付网关 Webhook 端点切换**：
  - Stripe Dashboard：添加 Webhook URL `https://your-domain.com/api/payments/stripe/webhook`，保留旧 URL 7 天双发过渡。
  - ToyyibPay Dashboard：更新 Callback URL 为 `https://your-domain.com/api/payments/toyyibpay/callback`。
- [ ] **5. 扩展客户端升级**：
  - 在 `auto-check-extension` 客户端代码更新 API Base URL，提升扩展版本号并打包分发。
- [ ] **6. 旧域名过渡**：保持 `auto-check.vercel.app` 301 永久重定向至新域名。

