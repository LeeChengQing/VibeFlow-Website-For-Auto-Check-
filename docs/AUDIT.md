# 发布前只读审计

日期：2026-10-06（Asia/Kuala_Lumpur）。权威规格：`CODEX_SPEC.md`，附录 A 优先；风险报告与网站运行报告是审计输入，源码是现状证据。

## 审计结论与边界

已完成两个源码仓库的静态审计：网站 `C:\Auto-Check Website` 与业主补充的扩展 `C:\自动打卡系统`。这不是一份上线通过证明。审计未运行测试、构建、生成密钥、支付请求、SQL 或部署；未连接任何生产数据库/支付商；未输出环境变量值、密钥、哈希、密文或令牌。现有云端状态、商户配置、定时任务与实际送达均未核实。

现有网站的定价、主要支付验签和原子分配是值得保留的基础。整个产品仍未满足新商业计划：主扩展本机自动执行不需要 core 激活，网站 extension 订单也明确不分配密钥。网站与扩展的库存、授权及退款没有统一事实来源；买家交付、授权、通知与售后的闭环未完成。下一步应按附录 A.5，先在隔离测试环境补齐商业 P0，再做 B–K 的完整授权与发布加固。

**审计阶段现已结束；实现可以开始。以下所列“已有测试”仅表示文件存在和测试意图已读，不表示本次通过。** 阶段 A 的验收是源码/规格覆盖与证据核对；第一次应用全量基线必须先隔离环境，不能直接运行会继承云端凭据的现有命令。

## 1. 源码范围、基线与原有改动

| 来源 | 基线提交 | 主要范围 |
|---|---|---|
| 网站 Source-W | `48e7a0ad2887a86ad19e8217d8ee37ce4b76d292` | Next.js 页面/API、React 组件、lib、8 个 SQL 迁移、2 个脚本、46 个测试目录文件、配置/文档 |
| 扩展 Source-E | `58d16ffcd2afa503725403b514b22fdaafb807b7` | src、MV3 生成包、构建/打包脚本、7 个主后端迁移、3 个主 Edge Functions、SQL/Deno/Node/browser tests、独立 license-security 原型 |

网站审计前已修改：`app/page.tsx`、`components/Homepage.tsx`、`components/SiteConfigProvider.tsx`、`next-env.d.ts`、`tests/checkout-e2e/storefront.spec.ts`、`tests/storefront-settings.test.ts`。三份任务输入文档未跟踪。

扩展审计前已修改：`package.json`、`supabase/functions/device-api/index.ts`。未跟踪的原有文件包括两份部署/防分享文档、`project_context.md`、device-api smoke 脚本、`recovery-code.ts`/`.deno.ts`、一个 ZIP hash sidecar。它们属于业主现有工作，不得覆盖或误归为本任务变更。

阅读范围包括第一方源码、迁移、函数、配置、脚本、现有测试与有关文档；依赖/二进制/备份不作为第一方实现逐行审查。密钥 CSV 仅安全检查表头、行数与字段格式/聚合，原码文件仅统计行数；ZIP 仅检查目录元数据、哈希与已有 provenance，未提取内容。完整内容扫描与运行验收属于后续阶段。

扩展目录是独立 Git 仓库，不在网站 Git 树中；最初未在网站找到扩展的结论已由业主提供路径解除。之后所有架构/测试结论均涵盖这两个来源。

## 2. 实际系统与项目关系

### 网站

首页 `BuyButton` 默认 Stripe，可选 ToyyibPay；不调用 SQLite 模拟结账。服务端从已发布配置计算 MYR 分金额，写 `orders(pending)`，请求托管付款 URL。回调验签、核对身份/金额/币种，先持久化支付确认，再调用 `assign_available_key`。成功页读数据库，不把 URL 状态当付款证明。

网站只有一组 `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` 服务端配置；其历史部署文档描述 Source-W 项目。客户端凭据的当前值没有用来连接/验证云端。证据：`lib/supabase/commerce.ts:7`、`lib/supabase/admin.ts:100`、`lib/site-settings.ts:14`。

### 主扩展与现有后端

真正运行链路是手机提醒表单 → `src/options.js:109` → `cloud-client.js:9` → 后台设置页 sender 校验（`background.js:233`）→ `cloud.js:82` → `device-api`。主扩展没有直接 `.from()`/`.rpc()` 读写敏感表，也没有内置 Supabase service-role。

