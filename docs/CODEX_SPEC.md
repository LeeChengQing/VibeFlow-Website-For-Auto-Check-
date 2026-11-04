# CODEX 执行规格书：密钥激活 · 支付 · 手机通知 系统生产化改造

> 版本：v1.0 · 2026-10-06
> 配套文档：`docs/activation-key-system-risk-report.md`（风险评估报告，必须与本文件一起放进仓库 `docs/` 目录）
> 目标：把现有项目改造到**可直接发行的生产级别**（自评并经测试证明达到 9.5–10 分），所有流程完整、可自动化、可观测、可回滚。

---

## 附录 B（优先级最高）：小规模零成本试运营范围

> **优先级：附录 B ＞ 附录 A ＞ 正文。** 冲突时以本附录为准。
> 业主更新（2026-10-06）：产品**只面向 University of Southampton 学生，约 300 人**，先做**小范围试运营**；考虑到学生群体，**整个系统尽量以 0 成本运行，不使用 Supabase Pro**。

### B.0 总原则

- **规模小 ≠ 可以不安全。** 支付正确性、授权安全、退款/吊销联动、数据备份、隐私最小化**一律照做**。
- 被砍掉的是"为规模化准备的重型基础设施与仪式"，不是安全与正确性。
- 凡是需要付费才能达成的目标，不得悄悄降低标准：必须在 `DECISIONS.md` 写明"免费方案的限制 + 缓解 + 升级触发条件"，并列入 `HUMAN_TODO.md`。
- 用量要**量化**：Codex 须在 `DECISIONS.md` 提供一张用量估算表（假设：300 名学生，其中付费约 100 人为保守上限；估算数据库行数、每日 Edge Function 调用数、每日通知条数、每月邮件数），逐项对照各免费额度（额度以官方页面为准，标注核对日期）。

### B.1 零成本技术栈（默认）

| 组件 | 默认方案 | 约束 / 注意 |
|---|---|---|
| 数据库 + 函数 | **Supabase Free**：合并后仅保留 **1 个**生产 project；dev 用**本地 Supabase（Docker）**，不再占用云端 project | 免费项目有数量限制与暂停机制（见 B.2）；迁移计划必须核对合并后的项目数量 |
| 站点托管 | 保持现状（Vercel） | ⚠️ Vercel Hobby 面向个人非商业用途，收费使用存在条款风险：在 `HUMAN_TODO` 标注；Codex 只输出**迁移预案文档**（如 Cloudflare Pages/Workers 免费计划，需 Next.js 适配器评估），**不要现在迁移** |
| 邮件 | 邮件适配层，默认 Resend 免费额度 | ⚠️ 免费额度与"必须验证自有域名才能发给任意收件人"需核实；**域名是唯一可能的小额必要成本**（若业主已有域名则为 0）；备选 Brevo 免费额度（单发件人验证，送达率较弱）；适配层必须可切换 |
| 手机推送 | ntfy.sh 免费层 | **关键瓶颈，见 B.3** |
| 客服 | **不自建工单系统**；使用免费外部渠道（邮箱 + WhatsApp 或 Telegram 其一） | 修改附录 A.4 第 3 项：成功页、邮件、条款页、扩展内全部指向同一个真实可用的联系入口；`/support` 页面只做入口展示 |
| 监控/探活 | GitHub Actions 定时任务 + UptimeRobot 免费版 | 告警发到管理员邮箱（优先）与管理员 ntfy topic（低频，避免消耗配额） |
| CI | GitHub Actions 免费额度 | ⚠️ 私有仓库有每月分钟数上限：测试分层（快速层每次提交、重型并发/E2E 层按需/每日） |
| 错误追踪 | 不引入付费服务 | 结构化日志 + Supabase logs |
| 限流 | **数据库表实现**（不引入 Redis 等付费组件） | 注意免费库容量与行清理 |
| 机密管理 | Supabase secrets + Vercel env | 不使用付费 KMS |

### B.2 Supabase Free 的必做缓解（P0）

1. **防暂停**：✅ Free 项目 7 天无活动会被自动暂停（2026-10 已核对）。实现 GitHub Actions 定时（建议每 2 天）调用会**真实查询数据库**的 `/health`，并配合 UptimeRobot 做冗余；放假期间尤其重要。说明：保活是缓解不是保证。
2. **备份**：Free 无自动备份。实现**加密的定期导出**（GitHub Actions 每周 + 每次迁移前手动）：
   - 导出 schema 与关键表；用**公钥加密**（age/gpg），私钥由业主离线保管；**绝不提交明文**；
   - 产物保存为带保留期的 Actions artifact，并要求业主**每月手动下载一份到本机**；
   - 写 `RESTORE_DRILL.md`，并在 dev（本地 Docker）完成一次真实恢复演练。
3. **容量监控**：数据库接近上限（如 80%）告警；通知队列、审计、限流表的保留期收紧（默认 14 天；审计摘要可更长）。
4. **函数调用额度**：⚠️ 核对免费额度；设计时统计每用户每日调用次数（续期每 24h、入队、保活等），事件合并/批量，接近额度告警。
5. **无时间点恢复（PITR）**：高风险迁移前必须手动导出；所有迁移必须有回滚脚本。
6. **升级触发条件**（写入 `RUNBOOK.md`）：满足任一即升级 Pro 或迁移——① 当月收入足以覆盖 US$25；② 数据库 > 400 MB；③ 发生过一次暂停或数据事故；④ 函数调用逼近免费额度；⑤ 付费用户数明显超出估算。

### B.3 通知链路与 ntfy 免费层（P0，当前最紧的瓶颈）

- 2026-10 检索结果：ntfy.sh **免费层有速率与额度限制**；多个来源提到匿名/免费发布约 **250 条/天**，Supporter 套餐约 2,500 条/天（约 US$5/月）；官方条款建议对"需要保证可用性/SLA"的应用**自建**，并提示公共 topic 名即密码。**额度以官方文档为准，Codex 必须在开工前核实并记录日期。**
- 估算：若有约 100 位付费用户、每人每日 2–3 条通知，即约 200–300 条/天，**会撞上 250 条上限**；管理员告警也会占用同一配额。
- 因此必须实现：
  1. **通知预算**：全局每日配额计数器（默认为已核实上限的 80%），为管理员告警**预留**一部分；
  2. **优先级降级**：失败/需要人工 > 成功确认 > 其他提醒；预算耗尽时丢弃低优先级并计数、告警；
  3. **减量设计**：默认每次打卡只发 1 条结果通知；可配置"仅失败通知"；
  4. 管理员告警**优先走邮件**，ntfy 仅用于紧急级别；
  5. ntfy 适配层支持**无需改代码**切换到：付费账号发布、或自建实例；
  6. `docs/NTFY_SELF_HOST.md` 增加**零成本自建**选项评估（如免费云主机或常开的本地机器 + 免费隧道），列出可用性、运维负担与风险；**只写文档，不要现在部署**。
- 免费层不得"规避速率限制"（官方条款禁止）：不要用多 IP/多账号拆分来绕开额度。
- 业主决策点（写入 `HUMAN_TODO`）：试运营期是接受"配额内尽力而为"，还是在付费用户超过阈值时开启 Supporter / 自建。

### B.4 范围裁剪表（相对正文与附录 A）

| 项目 | 小规模处理 |
|---|---|
| 自建 ntfy / 第二支付渠道 / PITR / 付费监控 | 不实施（仅文档与升级触发条件） |
| PRICING_MODEL 脚本 | 简化为 `docs/PRICING_MODEL.md` 表格（含 ToyyibPay 固定费对低价套餐的占比） |
| 每日对账 | 保留 3 项核心：已付款未履约、已退款但仍有效、库存/批次临界；其余做成手动脚本 |
| 争议证据包 | 简化为 JSON/CSV 导出 + 操作文档（预期争议极少） |
| 管理后台 | **保留 MFA（Supabase Auth TOTP；⚠️核实 Free 计划可用）与关键动作**：订单查询、重试履约、退款、吊销、解绑、轮换 topic、远程配置；界面从简，可用 CLI 脚本 + 极简页面 |
| 缺席告警/心跳 | 仅设计，flag 默认关闭 |
| 多语言 | 中文为主 + 英文简版 |
| 状态页 | 简化为读取 `/config` 公告的页面 |
| 覆盖率门槛 | **关键模块**（支付、履约、激活/令牌、退款、通知授权）≥ 85%；全仓不设硬性门槛 |
| E2E/性能 | 保留主链路、退款、库存耗尽、并发；削减视觉回归与性能套件 |
| 威胁模型/Runbook | 保持简洁但**必须覆盖全部事故场景**与"试运营退出条件" |
| **不得裁剪** | 邮件 outbox、订单访问令牌、退款/吊销联动、库存耗尽告警、kill_switch/min_version、令牌签名与设备绑定、限流、条款同意记录、备份与恢复演练、隐私最小化 |

### B.5 单一院校集中度风险（试运营特有）

- 全部用户集中在一所学校：学校系统改版、发现使用或发出通知 → **100% 用户同时受影响**；同学之间转发 key 的概率也更高。
- 对策：`kill_switch` 与公告机制必须**真实演练**；每把 key 设备数上限（默认 2）与异常设备告警；退款/下线流程在 24 小时内可执行。
- **试运营退出条件**（写入 `RUNBOOK.md`，业主可调整数值）：收到学校或平台的任何正式通知 → 立即停用并下线商品页；退款率或打卡失败率超过设定阈值 → 暂停新销售并排查；免费额度/备份/保活任一失效且 24 小时内无法恢复 → 暂停新销售。
- 熟人圈更需要数据最小化：保持现有"不上传学校密码/Cookie"，并按审计建议停用默认课表/Forms URL 的云同步。
- 若主要买家是马来西亚学生：ToyyibPay（FPX）的固定手续费对低价套餐占比较高，应在价格表中显式展示。

