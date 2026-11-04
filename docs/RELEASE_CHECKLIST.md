# 生产发布核对清单 (Release Checklist)

> **注意**：本清单综合了自动化工程验证与 CODEX_SPEC 第 19 节 / 第 20 节人类操作项。在进行正式生产发布前，请逐项核对。

---

## 1. 自动化工程验证 (已由 CI / 沙盒测试通过)

- [x] **测试全矩阵通过**：206/206 个离线隔离测试全部通过（运行 `node scripts/test-all.mjs`）。
- [x] **TypeScript 类型安全**：`npx tsc --noEmit` 0 错误通过。
- [x] **Next.js 生产构建**：`npm run build` 28/28 路由全量通过Turbopack静态/动态编译。
- [x] **机密安全扫描**：仓库内无任何 `sk_live_`、真实私钥 PEM 或 `.env.local` 泄漏。
- [x] **纯净数据库迁移回放**：空白 Postgres 库自基线至 Stage B、C、DE、F 迁移与 down 脚本回滚验证无冲突。
- [x] **扩展发布包无机密**：`public/downloads/auto-check-extension.zip` 已构建，且经深层扫描无硬编码服务端密钥或开发环境变量。
- [x] **扩展门禁宽限保护**：Fail-Open 门禁确保已激活用户在网络超时或服务端异常时绝不打断打卡任务。
- [x] **统一退款废钥闭环**：全额退款原子撤销授权、吊销密钥、注销 topic、丢弃待发通知。
- [x] **防枚举订单找回与工单支持**：`/recover` 和 `/support` 路由在各种边界输入下均具备频次限制与身份令牌校验。

---

## 2. 基础设施与凭据配置 (需人类操作 - P0)

- [ ] **Supabase Pro 升级与自动备份**：
  - [ ] 确保生产项目升级至 Pro 版（避免免费版 7 天无活动自动暂停）。
  - [ ] 开启每日物理备份与 WAL 归档。
- [ ] **全平台账户 2FA 强制开启**：
  - [ ] Supabase 组织与项目账号开启 TOTP 2FA。
  - [ ] Vercel 团队账号开启 2FA。
  - [ ] Stripe 管理员账号开启 2FA。
  - [ ] ToyyibPay 账号开启 2FA。
  - [ ] GitHub 账号开启 2FA。
  - [ ] 域名注册商与企业邮箱开启 2FA。
- [ ] **生产密钥生成与冷存储 (离线物理介质)**：
  - [ ] 生成高熵 `KEY_HMAC_SECRET` (≥32 bytes)。
  - [ ] 生成 Ed25519 签名密钥对并指定生产 `ED25519_CURRENT_KID`。
  - [ ] 生成 32-byte Base64 AES-GCM 密钥 `LICENSE_KEY_ENCRYPTION_KEY`。
  - [ ] 将上述三项私密凭据打印或存入离线加密 USB，严禁通过聊天工具传递。
- [ ] **环境变量注入 (Vercel & Supabase Edge Functions)**：
  - [ ] Vercel 生产环境变量配置（严格参照 `docs/ENV.md`）。
  - [ ] 配置 `APP_URL` 为生产真实 HTTPS 域名。

---

## 3. 支付网关与结算验证 (需人类操作 - P0)

- [ ] **Stripe 生产账户审核与受限业务确认**：
  - [ ] 确认 Stripe 账户处于 Active 生产状态。
  - [ ] 仔细阅读 Stripe Restricted Businesses 条款，确认合规。
  - [ ] 配置 Webhook 端点：`https://<PROD_DOMAIN>/api/checkout/stripe/webhook`。
  - [ ] 监听事件：`checkout.session.completed`, `charge.refunded`, `charge.dispute.created`。
- [ ] **ToyyibPay 实名与商户审核**：
  - [ ] 完成 ToyyibPay 商业认证与结算银行账户绑定。
  - [ ] 获取生产 `userSecretKey` 与分类码 `categoryCode`。
- [ ] **端到端真机真实小额验证**：
  - [ ] 使用真实支付卡完成一笔小额购买。
  - [ ] 验证成功页 3 分钟内履约并展示卡密与下载链接。
  - [ ] 验证系统投递履约邮件到买家邮箱。
  - [ ] 验证在 Chrome 开发者模式中安装该 ZIP，输入卡密能成功激活。
  - [ ] 申请退款，验证 Stripe 收到退款后，扩展端被标记撤销、无法再次激活。

---

## 4. 邮件与域名送达 (需人类操作 - P0)

- [ ] **DNS 记录配置 (SPF / DKIM / DMARC)**：
  - [ ] 在域名 DNS 控制台添加 SPF TXT 记录（包含 Resend 发信服务）。
  - [ ] 添加 DKIM CNAME 记录。
  - [ ] 添加 DMARC TXT 记录：`v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@<DOMAIN>`。
- [ ] **高校邮箱送达实测**：
  - [ ] 向 `@soton.ac.uk` 或对应大学域名邮箱发送测试邮件。
  - [ ] 确认邮件正常进入收件箱，未被拦截或归入垃圾箱。

---

## 5. 法律合规与服务政策 (需人类操作 - P0)

- [ ] **法律与政策草案专业审阅**：
  - [ ] 审阅 `app/terms/page.tsx`、`app/privacy/page.tsx`、`app/refund/page.tsx`。
  - [ ] 补齐公司/个人法律运营主体名称与实际联系方式。
  - [ ] 审阅高校《学生行为守则》与打卡系统服务条款，明确产品定位为“课程日程提醒与签到辅助工具”。

---

## 6. 上线后监控与运维就绪 (P1)

- [ ] **管理员手机端 ntfy 订阅**：
  - [ ] 管理员在手机 ntfy App 订阅私密主题 `NTFY_ADMIN_TOPIC`。
  - [ ] 发送测试警报验证手机弹窗提醒。
- [ ] **外部探活报警配置**：
  - [ ] 配置 UptimeRobot / BetterUptime 探活 `https://<PROD_DOMAIN>/api/health`。
  - [ ] 设置 1 分钟探活频率，失败时告警至管理员邮箱/手机。
- [ ] **卡网 (368云寄售) 上架核对**：
  - [ ] 生成并导出 v2 Base32 卡密库存。
  - [ ] 确认商品详情页退款说明、售后联系方式与官网一致。