`src/cloud.js:5`、`scripts/build.mjs:37` 与 `supabase/config.toml:1` 固定 Source-E API/项目来源，和网站历史文档来源不同。Edge handler 用部署环境的 Supabase 服务凭据操作数据库。`verify_jwt=false` 用于自定义设备凭据；设备 API 自己验 opaque bearer token，worker/reminder 自己验 scheduler secret。**不能把 gateway 不验 JWT 等同于 handler 完全无鉴权。**

本机课表/Forms 自动执行独立于手机订阅。`src/background.js:89`、`:143`、`:267` 与 `content.js:129` 无 core 门禁；现有 README 与 tests 也固定这一行为。手机兑换只授予 phone_notifications，不提供整款 core 授权。

### 独立 license-security 原型

扩展仓库 `license-security/` 是未接入主 runtime 的另一套 China activation / business proxy 原型，有 UUID 明文 license、设备配额与 ToyyibPay 主动查询等代码。主 src 和发布包不 import 它。不得把它当成当前 core 已保护，也不得直接部署它的 `payment_orders`/`license_keys` 平行表。可复用 HTTP 限制、查询适配逻辑和测试思路。

当前云端到底有多少项目、哪些迁移/函数已部署、哪个库存在哪个项目，不能仅从源码证明；迁移计划中使用 Source-W/Source-E 别名，要求由人类在控制台取得脱敏 catalog 和聚合计数。

## 3. 附录 A.1 基线逐项核对

| 基线 | 源码与现有测试证据 | 审计判断 |
|---|---|---|
| 服务端定价、RM1 下限、不读取客户端金额 | Stripe checkout `:40–48`，Toyyib checkout `:171–180`，HitPay checkout `:37–47`；stripe/hitpay test 有伪金额断言 | 保留；补 Toyyib 参数金额、停售、下限测试 |
| Origin/Content-Type/大小/方案/邮箱 | Stripe 与 Toyyib 已有；HitPay `checkout/route.ts:20–36` 没有 Origin 校验 | **🔴 文档基线不完全成立**；HitPay 来源防护缺失；全部真实入口还缺共享限流、拒绝额外字段 |
| Stripe raw-body 验签及订单/金额/币种/Payment Intent 核对 | webhook `:13–19`，`lib/stripe-fulfillment.ts:9–39`；`tests/stripe-checkout.test.ts` | 保留；补完整 session/state/payment conflict/乱序矩阵 |
| Toyyib hash/恒时比较/精确金额/BillCode/refno/非成功不履约 | `app/api/webhook/toyyibpay/route.ts:59–127` | 静态成立；**未找到该回调直接测试**；保留后补官方查询确认 |
| Toyyib 创建超时不自动重发 | checkout 单次 fetch `:203–211` | 保留；超时后 BillCode 未保存，需对账恢复，不可盲目重建账单 |
| HitPay 原始字节 HMAC，仅 sandbox | `lib/hitpay.ts:49–53`；已有 hitpay tests | HMAC 保留；**🔴 sandbox 限定只有 checkout，webhook 仅检查 salt；production 可开 sandbox 入口** |
| 订单锁、SKIP LOCKED、唯一约束、原子履约/重放 | 最新到期迁移 `:23–110`；commerce `:54–55`；fulfillment tests | 保留锁/事务/RPC身份；PGlite 单连接 replay 不是多会话竞争证据 |
| 缺货持久支付事实 | 三回调先 capture 后 RPC；库存 error 留 pending | 保留；缺真正告警/自动补发；HitPay 告警记录失败仍 200，仅 console |
| 成功页只信服务器 | `app/success/page.tsx:56–120` | 保留；没有订单所有权鉴权；现有返回页测试只注入组件 status |
| RLS/服务端特权/hash+cipher/服务端解密 | commerce `:72–87`、加密库 `:29–60`、权限测试 | 网站 commerce 静态成立；不能推断整个云端安全；扩展旧表未 FORCE、部分 revoke 未包括 PUBLIC |
| __Host cookie/HttpOnly/Secure/Strict/8h | `lib/admin-auth.ts:7,31–78`；admin-auth tests | 保留安全属性；缺 MFA/白名单/持久限流/锁定/actor 审计 |

## 4. P0 商业闭环逐项差距