### B.6 修订后的 HUMAN_TODO 优先级

| 变化 | 内容 |
|---|---|
| 移除 | "升级 Supabase Pro 并开启备份"（P0）|
| 新增 P0 | 确认保活任务与每周加密备份已实际运行；每月一次备份下载 + 恢复演练 |
| 新增 P0 | 核实 ntfy.sh 当前免费额度并决定试运营期策略（B.3） |
| P0 | 域名与发信（SPF/DKIM/DMARC）与邮件额度核实；若无域名，决定购买或改用备选 |
| P0 | 安装 Docker Desktop + Supabase CLI（本地 dev 与真实 Postgres 并发测试的前置） |
| 新增 P1 | 评估 Vercel Hobby 对收费使用的条款风险，决定是否迁移 |
| 其余 | 保持不变（法律审阅、ToyyibPay 验证、真实小额测试、2FA、税务等） |

### B.7 验收增补

- [ ] GitHub Actions 保活与备份任务有实际运行记录；备份文件在**本地 Docker** 恢复演练成功
- [ ] 容量/额度告警可被触发并送达管理员
- [ ] 通知预算耗尽时：按优先级降级、计数、告警（有测试）
- [ ] 用量估算表完成并对照免费额度
- [ ] 合并后云端 Supabase 项目数满足免费限制（`MIGRATION_PLAN.md` 核对）
- [ ] "试运营退出条件"与"升级触发条件"已写入 `RUNBOOK.md`
- [ ] 客服入口：成功页/邮件/条款页/扩展内一致且真实可用（已实际发送测试）

### B.8 域名决策（业主确认：目前使用 vercel.app 免费子域名）

> 本节**覆盖 B.1 中"邮件"一行**，并修改附录 A.4 第 1 项（邮件）的实现方式。

**事实与影响**
1. vercel.app 子域名的 DNS 不受业主控制 → 无法为发信域名配置 SPF/DKIM/DMARC → 主流邮件服务无法可靠地向任意收件人发信；学生多使用学校的 Microsoft 邮箱，过滤较严格，**邮件进垃圾箱或被拒收的概率不低**。
2. 将来更换域名或托管商时，所有 webhook 地址、成功页/邮件链接、二维码、扩展内的购买链接、Origin 白名单都要同步变更，漏一处就会断链。
3. 对支付商审核与学生信任度偏弱；收费项目托管在 Hobby 的 vercel.app 上，条款风险同 B.1。

**建议（Codex 在 `DECISIONS.md` 中如实写明；是否购买由业主决定）**：购买一个自有域名（成本通常为每年几美元到十几美元量级，便宜后缀首年更低，需自行比价）。这是整个系统**唯一建议的必要支出**。若业主坚持 0 成本，则按下面的"零成本模式"实现。

**零成本模式（默认实现）**：系统必须在**没有自有域名、邮件不可靠**的前提下，仍然让买家**一定拿得到密钥**，并且丢失后可找回：

1. 成功页展示密钥 + **订单凭证**（订单访问令牌，仅存哈希）+ "复制/下载凭证"按钮 + 醒目提示"请保存"。
2. **订单找回页**：输入订单凭证即可再次查看（限时、限次、限流；响应头 `no-store`、`noindex`、`no-referrer`）。
3. 凭证丢失 → **客服辅助找回**：管理员核对邮箱 + 支付参考号后，在管理后台"生成新的找回链接"（需 MFA、写审计、限流）；**不得**在聊天中直接粘贴明文密钥。
4. 邮件为**尽力而为**：适配层默认 Brevo 免费额度 + 已验证单发件人（⚠️ 额度与要求以官方页面为准）；**严禁作为唯一交付通道**。上线前向 Gmail、Outlook 与学校邮箱各做一次送达测试并记录结果；发送失败不得影响订单状态，但要进入重试与（低频）管理员告警。
5. 页面与条款如实说明："邮件可能进入垃圾箱，请保存订单凭证。"

**域名无关设计（无论买不买都必须做，便于日后切换）**

- 所有对外 URL 来自**单一配置**（`PUBLIC_BASE_URL`/`APP_URL`），代码中不得硬编码 `vercel.app`；Origin 白名单为**可配置列表**（支持新旧域名并存一段时间）。
- 扩展内的购买/帮助/状态页链接来自**远程配置**（`links.*`），换域名**无需重发 ZIP**。
- `RUNBOOK.md` 写明"切换域名清单"：DNS、Vercel 域名绑定、`PUBLIC_BASE_URL`、Stripe/ToyyibPay 的回调与返回地址及商户网站字段、Origin 白名单、邮件发件域（SPF/DKIM/DMARC）、条款页、扩展远程配置，并配对应验证用例。
- 邮件适配层与发件人配置可切换；买域名后的切换步骤写入 `HUMAN_TODO.md`。

**验收增补**

- [ ] 无自有域名模式下，**不依赖邮件**即可完成"购买 → 取得密钥 → 凭证丢失 → 经客服找回"的全流程（有自动化测试 + 一次人工走查）
- [ ] 更换 `PUBLIC_BASE_URL`（用不同的 dev 地址）后，购买链路、成功页、找回页、webhook 返回地址、扩展内链接全部通过
- [ ] 仓库中不存在硬编码的 `vercel.app` 业务 URL（CI 检查）
- [ ] 三类邮箱的送达测试结果已记录，并在文档中如实说明可靠性

---

## 附录 A（优先级高于正文，低于附录 B）：现状基线与差距

> 依据：`docs/website-operation-flow-zh.md`（对当前网站代码的静态审阅，2026-10-06）。
> **优先级规则：本附录与正文任何章节冲突时，以本附录为准。** 正文是"目标标准"，本附录说明"起点在哪里"。
> **核心原则：已经正确的部分不要重写，只做验证、补测试、扩展。** 为了"统一风格"而重写已经通过安全审阅的支付/履约代码，本身就是风险。

### A.1 已经做对的部分（保持；补测试；禁止无理由重写）

| 领域 | 现状（已实现） |
|---|---|
| 价格 | 金额由服务端从已发布配置计算，最小 RM1.00，浏览器金额不被读取 |
| 入口防护 | Origin 校验、`Content-Type` 校验、请求体上限（16 KB / 回调 64–256 KB）、方案 allowlist、邮箱校验 |
| Stripe 回调 | 原始请求体验签；校验 Session / 订单 / 金额 / 货币 / Payment Intent；`pending` 或可幂等重放的 `paid` 才可处理；Payment ID 冲突被拒 |
| ToyyibPay 回调 | callback hash 校验（时间恒定比较）；两位小数精确金额；BillCode/reference/MYR 匹配；refno 冲突检查；非成功状态不履约；创建账单超时时**不重复提交** |
| HitPay 回调 | HMAC-SHA256 原始字节验签（仅沙盒） |
| 履约 | `assign_available_key(order_id)`：订单行锁 + `FOR UPDATE SKIP LOCKED` + 同事务写 issued license 与订单状态；唯一约束（每订单一许可证、每库存项一次）；重放安全 |
| 库存耗尽 | 订单保持 `pending` 但记录 `payment_confirmed_at` 与 `fulfillment_error=INVENTORY_EXHAUSTED`，不会误标已交付 |
| 成功页 | 只信服务端订单状态；URL 上的 `success/paid` 字样不被信任 |
| 数据保护 | RLS 强制开启、无浏览器策略；service-role 仅服务端；密钥存哈希 + 加密；解密仅在服务端 |
| 管理会话 | `__Host-` cookie、HttpOnly、Secure、SameSite=Strict、8 小时 |

> Codex 的工作：为以上每一项**补齐自动化测试**（若缺失），确认它们在 Supabase 迁移里确实如文档所述；发现与文档不符时在 `AUDIT.md` 标红。

### A.2 命名对照（正文 → 现有；**不要新建平行表**）

| 正文中的名称 | 现有对应 | 处理 |
|---|---|---|
| `orders` | `orders` | 保持；按需新增列（如 `terms_version`、`terms_accepted_at`、`release_asset_id`、`app_version`、`order_access_token_hash`） |
| `license_keys` | `key_inventory` + `issued_licenses` | **保持两表结构**；在其上扩展（`kind`、设备数、`activate_by` 等），不要新建 `license_keys` |
| `payments` | `orders` 上的 `provider_payment_id`、`payment_confirmed_at` | 不拆表；退款/争议另建 `refunds`、`disputes` |
| `plans` | 站点已发布配置（`site_configuration.published`） | 不新建 `plans` 表；**建立唯一的方案码映射模块**：数据库码 `extension / semester / yearly / bundle` ↔ UI 码 `mobile_notification / mobile_notification_yearly …` |
| `webhook_events` | 无 | 新增，仅作审计与排查；**不替换**现有订单级幂等 |
| `activations`、`entitlements`、`notifications`、`app_config`、`audit_log`、`rate_limits` | 文档未覆盖（激活元数据存在，位置待审计确认） | 审计后决定"复用/新增"，写入 `DECISIONS.md` |

### A.3 与新商业计划的根本冲突（P0，必须先处理）

