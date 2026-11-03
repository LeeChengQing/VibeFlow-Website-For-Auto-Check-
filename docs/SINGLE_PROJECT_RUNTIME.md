# Auto-Check 唯一运行链路

- 唯一数据库：`qckpwckfukyurkobrsig`。正式网站：`https://vf-auto-check.vercel.app/`。
- 网站页面和后台读同一 `site_configuration`；`payment_orders` 是唯一订单表，`plugin_licenses` 是唯一插件授权表。没有预生成密钥库存。
- `lib/unified-commerce.ts` 是支付创建与订单归属的服务端入口；现有 Stripe/ToyyibPay 回调负责验签，数据库事务负责发放和退款。完整插件密钥仅在买家主动点击查看且通过订单凭据校验后返回。
- 手机订单由当前插件通过 device-api 认证发起，Vercel 私有购买入口只接受同一项目的服务端凭据。付款后直接开通设备，不使用手机通知激活密钥。
- 手机学期为 130 天，年付为 365 天；续费累计，重复回调不重复授予。组合包手机权益从首次插件激活开始。仅全额退款撤销对应订单组件，部分退款待人工处理。
- 后台手工签发和付费发卡使用相同 AC-LIC 生成器、授权表和激活 RPC。不得增加第二套授权数据库或明文密钥库存。
- 运行配置只需要 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`。支付签名、加密和管理员会话秘密继续留在 Vercel 服务端，不进入前端或 Git。旧市场/独立授权库变量不再使用。
- 新购买使用私有 cookie、`/success?order_id=...` 和 `/api/purchase/[id]`；下载 URL 仅短时签名，购买后七天内可重新生成。URL 不携带设备 bearer 或密钥。
- `/api/internal/verify-payment` 仅供持有服务端凭据的部署验证：仅允许 `verification_only` 且设备名以 `verification-` 开头的隔离订单。会生成合成签名回调，不发起扣款；验证完须清理这些记录。它不能处理正常客户订单。
- 当前用户设备与授权不能作为付款测试夹具。测试后检查仅剩该真实设备。旧授权、旧订单、旧通知网站 API 已返回 410，不再读写旧结构。
- `checkoutEnabled` 是唯一公开销售开关；生产默认保持关闭，直到网关和授权闭环验收完成。勿用首页能打开、网关能建单代替真实收款验收。
- 本地 SQLite 仅属于被 localhost 限制的历史预览，不是线上数据源。不要把原工作区的未提交架构实验覆盖到这个已核对的线上分支。

后端迁移、备份、安装包哈希与云端部署记录保存在扩展仓库。回退应恢复明确的部署和配置快照，不可运行所有历史 `supabase db push`。