| 附录 A.4 | 当前差距与证据 | 增量改造与先写的验收 |
|---|---|---|
| 1 邮件 | 没有网站发送、outbox、日志、重试；WebView success 只显示状态（success `:126`） | 唯一订单邮件任务、Resend 适配、持久重试/去重/告警；失败后重试成功，同 webhook 不新发 key，移动端能找回 |
| 2 私密订单访问 | UUID/provider ID 可解密 key（success `:43–105`）；metadata noindex 已有，所需 headers 未明确配置 | 随机 capability，仅存 hash；限时/次数、邮箱恢复、no-store/no-referrer/noindex、CSP；裸 UUID/他人 token 不能解密 |
| 3 生产客服 | support API `localOnly`；receipt/failure 硬编码 `/support`；footer 可用另一个配置 | 复用明确统一客服入口；默认自建最小生产工单与告警，不把本地 SQLite 搬成生产；实际隔离 dev 提交/回复 |
| 4 下载/版本 | 网站静态 ZIP 不存在；扩展目录已有真实 ZIP但仍未core保护；订单不记录发布版本 | 新版经过 core 门禁后公开版本 ZIP，记录 asset/version/hash；不发布旧未锁 ZIP；构建内容扫描与下载/安装验收 |
| 5 缺货恢复 | capture/error 基础正确，但无告警/重试/对账 | 低库存与付款未履约告警、后台重试、定时扫描、补货后唯一发货和邮件；保留 durable capture |
| 6 退款 | 只有 SQLite 模拟；生产 license revoke 独立 PATCH（site-actions `:60–67`）；无退款/争议事件 | 唯一退款事务与审计/outbox；库存 revoked 不复售，激活/权益/队列失效/topic轮换，失败/过期/退款/争议乱序测试 |
| 7 方案映射 | DB semester/yearly 被 cast UI码（success `:81`），`plans.ts:28–29`读取 undefined | 单一双向 mapping、四 SKU真实收据中英渲染测试；确切运行时错误路径不能继续称仅可能 |
| 8 管理身份 | 共享密码/固定2秒延迟不是 MFA 或防暴力锁定 | Supabase Auth + 邮箱白名单 + AAL2；敏感动作确认；持久审计和限流；无MFA/非白名单拒绝 |
| 9 条款 | BuyButton只有邮箱/渠道，insert无版本/时间/IP hash | 草稿法律页与统一版本；服务端强制同意；未勾选/错误版本拒绝；实际存档测试 |

新商业计划的附加 P0：网站 `extension` 当前 paid/null；bundle消耗 semester；主扩展本机仍免费。必须增量扩展同一个分配 RPC：extension→core，bundle→单把 bundle，通知 key 只能在有效 core 设备兑换。不得因商业变化重写既有锁/验签。

## 5. 实际通知/激活能力及缺口

现有能力应保留：注册 proof先存本地再请求、同凭据注册重放、设备 API sender边界、key格式兼容、key输入不持久保存、恢复 response-loss 状态、backup白名单、本机通知、Forms一次提交与 uncertain不盲重试。

后端已有设备/课表/事件/偏好/push/outbox与 phone entitlement/activation stock；有主手机兑换 RPC、atomic schedule/version、logical notification dedupe、SKIP LOCKED+lease、指数退避、uncertain隔离；worker发送前检查权益。独立3连接并发测试源码已存在，但未执行。

| 风险 | 证据（Source-E） | 修改方向 |
|---|---|---|
| 同设备激活重试也被拒 | China semester迁移 `:37–42` | 返回已有结果，响应丢失重放幂等；两设备上限与解绑规则 |
| redeemed→revoked保留元数据违反 CHECK | shop迁移 `:17–19` | 明确状态机与保留证据；统一吊销权益 |
| 续订可能缩短已有权益 | semester迁移 `:74,83` | 新期限从 max(当前有效到期, now)起累计；保留历史值 |
| 入队两次授权只有第二次完整 | reliability event `:85–102`、reminder `:122–132`；worker `:13–18` | 入队和发送都校验有效 core/phone/device，拒绝未授权成本消费 |
| 无body字节限制/严格CORS/通用限流 | device-api `:12–16,332–340` | bounded reader、字段白名单、必要origin、IP/device/key分桶 |
| 随机topic在未授权注册就暴露 | device-api `:79–88` | 权益创建后分配；授权后提供；退款/到期/滥用轮换 |
| 无消息TTL/每日cap/queue cap/retention | base outbox `:84–95`、reliability `:8–15` | 20分钟TTL、60/day、容量、最大尝试、30天清理、告警 |
| 公开ntfy硬编码，无认证/自建适配 | `_shared/notification.ts:8` | server-only认证发布、配置baseURL、超时/状态映射、保留uncertain语义 |
| payload超过最小化目标 | validation `:26`、reliability `:93–100`、client cloud `:59–66` | 通知用类型+时间+通用文案；停用默认课表/Forms URL云同步，保留本地功能 |
| 未发现学校密码/Cookie上传 | src/backend字段审阅 | 继续白名单测试；课程码/自由detail仍需清理，不等于完全无隐私数据 |
| 核心凭据未限制trusted storage | cloud `:31–55`；content `:146–147`直接取profile | 后台受控取数迁移后启用trusted contexts，不能直接破坏现有填写 |
| recovery凭据secret耦合 | recovery-code `:6–18` fallback scheduler/service-role | 单独secret与版本；保留已有限次/锁序/重放，补DB恢复测试 |