**现状**：`extension`（默认 RM24.99）购买后**没有任何密钥**（迁移名即 `keyless_extension_license_delivery`）；`bundle` = ZIP + 一把学期通知密钥；通知密钥有效期从履约时起算（学期 130 天、年度 365 天）。
**新计划**：ZIP 本身必须用密钥激活（防止一个 ZIP 无限人用）。
**结论**：按现状，购买扩展的人拿到的是**可无限传播的无密钥 ZIP**，新计划目标没有达成。

**默认决策（Codex 采用并写入 `DECISIONS.md`；业主可改）**

| 项 | 默认 |
|---|---|
| 密钥种类 `kind` | `core`（扩展本体）、`notify_semester`、`notify_yearly`、`bundle`（= core + 130 天通知） |
| 购买对应 | `extension` → 一把 `core` 密钥；`bundle` → 一把 `bundle` 密钥；`semester`/`yearly` → 一把通知密钥 |
| 通知密钥的使用条件 | 必须在**已有有效 `core` 激活**的设备上兑换（服务端按 device 校验） |
| `core` 有效期 | `valid_until` 可空；默认**不设到期**（与现价一致），同时新增 `support_until`（默认购买后 12 个月）：仅表示"承诺适配到何时"，不会自动停用；是否改为有期限由业主决定（风险见报告 6.5、8.2：目标系统会变，永久承诺有风险） |
| ZIP 分发 | 因为 ZIP 现在**没有密钥就无法使用**，下载本身不再是安全边界：默认提供**公开的、带版本号的下载地址**（如 Supabase Storage 公共桶/Vercel Blob），成功页链接到"当前已发布版本"；订单记录 `release_asset_id`/`app_version`。如业主希望保留"付款后才可下载"，实现为受保护的签名链接（需查询 Supabase 订单状态，退款后拒绝） |
| 库存 | `core` 密钥同样走"预生成库存 → 履约分配"模式，复用 `assign_available_key`（扩展该函数，保持行锁/幂等特性）；库存耗尽按 A.1 的既有模式处理并告警 |

> **更新（阶段 A 审计后）：扩展位于独立 Git 仓库 `C:\自动打卡系统`，与网站仓库 `C:\Auto-Check Website` 分离**（此前"扩展在同一仓库"的说法不准确，已被审计纠正；阶段 A 已据此完成两个仓库的审计）。以下条目保留作为审计清单，并要求后续在 `ARCHITECTURE.md` 中明确**合并后由哪个仓库唯一拥有数据库迁移与 Edge Functions**：
> 1. 找出扩展源码、构建/打包脚本，以及激活与验证的完整调用路径（从用户输入密钥到服务端判定）。
> 2. 找出扩展使用的 Supabase project：URL 与 anon key 的来源，以及与网站所用 project 的关系（现有"两个 project"各自被哪些代码引用，通过哪些环境变量区分）。
> 3. 列出扩展端涉及的全部表、RPC、Edge Function 与 RLS 策略；**判断扩展是直接读写表，还是只调用函数/RPC**（对应风险报告第 4 节与 Q1）；若是直连表，标为 P0 并优先改为 Edge Function。
> 4. 说明卡网（368云寄售）key 如何进入数据库（CSV 字段 `key_hash / encrypted_key / plan_type / status`、导入脚本、region 区分），以及 China-region 与 global key 目前在两个 project 中的分布，据此出具 `MIGRATION_PLAN.md`（合并为单一生产 project）。
> 5. 绘制"网站 ↔ 数据库 ↔ 扩展"的完整调用图（Mermaid），写入 `ARCHITECTURE.md`。

### A.4 差距清单（来自现状文档，按优先级；对应正文章节）

**P0（上线前必须全部完成）**

| # | 差距 | 要求 | 对应正文 |
|---|---|---|---|
| 1 | **完全没有邮件发送**；密钥只在成功页展示，关页即丢 | 履约后发邮件（key、下载链接、激活指引、退款政策、客服入口）；发送适配层 + 重试 + 送达日志 + 失败告警；临时措施：开启 Stripe 收据邮件 | 8.1-6 |
| 2 | **成功页仅凭订单 UUID 就展示许可证**（持有链接者即可查看；学生可能用公用电脑/截图转发） | 增加独立的订单访问令牌（随机、仅存哈希）或校验支付平台 session；响应头 `Cache-Control: no-store`、`X-Robots-Tag: noindex`、`Referrer-Policy: no-referrer`；密钥展示窗口与次数限制；提供邮箱找回流程 | 13-2/13-3 |
| 3 | **生产客服不可用**：`/api/support` 被 `localOnly` 拒绝，而成功页指向它 | 实现生产客服（Supabase 表 + RLS + 管理面板 + 新工单告警）**或**接入真实外部入口（邮箱/WhatsApp/Telegram）；成功页、邮件、条款页的联系方式必须一致且可用 | 13、14 |
| 4 | **扩展下载链接指向不存在的静态文件**；真实订单不记录发布版本 | 按 A.3 的决策实现；上线前必须有一个真实 ZIP 可被下载并通过构建扫描（无机密） | 12-13、13 |
| 5 | **库存耗尽后，已付款订单无人知晓、无自动补发** | 库存低于阈值时告警；`fulfillment_error` 订单触发管理员 ntfy 告警；管理后台"重试履约"按钮 + 定时自动重试；补货后自动发邮件；对账任务覆盖此项 | 14.2 |
| 6 | **无生产退款流程**；Stripe 仅处理 `completed` 与 `async_payment_succeeded`；撤销许可证与退款彼此独立；撤销后库存不处理 | 实现 `process_refund` 统一入口；补处理 `async_payment_failed`、`expired`、`charge.refunded`、`charge.dispute.*`；退款 → 订单 `refunded` + 许可证 `revoked` + 库存项标记 `revoked`（**不回收再卖**）+ 权益失效 + 邮件 + 告警；ToyyibPay 无退款 API 时走"待人工退款"队列 | 9 |
| 7 | **方案码映射不一致**（数据库 `semester/yearly` 与成功页展示表 `mobile_notification*`），通知方案成功页可能无法展示 | 单一映射模块 + 单元测试 + 对每个方案的成功页渲染测试 | A.2 |
| 8 | **管理后台只有一个共享密码** | 登录限流与失败锁定；操作审计日志；强制 MFA（TOTP）——优先迁移到 Supabase Auth + 管理员白名单 + MFA；撤销/发布/退款类操作二次确认 | 14.1、15 |
| 9 | **没有条款同意与记录** | 购买弹窗必须勾选并记录 `terms_version`、时间、IP 哈希；条款/隐私/退款页上线（草稿，标注需专业审阅） | 8.1-5、13-5 |

**P1**

| # | 差距 | 要求 |
|---|---|---|
| 10 | 成功页每 2 秒刷新且无上限 | 指数退避 + 总时长上限（如 3 分钟）后给出"稍后查看/邮件会发送"的明确提示 |
| 11 | 生产代码中残留本地 SQLite 模拟订单/工单、`DEMO-` 密钥、HitPay 沙盒入口 | 评估后**从生产构建中移除或编译期隔离**（缩小攻击面、避免误导）；确认 `LOCAL_DEMO` 在生产不可开启；更新 README |
| 12 | ToyyibPay 目前依赖回调 hash | **保留现有校验**，再加一层服务端主动查询账单状态做二次确认（纵深防御）；失败则不履约并告警 |
| 13 | 无 `webhook_events` 审计 | 新增审计表（不改变现有幂等逻辑） |
| 14 | 成功页展示的密钥属于敏感内容 | 验证未被缓存/索引/写入日志/发送到第三方脚本；CSP 限制第三方脚本 |
| 15 | 通知链路（ntfy）、激活协议、远程配置、设备绑定在网站代码中**不存在** | 按正文第 6、10、11 节新建 |
| 16 | 卡网渠道 | 按正文 7.5：`channel=kawang` 库存导入、首次激活转 `activated`、对账报告 |
| 17 | 退款后的库存 | 已分配并撤销的库存项保持 `revoked`，不得重新上架 |

### A.5 调整后的执行顺序

`阶段 A（审计，含 A.3 的"扩展端代码定位"）` → **`A.4 的 P0 商业闭环 1–9`** → 阶段 B（数据库扩展）→ C（激活服务）→ D/E（支付补强、退款）→ F（通知）→ G（扩展）→ H（网站其余）→ I → J → K。
理由：现在最大的漏洞是"付了钱拿不到/找不回东西、出了问题没人能处理"，这些比激活协议更先决定用户体验与退款率。

### A.6 附加验收（在第 19 节基础上追加）

- [ ] 从真实首页入口（Stripe test mode）：购买 `extension` → 收到邮件（含密钥 + 下载链接）→ 下载 ZIP → 激活 → 退款 → 密钥被吊销 → 再次激活失败
- [ ] 库存耗尽场景：付款 → 订单进入 `INVENTORY_EXHAUSTED` → 管理员收到 ntfy 告警 → 补库存 → 自动/手动重试 → 用户收到邮件
- [ ] 他人拿到成功页 URL（但没有访问令牌）无法看到密钥
- [ ] 成功页在 `semester`、`yearly`、`bundle`、`extension` 四种方案下都能正确渲染（含映射测试）
- [ ] 生产构建中本地模拟路由返回拒绝/不存在；`LOCAL_DEMO` 无法在生产启用
- [ ] 成功页、邮件、条款页指向的客服入口在生产可用并被实际提交测试

### A.7 需要业主确认的商业决策（Codex 先按 A.3 默认值执行，并在 `DECISIONS.md` 与 `HUMAN_TODO.md` 中列出）

