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