N1/N4/Q1/Q3/Q7已有有价值实现；N2 public topic分享风险仍存在；N3/N9与Q2第一关、Q4/Q5部署与告警、Q6认证/容量、Q8保留、Q9缺席告警、Q10上限均待补。主扩展不具有Ed25519 JWS/kid/7日token/24h续期/72h宽限/min_version/kill_switch；本地任务graceMs不是许可宽限。

## 6. 密钥、CSV、迁移与数据保存

| 本地来源 | 表头 | 聚合数 |
|---|---|---|
| W international bundle | key_hash,encrypted_key,plan_type,status | 50 bundle/available |
| W international monthly目录 | 同上 | 50 semester/available（目录名不能决定期限） |
| W international yearly | 同上 | 50 yearly/available |
| E China semester | key_hash,plan,status | 50 sem_subscription/available |

共200行hash格式合法；W的150密文非空，未验证可解密。各原码文件50行。两仓库generated_keys均忽略且无跟踪文件。目录名不能证明云端region/channel/已售状态，不能凭CSV available覆盖线上redeemed/revoked。

三个现有协议：网站管理员192bit uppercase hex+trim/uppercase SHA256；国际8–12字符随机mixed-case后缀、区分大小写SHA256+AES-GCM；China12字符uppercase base36、约62bit SHA256。旧国际随机后缀约48–71bit、China约62bit，低于新要求100bit。不得修改大小写后直接重哈希；扩展 `_shared/activation.ts:1–44` 已兼容这些格式，应保留过渡。

两生成器会递归删除整个generated_keys，没有dry-run/批次隔离/安全ACL，不能运行来“补库存”。网站bundle CSV对应bundle库存，而现RPC消耗semester，现导入并不能直接补组合包缺货。

W旧commerce迁移明确删除旧activation_keys而不复制数据；E依赖同名表与恢复RPC。**🔴 绝不能将两个迁移目录直接拼接后db push。** 网站当前表继续作为统一模型；旧E records显式映射到key_inventory/issued_licenses，保留devices/outbox/leases/recovery语义，排除原型平行license_keys/payment_orders。

AES-GCM ciphertext以旧hash作AAD；把hash改HMAC必须重新加密或保留旧AAD/version。China只有hash，不能从hash恢复原码；恢复/升级需要人类持有安全原码或可解密库存。详见 `MIGRATION_PLAN.md`。

## 7. 环境变量与安全执行

| 变量类别 | 来源/用途 | 本次处理 |
|---|---|---|
| SUPABASE_URL / SERVICE_ROLE_KEY | W三个服务端client；E Edge运行环境 | 只核对使用方式；未连云；开发必须显式localhost/dev allowlist |
| STRIPE_SECRET_KEY / WEBHOOK_SECRET / APP_URL | W checkout/webhook/origin | 现代码不拒绝live key；隔离测试必须拒绝live，测试文件使用合成值 |
| TOYYIBPAY_SECRET_KEY / CATEGORY_CODE | W账单/hash | URL硬编码正式平台；测试必须mock/显式sandbox，不能试用现有值 |
| HITPAY_* | W旧sandbox | checkout限定sandbox，但需要production拒绝/隔离 |
| ADMIN_DASHBOARD_PASSWORD / ADMIN_SESSION_SECRET | W共享登录 | 改生产Auth+MFA；legacy仅明确本地开发 |
| LICENSE_KEY_ENCRYPTION_KEY | W加密/国际生成 | 不读取/记录值；需要版本化与备份/轮换计划 |
| LOCAL_DEMO / LOCAL_ADMIN_PASSWORD / LOCAL_DB_PATH / SITE_MANAGEMENT_* | W本地演示 | 生产runtime拒绝正确；仍需编译隔离/完整拒绝测试 |
| scheduler/recovery secret 与custom device token | E worker/device/recovery | server-only；不记录token；分离recovery secret |
| 原型CHINA_SUPABASE_* / OPENAI_* / STRIPE_LIVE_MODE / ALLOWED_ORIGINS | E独立原型 | 不是主runtime项目配置，禁止假设已部署 |