1. `core` 密钥是否到期（默认不到期 + 12 个月适配承诺）。
2. `bundle` 是一把合并密钥（默认）还是两把独立密钥。
3. ZIP 公开下载（默认）还是付款后受保护下载。
4. 通知密钥是否必须绑定已激活的 `core`（默认是）。
5. 客服采用自建工单还是外部渠道。

---

## 0. 如何使用本文件

### 0.1 给人类（项目所有者）

1. 把本文件保存为 `docs/CODEX_SPEC.md`，把风险报告保存为 `docs/activation-key-system-risk-report.md`，把现有网站运行逻辑文档保存为 `docs/website-operation-flow-zh.md`。
2. 把下面「0.2 启动指令」整段粘贴给 Codex。
3. Codex 会先做**只读审计**并产出 `docs/AUDIT.md`，**你只需要审阅 AUDIT.md 与 `docs/HUMAN_TODO.md`**，再让它继续。
4. 第 20 节列出了**只有人类能做**的事项（法律、税务、ToyyibPay 验证、真实金额测试等），Codex 无法代办，它会生成清单并追踪。

### 0.2 启动指令（粘贴给 Codex）

```
你是本项目的首席工程师兼发布负责人。请先完整阅读 docs/CODEX_SPEC.md、docs/activation-key-system-risk-report.md
和 docs/website-operation-flow-zh.md（现有网站的完整运行逻辑）。
CODEX_SPEC.md 的「附录 B」（小规模零成本试运营范围）优先级最高，其次是「附录 A」：已经正确的支付/履约代码不要重写，只验证、补测试、扩展；
然后按附录 A.5 调整后的顺序执行。

第一步只做只读审计：阅读整个仓库（网站、扩展、Supabase 迁移/函数、环境变量使用方式、现有密钥与支付逻辑），
对照规格书逐项评估，输出 docs/AUDIT.md（现状、差距、风险、你的修改计划与顺序）。审计完成前不要修改任何代码。

之后按阶段 A→K 执行，每个阶段：先写测试/验收标准 → 实现 → 运行全部测试 → 更新 docs/PROGRESS.md → 提交。
遇到规格书没覆盖的决策，采用第 21 节默认值或你认为最稳妥的方案，并记录到 docs/DECISIONS.md，不要停下来问我，除非被硬性阻塞。
绝不触碰生产环境、绝不把任何密钥写进仓库或日志、绝不声称完成未经测试验证的内容。
最终交付 docs/SCORECARD.md（诚实的自评，附证据）和 docs/HUMAN_TODO.md（只有我能做的事项）。
```

---

## 1. 任务目标与「9.5–10 分」的定义

### 1.1 产品背景（Codex 必须理解）

- 产品：浏览器扩展（ZIP 分发，开发者模式加载），自动打卡功能；**整个扩展必须先用密钥激活才能使用**（防止一个 ZIP 无限人用）。
- 付费增值：**手机通知服务**（订阅制：Semester / Yearly；已移除 Degree Pass），通过 ntfy 推送。
- 销售渠道：① 自建网站（Next.js / Vercel，Stripe + ToyyibPay）；② 368云寄售（卡网，匿名买家，key 为预先上传的库存）。
- 后端：Supabase。目前有**两个 project**（网站 / 卡网密钥池），目标是**合并为一个生产 project + 一个独立 dev project**。
- 运营者：单人，第一次做付费产品。因此**自动化、可观测、可自助、可恢复**是硬性要求。
- 尚未开始售卖：这是做对架构的最佳时机，允许破坏性重构，但必须提供迁移与回滚方案。

### 1.2 评分维度（满分 10，目标每项 ≥ 9.5）

| # | 维度 | 达到 9.5+ 的标志 |
|---|---|---|
| 1 | 授权与激活安全 | 签名令牌、设备绑定、限流、吊销、宽限期、`kill_switch`/`min_version`；无客户端可读的敏感表 |
| 2 | 支付正确性 | Webhook 验签/二次确认、幂等、并发安全、金额币种服务端校验、对账任务 |
| 3 | 退款/争议流程 | 退款/争议自动联动吊销与权益失效；证据自动留存；政策页与同意记录 |
| 4 | 数据与权限 | 统一 schema、RLS 全开且有测试、service_role 不外泄、迁移可重复且可回滚 |
| 5 | 通知链路 | 入队走 Edge Function、双重授权检查、幂等、过期、限流、topic 轮换、失败可见 |
| 6 | 扩展质量 | 激活 UX 完整、离线宽限、远程配置、无密钥内置、错误提示清晰、版本管理 |
| 7 | 网站/商业流程 | 购买→发 key→邮件→激活全链路；条款/隐私/退款页；key 找回；状态页 |
| 8 | 运维与可观测 | 健康检查、结构化日志、告警（含 ntfy 管理员告警）、每日对账、runbook |
| 9 | 测试与 CI | 单元/集成/并发/端到端测试；CI 门禁；覆盖关键路径 |
| 10 | 文档与交接 | README、架构图、运行手册、FAQ、决策记录、人类待办清单 |

> 规则：**没有测试证明的功能，不得自评超过 7 分。** 自评必须诚实，写入 `docs/SCORECARD.md`，并列出每个未满分项的缺口与原因。

---

## 2. 工作规则（不可违反）

1. **先审计、后修改**：阶段 A 只读。
2. **只在 dev 环境工作**：使用 dev Supabase project、Stripe test mode、ToyyibPay 沙盒（若有）。**绝不连接生产库，绝不使用 live 密钥。**
3. **零密钥入库**：不在代码、文档、日志、测试快照、提交信息里出现任何真实密钥；`.env.example` 只放占位符；添加 secret 扫描（如 gitleaks）到 CI。
4. **`service_role`、Stripe 私钥、webhook secret、签名私钥、`KEY_HMAC_SECRET`、加密密钥**只允许出现在服务端环境（Edge Function secrets / Vercel server env）。严禁出现在 ZIP、前端 bundle、`NEXT_PUBLIC_*`。
5. **所有数据库变更用迁移文件**（`supabase/migrations/*.sql`），幂等、有注释、附回滚说明。
6. **所有外部事件处理必须幂等**（webhook、worker、定时任务）。
7. **失败要可见**：任何失败路径都必须落库/落日志并可告警，不允许吞异常。
8. **每个阶段结束**：全部测试通过 → 更新 `docs/PROGRESS.md` → 单独提交（清晰的提交信息）。
9. **不确定就验证，不要猜**：外部 API（Stripe、ToyyibPay、ntfy、Supabase）以**官方文档**为准；若无法访问文档，在代码中用明确的适配层隔离，并在 `docs/DECISIONS.md` 标注"待核实"。
10. **不编造法律文本**：条款/隐私/退款政策可以起草，但每份文档顶部标注「草稿，需律师/专业人士审阅」，并写入 `HUMAN_TODO.md`。
11. **不收集多余数据**：不收集学校账号/密码/Cookie；通知内容最小化；见第 10 节。
12. **保持向后兼容的迁移路径**：现有 key CSV（`bundle_keys.csv`：`key_hash, encrypted_key, plan_type, status`）必须可被安全导入，不得丢失任何已生成的 key。
13. 引入新依赖要克制、选主流库、固定版本，并说明理由。

---

## 3. 阶段计划（A→K，必须按顺序）

| 阶段 | 名称 | 产出 | 通过条件 |
|---|---|---|---|
| **A** | 只读审计 | `docs/AUDIT.md` | 覆盖：仓库结构、现有激活/支付/通知逻辑、两个 Supabase 的表结构、环境变量清单、与本规格的差距表、风险排序、迁移计划 |
| **B** | 数据库与权限 | 迁移文件、RLS、RPC、种子/测试数据 | 所有表 RLS 开启；`anon` 对敏感表零权限（有测试）；迁移在空库上可完整运行；回滚脚本可用 |
| **C** | 密钥与激活服务 | key 工具（CLI）、`activate`/`refresh`/`deactivate`/`status`/`config` Edge Functions、令牌签发/验证库 | 第 17 节中激活相关测试全部通过；并发激活测试通过 |
| **D** | 支付 | Stripe & ToyyibPay 下单、webhook、发 key、订单状态机、邮件 | 支付相关测试全部通过（含重复/乱序/伪造 webhook） |
| **E** | 退款与争议 | 退款/争议处理、吊销联动、证据留存、管理员退款工具 | 退款→吊销→权益失效→topic 轮换 的端到端测试通过 |
| **F** | 通知链路 | 入队函数、`notification-worker`、ntfy 适配层、topic 管理、限流 | 第 10 节全部要求与测试通过 |
| **G** | 扩展改造 | 激活 UI、设备 ID、令牌验证、续期、宽限期、远程配置、安装引导 | 扩展端单元/集成测试通过；手动验收脚本通过 |
| **H** | 网站改造 | 购买流程、成功页、key 找回、状态页、法律页、同意记录 | E2E 测试通过；Lighthouse/无障碍基本达标 |
| **I** | 管理与运维 | 管理后台/脚本、对账、告警、健康检查、监控 | 每日对账可运行并产出报告；告警能到达管理员 ntfy |
| **J** | 测试与 CI 加固 | 完整测试矩阵、CI 门禁、secret 扫描、依赖审计 | CI 全绿；覆盖率关键模块 ≥ 85%（行覆盖） |
| **K** | 文档、验收、自评 | README、Runbook、FAQ、SCORECARD、HUMAN_TODO、发布清单 | 所有文档齐全；SCORECARD 诚实；发布清单逐项勾选 |

---

## 4. 目标架构

```
                 ┌────────── 销售渠道 ──────────┐
   自建网站(Next.js/Vercel)                    卡网(368云寄售)
   Stripe / ToyyibPay                         （预上传 key 库存）
        │ webhook                                   │
        ▼                                           │（无回调；以首次激活为信号）
┌──────────────────── Supabase prod（唯一事实来源）──────────────────┐
│ schema private: orders, payments, webhook_events, license_keys,   │
│   activations, entitlements, notifications(queue), refunds,       │
│   disputes, audit_log, app_config, rate_limits                    │
│ Edge Functions: activate / refresh / deactivate / status /        │
│   config / enqueue-notification / notification-worker /           │
│   webhook-stripe / webhook-toyyibpay / reconcile / ops-alert      │
│ pg_cron: 对账、过期处理、队列清理、心跳缺席扫描                      │
└──────────────┬───────────────────────────────┬───────────────────┘
               │ 签名令牌                        │ ntfy.sh（或自建）
               ▼                                 ▼
        浏览器扩展（ZIP）                    用户手机 ntfy App
        ·激活/续期/宽限                      ·扫码订阅随机 topic
        ·Chrome 本机通知（免费）
```

要点：
- **扩展永远不直接读写任何表**，只调用 Edge Function。
- **签名私钥只在服务端**；扩展内置公钥（支持 `kid` 轮换）。
- 两个渠道的 key 进入**同一张** `license_keys` 表，用 `channel`、`region`、`batch_id` 区分。

---

## 5. 数据库规格

> Codex 负责写出完整、可运行的迁移；以下为必须满足的结构与约束（字段可增不可减）。

### 5.1 核心表

```sql
-- 套餐（从现有代码中的套餐读取，不要自行编造价格）
plans(id, code UNIQUE, product, name, duration_days, price_myr, price_usd, active, created_at)
 -- product: 'core' | 'phone_notify'

orders(
  id uuid PK, public_ref text UNIQUE,         -- 对外展示的订单号（不可猜测）
  email citext, plan_id, channel text,        -- 'website'
  provider text,                              -- 'stripe' | 'toyyibpay'
  provider_ref text,                          -- session/bill code
  status text,                                -- created|pending|paid|fulfilled|failed|refunded|partially_refunded|disputed|cancelled
  amount_minor int, currency text,            -- 以服务端价格表为准
  terms_version text, terms_accepted_at timestamptz, consent_ip_hash text, consent_ua text,
  created_at, updated_at
)

payments(id, order_id, provider, provider_event_id, provider_ref, status, amount_minor, currency, paid_at, raw jsonb)
webhook_events(id, provider, event_id, event_type, received_at, processed_at, status, error, payload jsonb,
               UNIQUE(provider, event_id))      -- 幂等核心

license_keys(
  id uuid PK, key_hash text UNIQUE NOT NULL, hash_version smallint NOT NULL,
  encrypted_key text NULL,                      -- 仅服务端可解；见 7.4
  channel text, region text,                    -- 'website'|'kawang'; 'cn'|'global'
  batch_id text, plan_id,
  status text,                                  -- generated|listed|sold|activated|expired|revoked|refunded
  order_id uuid NULL, listed_at, sold_at, first_activated_at, activate_by timestamptz NULL,
  valid_until timestamptz NULL, max_devices smallint DEFAULT 2,
  revoked_reason text NULL, created_at, updated_at
)

activations(id, key_id, device_id_hash, first_seen_at, last_seen_at, last_ip_hash, app_version, status,
            UNIQUE(key_id, device_id_hash))

entitlements(
  id, key_id, feature text,                     -- 'core'|'phone_notify'
  valid_from, valid_until, status,              -- active|expired|revoked
  source_order_id, notify_topic text UNIQUE NULL, notify_rotated_at, daily_notify_cap int DEFAULT 60
)

notifications(
  id, entitlement_id, idempotency_key text UNIQUE, kind text, title text, body text,
  status text,                                  -- queued|sending|sent|failed|dropped|expired
  attempts int, next_attempt_at, expires_at, last_error, created_at, sent_at
)

refunds(id, order_id, provider, provider_ref, amount_minor, currency, reason, initiated_by, created_at)
disputes(id, order_id, provider, provider_ref, status, amount_minor, opened_at, due_by, evidence_state, closed_at)
audit_log(id, at, actor, action, entity, entity_id, meta jsonb)    -- 追加写入；普通角色不可改删
app_config(key PK, value jsonb, updated_at)                          -- 远程配置
rate_limits(bucket text, window_start, count)                         -- 或使用更合适的实现
heartbeats(entitlement_id, last_seen_at, expected_window jsonb)       -- 缺席告警用（可选功能，默认关闭）
```

### 5.2 必须满足的约束与规则

1. **RLS 全部开启**；`private` schema 对 `anon`/`authenticated` 不授予任何权限；仅 `service_role`（Edge Function 内）与 `SECURITY DEFINER` 的受控 RPC 可访问。
2. 状态机转换用**数据库函数**实现，不允许应用层随意 `UPDATE status`。非法转换（如 `refunded → activated`）必须抛错并写 `audit_log`。
3. **key 分配**（网站购买后）使用 `SELECT ... FOR UPDATE SKIP LOCKED` 从 `listed` 的网站渠道库存取一个，保证并发下不重复分配；库存低于阈值时告警。
4. `audit_log` 触发器写入关键状态变化；禁止 `UPDATE/DELETE`。
5. 所有时间使用 `timestamptz`（UTC）；**一切有效期以服务端时间为准**。
6. 为常用查询建立索引（`license_keys.status`、`orders.provider_ref`、`notifications(status, next_attempt_at)` 等）。
7. 提供 `supabase/seed.sql`（仅 dev，含测试套餐与测试 key）。

### 5.3 项目合并与迁移

- 编写 `docs/MIGRATION_PLAN.md`：从两个旧 project 合并到新 prod 的步骤、核对 SQL、回滚方案、切换窗口。
- CSV 导入：先导入**全为 text 的 staging 表**，再清洗并 `INSERT ... SELECT` 到 `license_keys`；对**行数、状态分布、hash 唯一性、渠道/区域数量**做核对并输出报告（`scripts/import-keys.ts`，带 `--dry-run`）。
- **兼容既有 hash 方案**：先审计现有 `key_hash` 的算法。若为无盐/无 pepper 的简单哈希，则增加 `hash_version`，支持过渡期验证；并提供**由人类执行**的重新哈希脚本（需要持有加密密钥/明文），Codex 不得假设能拿到明文。

---

## 6. 令牌与激活协议规格

### 6.1 令牌

- 格式：紧凑 JWS（`alg: EdDSA`，Ed25519），头部含 `kid`。
- Claims：`sub`(key_id)、`did`(device_id_hash)、`plan`、`feat`(['core','phone_notify'])、`iat`、`exp`(默认 7 天)、`ver`(令牌格式版本)、`min_app`。
- 签发：仅在 Edge Function；私钥来自 secret；**支持多个 `kid`** 以便轮换（扩展内置当前与下一个公钥）。
- 验证（扩展）：使用 WebCrypto（若目标 Chrome 版本支持 Ed25519）或固定版本的 `@noble/ed25519`；**验证失败 = 视为未激活**。

### 6.2 端点（均为 Edge Function，输入严格校验，输出统一错误码，不泄漏内部细节）

| 端点 | 作用 | 要点 |
|---|---|---|
| `POST /activate` | `{key, device_id, app_version}` → 令牌 | 通过 `SECURITY DEFINER` RPC 在**单事务**内：校验 key → 行级锁 → 检查状态/有效期/设备数 → 绑定设备 → 首次激活时写 `first_activated_at`、设置 `valid_until`（`now() + plan.duration_days`，若已设置则沿用）→ 写审计。返回令牌与到期信息。 |
| `POST /refresh` | 旧令牌 → 新令牌 | 校验令牌签名、设备、key 状态（未吊销/未过期）；返回新令牌 + 远程配置摘要 |
| `POST /deactivate` | 用户自助解绑设备 | 限次（默认每 30 天 2 次）；写审计 |
| `GET /status` | 查询 key 状态（限流） | 需要 key 或令牌；仅返回必要信息（有效期、已绑定设备数、功能） |
| `GET /config` | 返回 `app_config` 的公开部分 | 支持 ETag/缓存；见第 11 节 |

### 6.3 错误响应与反枚举

- 不区分"key 不存在"与"key 无效/已被占用"的可枚举差异（统一 `INVALID_KEY`），但**对真实持有者**通过 `status` 接口（带令牌）给出明确原因。
- 所有端点按 **IP + 设备 + key 前缀** 多维限流；连续失败指数退避；写 `audit_log`/`rate_limits`。
- 请求体大小限制、CORS 仅允许必要来源（扩展 origin 与站点）。

### 6.4 宽限与离线

- 令牌 `exp` 之后仍有**宽限期**（默认 72 小时）：功能可用，但扩展内显示"请联网续期"。
- 续期失败**不立即锁定**；超过宽限期才锁定，并给出清晰指引（联系方式/状态页）。
- 服务端宕机时，已激活用户在令牌+宽限期内不受影响（**测试必须覆盖**）。

---

## 7. 密钥生成与管理规格

### 7.1 Key 格式

- 20 个字符 Crockford Base32（去掉易混淆字符）+ 1 位校验字符，展示为 `XXXXX-XXXXX-XXXXX-XXXXX-X`；熵 ≥ 100 bit；使用 CSPRNG。
- 客户端先做格式与校验位检查，减少无效请求。