网站.env.example有占位/空值，环境文件与密钥文件被忽略。既有本机配置缺Stripe webhook/Toyyib项的报告只是文件快照，不能证明当前进程或部署未配置；本任务不使用这些实际配置。

**🔴 先隔离再测试**：W Playwright默认/prod/perf configs会继承shell/.env.local，首页/layout可直接读取云端已发布设置；测试helper默认真实fetch/process。E device-api smoke会兑换真实key，concurrency remote只凭flag允许任意远程DB。必须建立统一启动器清空敏感配置、拒绝非loopback网络、临时数据库/纯合成fixtures；真实Stripe test/dev集成另设明确allowlist命令。Docker、Supabase CLI、psql当前未在PATH发现；不能把PGlite replay充作真实Postgres多会话结果。

## 8. 测试、构建、发布与已有证据

W测试目录46文件：25 Node测试文件、17 Playwright spec、4辅助文件。E根38 Node测试文件，另有Deno/SQL/3连接测试与原型测试。现有测试覆盖支付基础/权限/加密/本地预览与很多课表、Forms可靠性、UI行为。全部只读，**本次执行结果为空**。

缺的主要矩阵：Toyyib callback直接测试与二次查询；真实success持有者/四方案；多会话同订单/同key/两席竞争；退款/争议乱序；激活JWS/kid/device/grace/core；入队后退款、TTL/caps/topic；邮件重试、找回、MFA；全链路dev Stripe测试。

W checkout browser测试断言Toyyib disabled，而源码enabled=true；prod grep排除过期标题，仍会运行local API seeding测试；perf命令与README端口/覆盖范围不同。静态预测不一致不能伪称已运行失败。

E已有构建、21entry allowlist、确定性ZIP/CRC/hash/source比较/provenance，应该扩展而不重写。scanner仅少数类型/marker，不能保证没有所有秘密。provenance仅git ls-files，遗漏未跟踪依赖；现device-api dirty内容与旧provenance不一致。

E最新ZIP为11,287,006 bytes、21entries，其SHA与existing provenance一致；它仍包含旧core免费逻辑。旧根ZIP与latest不同，固定版本名不足以识别包。不把元数据核对当内容扫描/安装验收。W没有扩展构建或发布CI；两个仓库均无.github门禁。关键coverage≥85%、依赖审计、全秘密扫描、fresh migration/rollback、完整release checks尚无本次证据。

## 9. 三份输入文档与源码不符的修正

1. `website-operation-flow-zh.md`说Toyyib createBill显式send_email=false：**错误**，W账单fields `:186–201`无该参数；HitPay才关闭email/SMS。网站未实现发信仍成立，平台是否寄信未知。
2. 该报告说pending显示等待：现`PaymentReturn.tsx:34–55`把pending/unavailable/unverified合成Payment failed，只有processing无限2秒刷新；已有tests也固定该文案。
3. 附录A.4“通知/激活不存在”适用网站范围；补全E后已有phone激活/队列/worker/设备与恢复，需扩展。
4. “客户端直接表访问”的风险报告假设未在主runtime成立；不能标成实证漏洞。
5. 老SYSTEM_REPORT/README有无Stripe、无云端等过期声明；另有文档云端已部署声明，本次均未核实。保留日期，当前审计与架构文档作为新基线。
6. 旧E规划48h token/12h refresh/最后成功总72h和新spec冲突；它们尚未实现。执行新spec默认7日token/24h refresh/exp后72h，记录过渡和离线吊销限制。

## 10. 全规格覆盖表