### 7.2 存储

- 只存 `HMAC-SHA256(key, KEY_HMAC_SECRET)`（`hash_version=2`）。
- 日志、错误、审计中**永远不出现完整 key**（最多显示后 4 位）。

### 7.3 批次工具（`scripts/keys/`）

- `generate --plan <code> --channel <website|kawang> --region <cn|global> --count N --batch <id>`：生成 key、写库（`generated→listed`）、输出**明文批次文件**（仅本机；文件权限 600；提醒加密归档并在上传后销毁）。
- `export-kawang --batch <id>`：生成适合上传 368云寄售 的格式。
- `revoke-batch --batch <id> --reason ...`：整批吊销（泄漏应急）。
- `stats`：库存、已售、已激活、已退款、临近激活截止期的数量。
- `verify-import`：核对 CSV 与库内数据。
- 所有脚本需要 `--dry-run` 与二次确认（对破坏性操作）。

### 7.4 `encrypted_key` 的使用边界

- 仅用于"**邮件/找回页重新展示 key**"，用 AES-256-GCM（服务端密钥来自 secret，含随机 nonce 与版本号）；**解密只发生在服务端**，且需要订单所有权校验与限流。
- 如判断没有必要，Codex 应在 `DECISIONS.md` 中建议删除该列，并提供"仅一次性展示 + 邮件发送"的替代方案。

### 7.5 卡网渠道规则

- 卡网 key 在首次激活时才被服务端"看见"：`listed → sold(推断) → activated`。
- 支持 `activate_by`（批次级别，默认上架后 180 天，可配置）；过期未激活的 key 在 `stats` 中告警，由人类决定是否作废。
- 提供 `reconcile-kawang` 报告：对比"人工录入的卡网销量"与"已激活数"（卡网无 API 则为 CSV 手工导入）。

---

## 8. 支付规格

### 8.1 通用

1. **服务端定价**：价格、币种、套餐时长全部来自 `plans`，不信任前端传值。
2. **订单状态机**（数据库函数实现）：`created → pending → paid → fulfilled`；分支：`failed`、`cancelled`、`refunded`、`partially_refunded`、`disputed`。
3. **履约（发 key/开权益）**只在 `paid` 且首次进入时发生一次；履约函数幂等（订单 ID 唯一约束）。
4. **成功页只是展示**：成功页轮询订单状态（`paid/fulfilled` 后展示 key），**不得**作为发货依据。
5. 同意条款：下单前必须勾选；记录 `terms_version`、时间戳、IP 哈希、UA。
6. 邮件：履约后发送包含 key、激活指引、退款政策链接的邮件（适配层，默认 Resend，可替换；发送失败进入重试并告警）。
7. 防重复下单：同一邮箱+套餐在短时间内的未完成订单复用；对订单创建接口限流。

### 8.2 Stripe

- 使用 **Checkout Session**；订单 ID 写入 `metadata` 与 `client_reference_id`；设置清晰的 **statement descriptor**。
- Webhook：**用原始请求体验签**；处理至少以下事件：`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`charge.refunded`、`charge.dispute.created`、`charge.dispute.updated`、`charge.dispute.closed`。
- 校验：事件里的金额/币种/订单 ID 与库内订单一致，否则标记异常并告警，**不履约**。
- 所有对 Stripe 的写 API 调用使用 **Idempotency-Key**。
- 乱序容忍：例如先收到 `charge.refunded` 后才收到 `completed`，不得崩溃或错误履约。

### 8.3 ToyyibPay

- 以**官方文档**为准实现创建账单（Bill）、返回页、回调。**回调参数视为不可信**。
- 收到回调或用户返回页后，服务端**主动调用官方接口查询该账单的交易状态**，并核对：订单号/金额/币种/状态，全部一致才标记 `paid`。
- 未验证账户的限制（结算延迟）：在管理后台与 `HUMAN_TODO` 中明确提示；未验证期间提供一个**环境开关**，可关闭 ToyyibPay 入口。
- 仅 MYR；前端按币种/地区展示可用支付方式，避免用户选到不可用的组合。
- 退款：若 API 不支持程序化退款，则管理后台提供"待人工退款"队列（含订单信息与操作指引），人工确认后调用统一的"退款完成"入口，触发吊销联动。

### 8.4 价格与手续费

- 提供 `docs/PRICING_MODEL.md` 与脚本（`scripts/pricing-model`）：输入客单价、渠道手续费、退款率、争议率，输出每单净收益与盈亏平衡点。费率作为配置项，**不要硬编码为"事实"**，并标注"需人类核实"。

---

## 9. 退款、争议与吊销规格

### 9.1 统一入口 `process_refund(order_id, amount, reason, source)`

数据库函数/服务端模块，**所有渠道的退款都走它**，保证：

1. 订单 → `refunded`/`partially_refunded`；写 `refunds`、`audit_log`。
2. 对应 key → `refunded`/`revoked`；设备绑定失效。
3. 对应 `entitlements` → `revoked`（core 与 phone_notify 均失效）。
4. 通知链路：**轮换 `notify_topic`**，并 `dropped` 该权益下未发送的通知。
5. 令牌自然过期（≤7 天）+ 下次 `refresh` 失败；`config` 中可对特定 key 立即吊销（可选的实时吊销列表，默认 5 分钟缓存）。
6. 给用户发送退款确认邮件。
7. 给管理员发 ntfy 告警（金额、订单号、原因）。

### 9.2 争议（Stripe）

- `charge.dispute.created`：订单 → `disputed`；key 立即 `revoked`（可配置）；创建 `disputes` 记录与截止日期；告警管理员。
- **证据自动留存**：自动汇总证据包（订单时间、金额、同意条款版本与时间戳、key 发放时间、首次激活时间/设备/IP 哈希、使用记录摘要、客服往来链接），在管理后台一键导出 PDF/JSON，用于提交 Stripe。
- 提供"**主动退款以避免争议**"的快捷入口（`refund-now`）。

### 9.3 退款政策的系统化

- 退款资格由配置驱动（`app_config.refund_policy`：天数、是否要求未激活、例外规则）；后台显示每个订单"是否在政策内"。
- 购买页、成功页、邮件、条款页**都展示同一份政策**（单一来源）。

---

## 10. 通知链路规格（ntfy）

> 对应报告 7.5、7.6 节（N1–N9、Q1–Q11）。

### 10.1 数据流

```
扩展 → POST /enqueue-notification（带签名令牌）→ notifications(queued)
     → notification-worker（入队触发 + 低频 cron 兜底）→ ntfy 发布 → sent
```

### 10.2 必须实现

1. **入队只能走 Edge Function**：队列表对 `anon` 零权限；函数验证令牌签名、设备、`feat` 含 `phone_notify`、权益有效。
2. **双重授权检查**：入队时一次，**发送前再查一次** `entitlements`；失效则 `dropped` 并记录原因。
3. **幂等**：`idempotency_key = hash(entitlement_id + 事件ID)`；重复入队返回同一条；worker 领取使用原子更新/`SKIP LOCKED`。
4. **状态机**：`queued → sending → sent | failed | dropped | expired`；失败按指数退避重试（上限 N 次），最终 `failed` 并告警聚合。
5. **过期**：`expires_at` 默认 20 分钟；过期不发送。
6. **限流与上限**：每权益每日上限（默认 60，配置化）、每令牌每分钟入队上限、队列总长度上限；超限丢弃并计数；异常飙升自动暂停该权益并告警。
7. **topic 安全**：`notify_topic` 为 CSPRNG 生成、≥128 bit、URL-safe；与 key/邮箱/学号**无可推导关系**；退款/到期/滥用时**轮换**。
8. **二维码**：由服务端在校验权益后下发 topic（经 `status`/`refresh` 的响应），扩展用其生成二维码；二维码使用 `ntfy://` 或官方推荐的订阅链接形式（Codex 以官方文档为准）；不在扩展本地推导 topic。
9. **通知内容最小化**：只含类型（成功/失败/提醒）、时间、通用文案；**严禁**学号、姓名、账号、完整课程名；`body` 长度限制并做字符清洗。
10. **ntfy 适配层**：封装发布（超时、重试、错误码映射、429/5xx 退避）；支持**带认证令牌发布**与**自建实例**切换（环境变量），默认指向 ntfy.sh；发布令牌只在服务端。
11. **可观测**：队列积压长度、最老消息年龄、发送成功率、失败原因分布；超过阈值告警。
12. **数据保留**：`sent/failed/dropped/expired` 记录 ≤ 30 天后清理（cron），审计级摘要可保留。
13. **UI 诚实**：后台显示"已发送"，不宣称"已送达"；条款中为"尽力而为"。
14. **缺席告警（可选，默认关闭，feature flag）**：扩展定时发送心跳到服务端；若在预期时间窗内缺失，由服务端触发一条提醒。实现但默认不开启，并在 `DECISIONS.md` 说明开启步骤。

### 10.3 ntfy 基础设施预案

- 起步版：公共 ntfy.sh + 随机 topic + 服务端转发 + 退款轮换。
- 加固版文档（`docs/NTFY_SELF_HOST.md`）：自建 ntfy + 认证/ACL + iOS 上游转发 + 反向代理 + 备份的步骤与注意事项（作为升级路径，不要求现在部署）。
- 压测脚本：模拟 N 个权益同时入队，验证 ntfy 限流/延迟，输出报告。

---

## 11. 远程配置、版本与紧急开关

`app_config` 中的公开键（通过 `/config` 返回，签名或带版本号）：