| 规格 | 现状 | 后续阶段/验收 |
|---|---|---|
| 1/2目标与工作规则 | 已建立真实静态基线；无人为9.5证明 | 每阶段证据与独立提交，绝不生产 |
| 3/A.5顺序 | 原商业P0未闭环 | A→P0(1–9)→B→C→D/E→F→G→H→I→J→K |
| 4架构 | W与E事实分裂，主E function-only | 统一后端，保留W表与E可靠性边界 |
| 5DB/权限/迁移 | W受控commerce；E有权限但不完全显式；无合并/回滚证明 | B扩展原表、RLS、状态机、staging、空库/回滚/并发 |
| 6激活协议 | phone opaque token；无core/JWS/两席/grace | C接口与G客户端，签名/设备/撤销矩阵 |
| 7key/卡网 | 三旧格式、200本地CSV行；低熵旧key无pepper | 兼容v1+新v2HMAC、checksum、批次工具/dry-run与卡网对账 |
| 8支付 | 正确基线，但邮件/terms/重用/二次确认欠缺 | 商业P0及D，保留验签，测试乱序/假回调 |
| 9退款争议 | 模拟退款或独立revoke | P0.6/E事务联动、topic/队列/审计/证据 |
| 10通知 | 可靠领取/发送检查已有，入队/caps/TTL缺失 | F复用lease/uncertain，双检与隐私/caps/retention |
| 11远程配置 | 未接主扩展 | C/G/I签名或版本config、min/kill/cache |
| 12扩展 | 本机可靠性/图文/QR/构建已有；core缺失 | G门禁不破坏Forms/recovery，真实MV3隔离验收 |
| 13网站 | landing已有；法律/恢复/status/卡网/同意欠缺 | P0/H保持风格追加功能与无障碍验收 |
| 14运维管理 | W共享密码；Eworker有但线上schedule未知 | P0/I MFA、真实订单、retry/reconcile/health/告警 |
| 15安全 | RLS和安全cookie基础；无完整headers/CI/scan | B/J安全矩阵，secret rotation/restore/threat docs |
| 16诚实边界 | 主E不绕登录/CAPTCHA；某云payload超最小化 | 保留本地验证，最小字段，法律草稿/紧急runbook |
| 17测试 | 已存在很多测试；本次无执行证明 | 每条映射实际测试名/命令/run，不能用历史PASS |
| 18文档 | 历史文档分散且漂移 | 统一交付文件，持续PROGRESS/DECISIONS |
| 19DoD | 尚未通过 | RELEASE_CHECKLIST不预勾；K诚实评分 |
| 20人类事项 | 云/商户/法律/2FA/live不可代理 | HUMAN_TODO，代码测试与人类上线验收分列 |
| 21默认值 | 现代码与默认多处不同 | DECISIONS明确新默认/配置，保留旧数据历史期限 |
| 22诚实交接 | 静态结论附限制 | 最终逐项证据/缺口/危险三项 |

## 11. 修改计划与顺序

详细决策见 `DECISIONS.md`，跨源切换见 `MIGRATION_PLAN.md`，数据流见 `ARCHITECTURE.md`。

1. **P0前置测试隔离**：先写网络/环境/密钥拒绝验收；建立两个repo的受控dev工作区及启动器；只用fake或独立dev。完整基线及失败分类后才改业务。
2. **A.4 P0 1–9商业闭环**：邮件outbox、订单访问/找回、生产客服、版本ZIP、缺货恢复、退款、mapping、MFA、terms。必要的最小新增字段/队列迁移随相应功能走，不提前重建全部数据库。
3. **B**：完整DB扩展/权限/状态机/legacy导入/回滚；复用W表，不建parallel plans/payments/license_keys；保留E注册/leases/recovery。
4. **C**：v2key/JWS/activate/refresh/deactivate/status/config；通知key有效core前置；legacy兼容。
5. **D/E**：支付纵深/生命周期/乱序/二次确认/完整退款争议，保留原订单幂等。
6. **F**：复用outbox worker，入队/发送双检、TTL/caps/轮换/认证ntfy、管理员告警。
7. **G**：将C授权接入所有实际执行入口，独立phone权限；trusted存储/诊断/离线/更新；版本ZIP扫描。
8. **H**：其余网站恢复/status/卡网/政策/UX/有限轮询。
9. **I**：实际订单操作、补发/对账/健康/备份恢复与告警runbook。
10. **J**：全部测试层、实际Postgres多连接、CI/coverage/依赖/秘密/ZIP门禁。
11. **K**：文档/当前证据、自评与人类待办；不宣称外部服务、平台真机或live环节已通过。

每个实现阶段先写验收与失败测试，再增量实现；只在有本次实际通过证据后更新PROGRESS并提交对应变更。无法执行的外部验收标blocked/unverified，不降低断言或伪造PASS。