```json
{
  "min_version": "x.y.z",
  "latest_version": "x.y.z",
  "announcement": { "level": "info|warn|critical", "text_zh": "", "text_en": "", "link": "" },
  "kill_switch": { "global": false, "features": { "phone_notify": false } },
  "maintenance": { "active": false, "message": "" },
  "refund_policy": { "...": "与服务端一致的只读展示" },
  "revoked_key_ids": []
}
```

- 扩展在启动与每次续期时拉取；失败则使用最近一次缓存（有 TTL）。
- `min_version` 低于要求 → 扩展提示强制更新并**限制使用**（带下载链接）。
- `kill_switch.global` 为 true → 扩展停用并展示公告（用于投诉/事故应急）。
- 管理后台提供这些开关的安全修改入口（带审计、二次确认）。

---

## 12. 扩展改造规格

1. **激活流程 UI**：首次打开 → 输入 key（格式化、校验位、粘贴友好）→ 激活 → 成功页展示有效期与功能；失败提示**可操作**（"网络问题/key 无效/已绑定设备过多/已过期/已退款/需更新版本"）。
2. **未激活状态**：所有功能（包括自动打卡）锁定；界面清晰展示购买入口（网站 + 卡网链接，可配置）。
3. **设备 ID**：首次生成本地随机 UUID 存于扩展存储；服务端只收其哈希；不采集个人信息。
4. **令牌存储与验证**：存于扩展存储；每次启动与关键操作前验证签名与 `exp`；内置公钥（`kid` 列表）。
5. **续期**：后台定时（默认每 24 小时）静默 `refresh`；失败重试退避；进入宽限期后在界面提示。
6. **功能授权**：`core` 与 `phone_notify` 分别门控；**打卡功能所需的服务端参数（如适配配置）可选地由服务端令牌/配置下发**，提高破解成本（在 `DECISIONS.md` 说明取舍）。
7. **手机通知设置页**：显示二维码、订阅状态说明、"测试通知"按钮（受限流）、"重置/更换手机（轮换 topic）"入口（限次）、省电设置 FAQ。
8. **通知队列同步**：仅调用 `/enqueue-notification`；本地缓冲失败的事件并重试（有上限与过期）。
9. **Chrome 本机通知**：保持为独立路径、始终免费，不依赖服务端。
10. **隐私**：不上传学校账号/密码/Cookie；上传字段白名单；提供"隐私说明"页并在激活时展示摘要。
11. **安装引导**：图文步骤（开发者模式、加载已解压扩展、固定到工具栏、常见弹窗提示的解释）；内置"诊断信息复制"按钮（版本、令牌状态、最近错误码；**不含 key 与令牌原文**）。
12. **版本与更新**：显示当前版本；`latest_version` 更高时提示更新与更新日志；`min_version` 强制。
13. **构建**：构建流程输出带版本号的 ZIP；构建脚本检查**包内不含任何私钥/`service_role`/`.env`**；产物哈希写入发布清单。
14. **可选混淆/压缩**：作为构建步骤（不得破坏功能），并在 `DECISIONS.md` 说明仅为拖慢破解而非安全保证。
15. **错误码字典**：统一错误码与用户文案（中/英），便于客服排查。

---

## 13. 网站改造规格

1. **购买流程**：套餐选择 → 邮箱 → 勾选条款 → 选择支付方式（按币种/地区显示可用项）→ 支付 → 成功页（轮询订单状态，展示 key、复制按钮、激活指引、下载链接、退款政策、客服入口）。
2. **成功页**：保持你已有的双栏与票据风格方向；**状态驱动**（pending/paid/fulfilled/failed 都有明确 UI）；刷新/重复访问不会重复发 key；key 只对订单持有者可见（通过一次性链接/订单 token）。
3. **key 找回**：输入邮箱 → 发送带限时链接的邮件 → 查看订单与 key（限流、不泄漏邮箱是否存在）。
4. **状态/公告页**：读取 `/config` 与健康检查，展示服务状态、目标站适配状态、公告。
5. **法律页**：服务条款、隐私政策、退款政策、免责声明（含"尽力而为/不保证打卡成功/用户须自行遵守所在机构规定"）；每页顶部标注「草稿，需专业审阅」；统一版本号并与同意记录联动。
6. **多语言**：至少中/英；文案集中管理。
7. **卡网引导页**：为卡网买家提供"我在卡网购买了"的激活指引页（如何下载 ZIP、如何激活、联系客服）。
8. **性能与可访问性**：保持你既有的 60fps 目标；成功页与结账页在笔记本屏幕无需滚动即可看到关键信息；基础无障碍（对比度、键盘可达、aria）。
9. **环境变量管理**：集中校验（启动时用 schema 校验必填变量，缺失则**明确报错且不静默降级**）；提供 `docs/ENV.md` 列出每个变量、用途、是否敏感、在哪个环境配置；解决你此前遇到的 `*_NOT_CONFIGURED` 类问题。
10. **支付方式开关**：通过配置/环境变量可单独关闭 Stripe 或 ToyyibPay（出现事故时快速止损）。

---

## 14. 管理与运维工具

### 14.1 管理后台（仅管理员；Supabase Auth + 强制 MFA + 邮箱白名单；所有操作写 `audit_log`）

- 订单列表/搜索（邮箱、订单号、provider_ref）；订单详情页（时间线：下单→支付→履约→激活→退款/争议）。
- key 查询（输入 key 或后 4 位+订单）：状态、设备、有效期；操作：**吊销、解绑设备、延长有效期（补偿）、重发邮件、标记批次**。
- 退款：发起（Stripe 程序化 / ToyyibPay 待人工队列）、查看政策资格。
- 争议：列表、截止日期、证据包导出、"主动退款"。
- 通知：队列健康、失败列表、权益通知开关、**轮换 topic**、发测试通知。
- 库存：各渠道/区域/套餐的 key 库存与告警阈值；卡网批次与激活截止期。
- 远程配置：公告、`min_version`、`kill_switch`（二次确认 + 审计）。
- 对账报告：每日结果与差异。

### 14.2 对账（`reconcile` 函数 + pg_cron，每日一次；也可手动触发）

检查并输出报告（落库 + 管理员 ntfy 摘要）：
1. 已付款但未履约的订单；
2. 已履约但缺少 key/权益的订单；
3. 已退款但 key/权益仍有效；
4. Stripe 事件与本地 `payments` 差异（按时间窗拉取核对）；
5. 队列积压/卡在 `sending` 的记录；
6. 库存低于阈值；
7. 同一 key 绑定设备异常（超限尝试、短时间多地）；
8. 临近到期的权益（用于续费提醒，可选）。

### 14.3 健康检查与告警

- `GET /api/health`（站点）与 Edge Function 健康端点：检查 DB 连通、最近一次 worker 运行时间、队列最老消息年龄。
- 外部探活（文档指导配置 UptimeRobot 之类；Codex 提供需监控的 URL 列表与阈值）。
- **管理员告警通道**：使用**独立的**管理员 ntfy topic（与用户 topic 完全分离、随机、仅存于服务端 secret）；告警分级（info/warn/critical）并去重/节流，避免告警风暴。
- 日志：结构化 JSON（含 request_id、order_id/key_id 后缀等**非敏感**关联字段）；严禁记录完整 key、令牌、支付敏感信息。

---

## 15. 安全规格

1. **输入校验**：所有 Edge Function 与 API 路由使用 schema 校验（如 zod）；拒绝多余字段；限制大小。
2. **认证与授权**：管理接口强制管理员身份 + MFA；公开接口统一限流。
3. **CORS/CSRF/Headers**：严格 CORS；站点设置 CSP、HSTS、X-Content-Type-Options、Referrer-Policy 等安全响应头。
4. **机密管理**：`docs/SECRETS.md` 列出所有机密、存放位置、轮换流程（含签名私钥 `kid` 轮换、webhook secret 轮换、HMAC pepper 轮换策略——pepper 轮换需配合 `hash_version`）。
5. **依赖安全**：`npm audit`/Dependabot；锁定版本；CI 中失败阈值。
6. **Secret 扫描**：CI 集成 gitleaks 类工具；预提交钩子。
7. **时序/枚举**：比较使用常量时间；错误信息不可枚举。
8. **备份与恢复**：文档化 Pro 备份与恢复流程；提供一次**恢复演练**的脚本与步骤（`docs/RESTORE_DRILL.md`）。
9. **最小权限**：为不同函数使用最小权限的数据库角色（如适用）。
10. **威胁模型**：`docs/THREAT_MODEL.md`（资产、攻击者、入口、已缓解/残留风险），覆盖：key 泄漏、webhook 伪造、令牌伪造、暴力枚举、topic 泄漏/转发、破解版扩展、内部凭证泄漏、DoS/刷队列。

---

## 16. 与目标网站/用户相关的边界要求（产品诚实性）

1. 所有对外文案（网站、商品页、邮件、条款）**必须与真实功能一致**，不得承诺"保证成功"。
2. 扩展**不上传**用户的学校账号/密码/Cookie；若现有代码有此行为，在审计中标红并移除。
3. 提供"紧急停用"流程文档（`docs/RUNBOOK.md`）：接到投诉/通知时，如何在 24 小时内关闭商品页、启用 `kill_switch`、通知用户。
4. 条款中包含：用户须遵守其所在机构规定、使用后果由用户自行承担、服务"尽力而为"、目标系统变更可能导致服务暂时不可用及补偿方式（默认：延长有效期而非退款，可配置）。（需专业审阅）

---

## 17. 测试规格（必须实现并通过）

### 17.1 数据库与权限
- RLS：`anon`/`authenticated` 对 `private.*` 的 `select/insert/update/delete` 全部失败（逐表测试）。
- 状态机：非法转换被拒绝并审计。
- 并发：N 个并发请求分配同一库存/激活同一 key，结果唯一且一致。

### 17.2 激活
- 正常激活；重复激活同设备幂等；超过 `max_devices` 被拒；解绑后可再激活；解绑次数限制。
- 过期、吊销、退款后：`activate`/`refresh` 失败且错误码正确。
- 令牌：伪造/篡改/过期/错误 `kid`/错误设备 → 全部被拒；轮换 `kid` 后新旧令牌均按规则处理。
- 限流：暴力尝试触发退避；错误信息不可枚举。
- 宽限期：服务端不可用时，令牌过期后 72 小时内仍可用，之后锁定。

### 17.3 支付
- Stripe：验签失败拒绝；重复事件只履约一次；乱序事件；金额/币种不一致不履约；`async_payment_failed`；`expired`。
- ToyyibPay：伪造回调（官方查询结果为未付款）不履约；回调重复；金额不符；返回页与回调竞态。
- 并发：同一订单被两个 webhook 同时处理，只发一个 key。
- 成功页刷新/多次访问不重复发 key；非订单持有者无法查看 key。

### 17.4 退款与争议
- 全额/部分退款 → key 吊销、权益失效、topic 轮换、未发送通知被丢弃、邮件与告警触发。
- 争议创建/关闭流程；证据包内容完整且不含敏感字段。
- 退款后再次激活被拒。

### 17.5 通知
- 无 `phone_notify` 权益 → 入队失败；`anon` 直接写队列表失败。
- 入队后退款 → 发送前被丢弃。
- 重复入队/重复领取 → 只发一条；过期不发；ntfy 429/5xx → 退避重试 → 最终 `failed` 并可见。
- 限流与每日上限生效；topic 轮换后旧 topic 不再收到新消息；通知正文不含禁用字段（字段白名单测试）。

### 17.6 扩展
- 激活 UI 状态覆盖；离线/宽限；强制更新；`kill_switch`；二维码生成；诊断信息不含 key/令牌；包内无机密（构建后扫描）。

### 17.7 端到端（含 Stripe test mode 的完整流程；ToyyibPay 可用 mock 适配器 + 官方沙盒指引）
- 购买 → 发 key → 邮件 → 激活 → 手机通知开通 → 通知送达（mock ntfy）→ 退款 → 吊销 → 再激活失败。
- 卡网渠道：导入批次 → 首次激活 → 对账报告。

### 17.8 CI 门禁
- lint、类型检查、单元/集成测试、迁移在空库可运行、secret 扫描、依赖审计、构建 ZIP 并扫描、关键模块覆盖率 ≥ 85%。

---

## 18. 文档交付物（全部放 `docs/`）

| 文件 | 内容 |
|---|---|
| `AUDIT.md` | 阶段 A 审计结果 |
| `PROGRESS.md` | 各阶段进展与提交记录 |
| `DECISIONS.md` | 所有决策（含默认值取舍、待核实项） |
| `ARCHITECTURE.md` | 架构图、数据流、状态机、时序图（Mermaid） |
| `MIGRATION_PLAN.md` | 两个 Supabase 合并步骤、核对与回滚 |
| `ENV.md`、`SECRETS.md` | 环境变量与机密管理、轮换流程 |
| `THREAT_MODEL.md` | 威胁模型 |
| `RUNBOOK.md` | 运行手册：常见事故（支付商宕机、Supabase 故障、worker 卡住、key 泄漏、目标站改版、投诉/紧急停用、批量退款）的处理步骤 |
| `SUPPORT_FAQ.md` | 客服 FAQ（激活失败、换设备、开发者模式提示、打卡没成功、退款、卡网买家、通知收不到）与可复制话术 |
| `PRICING_MODEL.md` | 手续费/退款/盈亏平衡模型 |
| `RESTORE_DRILL.md` | 备份恢复演练 |
| `NTFY_SELF_HOST.md` | 升级到自建 ntfy 的指南 |
| `RELEASE_CHECKLIST.md` | 发布前逐项核对（含人类事项） |
| `SCORECARD.md` | 诚实自评（逐维度 0–10，附证据与缺口） |
| `HUMAN_TODO.md` | 只有人类能做的事项与状态追踪 |
| `LEGAL_DRAFTS/` | 条款/隐私/退款政策草稿（顶部标注需专业审阅） |

---

## 19. 最终验收清单（Definition of Done）

- [ ] 阶段 A–K 全部完成，`PROGRESS.md` 与提交记录一致
- [ ] CI 全绿；第 17 节所有测试存在且通过
- [ ] dev 环境完整走通"购买→激活→通知→退款→吊销"（Stripe test mode）
- [ ] 仓库与扩展 ZIP 经扫描**不含任何机密**
- [ ] `anon` 无法读取/写入任何敏感表（自动化测试证明）
- [ ] Webhook 幂等/验签/二次确认均有测试证明
- [ ] 退款与争议联动全部自动化
- [ ] 对账任务可运行并产出报告；管理员告警能收到
- [ ] 远程配置（`min_version`/`kill_switch`/公告）生效且有测试
- [ ] 通知链路满足第 10 节全部条目
- [ ] 文档齐全；`RUNBOOK.md` 覆盖所有列出的事故场景
- [ ] `SCORECARD.md` 诚实，每个未满分项有明确缺口说明
- [ ] `HUMAN_TODO.md` 完整、可执行、带优先级

---

## 20. 只有人类能做的事项（Codex 必须生成清单并追踪，不得假装完成）

Codex 应把以下事项写入 `docs/HUMAN_TODO.md`，每项给出：为什么重要、具体步骤、验收标准、优先级、阻塞哪些发布环节。

| 优先级 | 事项 | 说明 |
|---|---|---|
| P0 | 创建/升级 Supabase **Pro** 生产 project，并开启备份 | Free 会因 7 天无活动暂停 |
| P0 | 配置生产环境机密（Edge Function secrets、Vercel 环境变量），**不要**通过聊天/截图传递 | |
| P0 | 生成并安全保管签名私钥、`KEY_HMAC_SECRET`、加密密钥；备份到离线位置 | 丢失将导致已发 key/令牌无法验证 |
| P0 | 为所有账号开启 2FA：Supabase、Vercel、Stripe、ToyyibPay、GitHub、域名、邮箱 | |
| P0 | 完成 ToyyibPay 账号验证，并做一笔小额真实交易验证结算 | 验证前不要大规模推广 |
| P0 | Stripe 生产账户启用与审核；阅读各支付商/卡网的**受限/禁止业务条款**并自行判断 | |
| P0 | 用真实小额金额完整走一遍 live 流程（购买→激活→退款），并验证邮件到达 | Codex 无法使用 live 资金 |
| P0 | 律师/专业人士审阅条款、隐私政策、退款政策、免责声明 | 起草的文本只是草稿 |
| P1 | 评估目标签到系统的使用条款与风险；决定产品定位与对外措辞 | |
| P1 | 税务与主体：个人/公司、收入申报、SST 等，咨询会计 | |
| P1 | 在 368云寄售 创建商品：上传批次、写清退款说明与联系方式；核实其费率、提现周期、规则 | |
| P1 | 决定退款政策的具体数值（天数/是否要求未激活）并写入配置 | 默认值见第 21 节 |
| P1 | 配置外部探活与管理员 ntfy topic（手机订阅） | |
| P1 | 完成一次**备份恢复演练** | |
| P1 | 对接 ntfy：确认限额；必要时购买计划或自建 | |
| P2 | 准备应急预案演练（模拟"紧急停用"） | |
| P2 | 第三个备用支付渠道评估 | |

---

## 21. 默认决策（规格书未规定时采用；Codex 须写入 `DECISIONS.md` 且全部做成可配置）

| 项 | 默认值 |
|---|---|
| 每个 key 最大设备数 | 2 |
| 自助解绑次数 | 每 30 天 2 次 |
| 令牌有效期 `exp` | 7 天 |
| 续期频率 | 每 24 小时 |
| 宽限期 | 72 小时 |
| 卡网批次 `activate_by` | 上架后 180 天 |
| 退款政策默认 | 购买后 7 天内且未激活可退；已激活默认不退（需人类确认并写入条款） |
| 目标站故障补偿 | 延长有效期（默认 +7 天，可配置） |
| 通知过期时间 | 20 分钟 |
| 每权益每日通知上限 | 60 |
| 通知记录保留 | 30 天 |
| 对账频率 | 每日一次（UTC 02:00 之外时段可调整） |
| 实时吊销列表缓存 | 5 分钟 |
| 管理员告警去重窗口 | 10 分钟 |
| 激活接口限流 | 每 IP 每分钟 10 次；每 key 前缀每小时 20 次失败后退避 |
| 登录/管理 | 仅邮箱白名单 + 强制 MFA |
| 默认语言 | 中文，提供英文 |

---

## 22. 给 Codex 的最后提醒

1. **质量优先于速度**：宁可少做一个功能，也不要引入未经测试的支付/授权代码。
2. **每一个"我认为能工作"都要被测试证明**。
3. **诚实**：SCORECARD 里写真实分数；做不到的写清楚原因和替代方案。
4. **不要为了"看起来完整"而编造**外部 API 行为；以官方文档为准，不确定处标注并隔离。
5. 完成后，用一页纸总结：**做了什么、没做什么、人类还必须做什么、上线前最危险的三件事**。
