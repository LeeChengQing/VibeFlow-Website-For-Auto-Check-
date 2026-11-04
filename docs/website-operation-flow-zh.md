# Auto-Check 网站完整运行流程说明

> 审阅日期：2026-10-06  
> 审阅对象：当前工作区中的网站代码、数据库迁移、结账文档，以及 `.env.local` 中配置项的“存在/缺失”状态。本文没有显示任何密钥值，也没有验证外部支付账户或线上网站的实际状态。  
> 本次只新增这份说明文档，没有修改业务代码，也没有运行测试。工作区有原先未提交的首页与结账相关改动，报告按当前工作区内容说明。

## 先读结论：必须区分两套流程

当前代码同时保留了两类购买逻辑，它们不是同一套系统：

1. **真实支付后端代码**：Stripe、ToyyibPay 和 HitPay 的结账/回调代码会使用 Supabase 订单表；其中 Stripe、ToyyibPay 会被首页购买弹窗调用，HitPay 是另外的沙盒入口。
2. **本地模拟订单系统**：使用本机 SQLite，可模拟付款成功、取消、订单页、工单和模拟退款。它会拒绝生产环境和非本机主机名。

首页当前的购买弹窗选中 Stripe，并提供 ToyyibPay 选项。它提交到真实支付 API；它**没有连接到本地模拟 `/api/checkout`**。本工作区 `.env.local` 中虽有 `STRIPE_SECRET_KEY` 项，但缺少 Stripe 必需的 `STRIPE_WEBHOOK_SECRET`；ToyyibPay 的 Secret Key 和 Category Code 项缺失。因此，按当前这份本地环境文件，首页购买流程会因支付渠道未完成配置而无法创建结账。HitPay 沙盒变量项存在，但其值是否启用、是否有效并未在本文披露或验证；而且首页支付方式列表并未提供 HitPay 选项。

项目 README 也明确把网站定位为尚未完成公开上线配置的本地测试应用：没有实际发信，没有随仓库提供真实扩展 ZIP，也没有自动退款。

## 一、参与流程的系统与数据

| 系统/数据 | 用途 | 当前代码中的边界 |
|---|---|---|
| Next.js 首页与结账 UI | 展示已发布商品和价格，收集邮箱，调用支付 API | 首页按服务器读取的已发布网站配置渲染 |
| Stripe / ToyyibPay | 托管式付款页面 | 顾客的卡号/钱包付款信息由支付平台页面处理，不由本网站表单收集 |
| HitPay Sandbox | 另一条沙盒付款请求链路 | 仅接受沙盒配置；不是当前首页选项 |
| Supabase `orders` | 真实支付订单、金额、支付渠道和状态 | 只由服务端特权客户端访问；强制 RLS，没有浏览器端访问策略 |
| Supabase `key_inventory` | 尚未售出的许可证库存 | 记录哈希、加密密钥、方案和是否已分配，不应由浏览器读取 |
| Supabase `issued_licenses` | 订单与许可证的关联、状态和有效期 | 每笔许可证订单最多一条；每个库存项最多分配一次 |
| 本地 SQLite `.local/vibeflow.sqlite` | 本地模拟订单和工单 | 与 Supabase 真实订单分开；不可作为线上订单账本 |

服务端 Supabase 客户端从 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 创建。它要求线上 HTTPS（本机开发可使用 loopback HTTP），并关闭 Supabase SDK 的 session 持久化。服务角色密钥不能交给浏览器。相关实现见 [`lib/supabase/commerce.ts`](../lib/supabase/commerce.ts) 和迁移 [`20261004032804_commerce_and_inventory.sql`](../supabase/migrations/20261004032804_commerce_and_inventory.sql)。

## 二、顾客从进入首页开始的逐步流程

### 第 1 步：网站加载首页

1. 顾客访问 `/`。
2. 服务端调用 `getPublishedSiteConfig()` 读取已发布的网站配置。
3. 如果本地站点管理模式开启，则读取本地站点设置；否则读取 Supabase 的 `site_configuration.published`。在没有配置任何 Supabase 站点连接时，代码可退回内置默认配置；如果已配置数据库但读取失败，则会报配置不可用，不会静默换成默认值。
4. `validateSiteConfig()` 对从数据库来的配置重建字段并检查字段类型、套餐数量、价格、促销金额、日期、链接和扩展发布资源 ID 等。
5. 前台据此决定是否显示套餐、当前语言、维护提示、促销价格、客服入口和扩展版本信息。

当前工作区另有未提交的首页导航改动：`?product=mobile_notification` 可令首页初始展示手机通知产品，`?billing=semester` 或 `?billing=yearly` 可预选通知周期；没有这些参数时，通知周期默认选年度。这些参数只影响首页初始展示选择，不代表订单已创建或付款。相关代码在 [`app/page.tsx`](../app/page.tsx)、[`components/Homepage.tsx`](../components/Homepage.tsx) 和 [`components/SiteConfigProvider.tsx`](../components/SiteConfigProvider.tsx)。

首页入口在 [`app/page.tsx`](../app/page.tsx)，已发布配置读取和校验在 [`lib/site-settings.ts`](../lib/site-settings.ts)、[`lib/site-config.ts`](../lib/site-config.ts)。

### 第 2 步：顾客浏览方案

默认配置包含四项商品：

| 前台方案 | 支付接口使用的方案码 | 默认配置金额（最终以已发布设置为准） | 包含内容概念 |
|---|---|---:|---|
| 扩展程序 | `extension` | RM24.99 | 扩展 ZIP |
| 手机通知学期方案 | `semester` | RM11.99 | 学期许可证密钥 |
| 手机通知年度方案 | `yearly` | RM19.99 | 年度许可证密钥 |
| 完整体验组合包 | `bundle` | 默认 RM35.00；默认促销 RM30.00 | 扩展程序 + 首学期通知密钥 |

这里的金额是代码内置的默认配置，不是线上当前报价承诺。管理员可以修改并发布价格、促销、商品是否显示、商品是否允许购买。活动只有在开启且当前时间位于起止时间内时才会应用促销价。服务端重新计算价格，不使用浏览器提交的金额。金额以 MYR 的分为单位保存，例如 RM24.99 存成 `2499`。

单独购买手机通知时，页面说明需要已有扩展；组合包同时提供扩展和首学期通知。默认方案定义在 [`lib/site-config.ts`](../lib/site-config.ts)，金额计算和停售判断也在这个文件。

### 第 3 步：顾客点击购买按钮

首页购买卡片使用 `BuyButton`。顾客点购买后，弹出一个对话框：

1. 输入接收邮箱。
2. 选择支付渠道。默认选中 Stripe，可选择 ToyyibPay。
3. 点击“前往 Stripe/ToyyibPay 付款”。

浏览器先做表单必填和邮箱字段校验；按钮会在请求期间禁用。关闭弹窗、键盘焦点和倒计时是 UI 行为，不代表创建了订单或已经付款。

购买方案码在浏览器做了一次映射：`mobile_notification` 映射为 `semester`，`mobile_notification_yearly` 映射为 `yearly`，其余是 `bundle`、`extension`。随后发送的 JSON 只有 `buyer_email` 和 `plan`，不包含可信金额。实现见 [`components/BuyButton.tsx`](../components/BuyButton.tsx) 和 [`components/PaymentMethodSelector.tsx`](../components/PaymentMethodSelector.tsx)。

### 第 4 步：浏览器调用结账 API

被选中的支付方式决定请求入口：

- Stripe：`POST /api/checkout/stripe`
- ToyyibPay：`POST /api/checkout/toyyibpay`

成功时，接口返回支付平台的 URL 和订单 reference。浏览器还会检查 URL：必须是 HTTPS，主机名必须属于当前所选平台，不能带用户名、密码或自定义端口。校验通过后弹出约 3 秒的安全跳转提示，再离开本站前往支付平台。

此时订单通常还是 `pending`。**创建支付页面成功并不等于付款成功。**

## 三、真实结账 API 的详细执行逻辑

### A. Stripe：`POST /api/checkout/stripe`

请求形状：

```json
{
  "buyer_email": "buyer@example.com",
  "plan": "bundle"
}
```

服务器依次执行：

1. 检查请求 `Origin` 是否与配置的网站源一致。生产环境要求 `APP_URL` 是 HTTPS 网站根源，不允许路径、查询参数或片段；仅本机开发可在未设 `APP_URL` 时从请求源推导。
2. 要求 `Content-Type: application/json`，请求体最多 16 KB，内容必须是 JSON 对象。
3. `plan` 必须是 `bundle`、`extension`、`semester`、`yearly` 四者之一；`buyer_email` 必须是字符串，去空格并转为小写后，通过邮箱格式和 254 字符长度检查。
4. 在调用 Stripe 前要求 `STRIPE_SECRET_KEY` 与 `STRIPE_WEBHOOK_SECRET` 都非空。缺任一项直接返回 `503 STRIPE_NOT_CONFIGURED`，避免收款后却不能验证回调。
5. 读取已发布的网站配置。商品必须可见、启用，且网站不能处于维护状态或全局关闭结账。
6. 服务端根据 `plan` 找到对应配置商品并计算当前价格；金额必须是安全整数且至少 100 分，即 RM1.00。
7. 创建 Supabase 订单：`status=pending`、`payment_provider=stripe`、货币 `MYR`，保存规范化邮箱、方案和金额。
8. 请求 Stripe Checkout Session：单次付款模式，创建 MYR line item，把客户邮箱、订单 ID、订单 metadata 传给 Stripe；完成后回到 `/success?order_id=<订单UUID>`，取消则回到首页价格区。
9. 保存 Stripe Session ID 为订单的 `provider_request_id`。
10. 确认 Stripe 返回的 checkout URL 属于 `checkout.stripe.com`，然后把 URL 和订单 reference 返回浏览器。

金额是在服务端从已发布商品配置取出；即使有人自行改浏览器请求附带的金额，API 也不读取该金额字段。

对应代码：[`app/api/checkout/stripe/route.ts`](../app/api/checkout/stripe/route.ts)、[`lib/stripe-server.ts`](../lib/stripe-server.ts)。

### B. ToyyibPay：`POST /api/checkout/toyyibpay`

服务器执行：

1. 检查来源域名；生产环境要求配置 HTTPS `APP_URL`，且请求 `Origin` 要匹配。
2. 检查 JSON Content-Type、16 KB 请求体上限、方案码和邮箱格式。
3. 需要 `TOYYIBPAY_SECRET_KEY` 与 `TOYYIBPAY_CATEGORY_CODE`。任一缺失则不能创建账单。
4. 按发布配置验证商品可买并由服务端计算 RM 金额。
5. 先在 Supabase 创建 `pending` 订单，支付渠道记为 `toyyibpay`。
6. 向 ToyyibPay 的 createBill 接口发送账单信息：MYR 金额、邮箱、订单 reference、回跳 `/success?order_id=...`、回调 `/api/webhook/toyyibpay`，并请求开放 DuitNow QR。`billPayorInfo=0`，不要求另外填写付款人姓名或电话。
7. 通过平台返回的 BillCode 保存 `provider_request_id`，并构造 ToyyibPay 账单 URL 返回浏览器。

创建账单 API 的平台请求超时有一项重要处理：代码保留本地待付款订单，不自动重复提交或换订单身份，因为平台可能已成功创建账单但响应丢失。

对应代码：[`app/api/checkout/toyyibpay/route.ts`](../app/api/checkout/toyyibpay/route.ts)。

### C. HitPay：`POST /api/hitpay/checkout`

这是一条额外的 HitPay 沙盒流程，不是首页当前可选的支付方式。它只接受 `HITPAY_ENABLED=true`、`HITPAY_ENVIRONMENT=sandbox` 且存在 `HITPAY_API_KEY` 的配置，并请求 HitPay sandbox endpoint。它同样在 Supabase 建立待付款订单，调用 HitPay 创建付款请求，关闭 HitPay 自己的 email 和 SMS 通知（`send_email=false`、`send_sms=false`）。特殊 `internal_check` 方案还要求管理员会话。

对应代码：[`app/api/hitpay/checkout/route.ts`](../app/api/hitpay/checkout/route.ts)、[`lib/hitpay.ts`](../lib/hitpay.ts)。

## 四、顾客在支付平台付款后，网站如何确定结果

### 1. 回到成功页只提供“查单线索”

支付平台跳回 `/success` 时会带订单 ID 等查询参数。页面只用这些值去定位 Supabase 订单；它**不会因为浏览器 URL 写着 `success` 或 `paid` 就相信付款成功**。

成功页根据服务器订单状态显示：

| 数据库状态 | 页面处理 |
|---|---|
| `paid` 且 `payment_confirmed_at` 有值 | 付款确认成功，尝试展示收据与订单交付 |
| 仍为 `pending`，无确认时间 | 尚未确认；页面显示等待/未确认，不给许可证 |
| `pending` 但已有确认时间 | 已记录收款、履约尚未完成；显示处理中 |
| `cancelled` 或 `refunded` | 当作未付款/不可领取 |
| Supabase 查询失败 | 显示不可用/未验证状态，不发交付内容 |
| 订单定位参数无效 | 正常桌面浏览器跳回首页；部分支付 App WebView 显示最简状态页 |

如果显示“处理中”，客户端每两秒刷新一次页面，以便重新查服务端订单状态。

页面实现见 [`app/success/page.tsx`](../app/success/page.tsx) 和 [`components/PaymentReturn.tsx`](../components/PaymentReturn.tsx)。

### 2. Stripe Webhook：`POST /api/checkout/stripe/webhook`

Stripe 在付款结果变化时给服务端发送事件。当前处理 `checkout.session.completed` 和 `checkout.session.async_payment_succeeded`：

1. 读取原始请求体，不先解码 JSON；最多 256 KB。
2. 要求 `stripe-signature` 请求头。
3. 使用 Stripe SDK 和 `STRIPE_WEBHOOK_SECRET` 验证原始请求体签名。签名不对返回 401。
4. 只继续处理 `payment_status=paid` 的 Checkout Session。
5. 再检查 Session 是 payment 模式、状态 complete，并且有 Payment Intent ID。
6. 用 Session ID 查找 `payment_provider=stripe` 的订单。
7. 对照 Session 的 client reference、订单 ID、金额和货币；确认订单处于 `pending` 或可幂等重放的 `paid` 状态；不允许同一订单被另一笔 payment ID 冲突占用。
8. 先条件更新订单，写入支付交易 ID 和 `payment_confirmed_at`，再开始许可证履约。
9. 返回成功响应；重复的同一事件不会另发一把密钥。

签名校验和事件入口：[`app/api/checkout/stripe/webhook/route.ts`](../app/api/checkout/stripe/webhook/route.ts)；与订单匹配及履约前校验：[`lib/stripe-fulfillment.ts`](../lib/stripe-fulfillment.ts)。

### 3. HitPay Webhook：`POST /api/hitpay/webhook`

1. 需要配置 `HITPAY_WEBHOOK_SALT`。
2. 读取最多 256 KB 的原始请求体。
3. 从 `Hitpay-Signature` 取十六进制签名，用 HMAC-SHA256 对原始字节重新计算，并以时间恒定比较验证。
4. 解析已签名 JSON，并按事件类型提取成功付款记录；付款请求必须 completed，付款记录必须 succeeded/completed；退款金额非零会拒绝作为有效的新收款。
5. 查找对应 `provider_request_id` 的订单，核对渠道、可用 reference、MYR 金额和货币、状态以及 Payment ID。
6. 保存确认时间和支付 ID后调用原子履约函数。

实现见 [`lib/hitpay.ts`](../lib/hitpay.ts) 和 [`app/api/hitpay/webhook/route.ts`](../app/api/hitpay/webhook/route.ts)。

### 4. ToyyibPay 回调：`POST /api/webhook/toyyibpay`

1. 读取最多 64 KB 请求体，支持 JSON、表单编码或 multipart form。
2. 使用商户 Secret Key、回调状态、订单 ID、平台 refno 和固定字符串 `ok` 计算 MD5 callback hash；要求收到的 hash 是 32 位十六进制并用时间恒定比较。
3. 签名正确但状态不是成功状态 `1` 时，仅确认已收到通知，不给订单履约。
4. 成功状态下，校验订单 UUID/BillCode 的格式，精确解析两位小数的 MYR 金额，不能用浏览器的小数浮点数自行舍入。
5. 用订单 ID 或 BillCode 找 ToyyibPay 订单，并核对 reference、已保存的 BillCode、金额和 MYR 货币。
6. 确认订单仍可付款且 refno 不与其他交易冲突。
7. 记录支付 ID与确认时间，再调用原子履约函数。

实现见 [`app/api/webhook/toyyibpay/route.ts`](../app/api/webhook/toyyibpay/route.ts)。

## 五、付款确认后怎样发许可证，以及如何防止重复发货

三条真实支付回调最终都会调用 Supabase `assign_available_key(order_id)`。它的作用是把“订单已收款”和“许可证分配”做成一个受数据库锁保护的操作：

1. 对订单行加锁，再检查订单是否存在、状态是否 `pending`，以及是否已有许可证记录。
2. 如果是扩展 `extension` 订单：无需分配激活密钥，直接把订单改为 `paid` 并写 `paid_at`。
3. 如果是 `bundle`：许可证库存方案转换成 `semester`，所以组合包附一把首学期通知密钥。
4. 如果是 `semester` 或 `yearly`：查找同方案、状态 `available` 且有加密密钥的库存项。
5. 以行锁和 `FOR UPDATE SKIP LOCKED` 选一条库存，再将库存改为 `assigned`，插入一条 `active` issued license，并把订单标记为 `paid`。许可证插入、库存占用和订单付款状态在同一数据库事务里；任一步失败都会一起回滚。
6. 数据表的唯一约束保证每个订单最多一个许可证、每个库存项最多给一个订单。
7. 已经是 `paid` 的重放回调会返回已有许可证，不重复占库存。非 `pending` 状态（例如已取消/退款）不能新领库存。

最新的有效期迁移按履约时间计算：学期方案 130 天，年度方案 365 天；扩展方案本身无许可证有效期。组合包许可证按学期方案处理。迁移见 [`20261004171118_keyless_extension_license_delivery.sql`](../supabase/migrations/20261004171118_keyless_extension_license_delivery.sql) 和 [`20261004172416_license_expiration_dates.sql`](../supabase/migrations/20261004172416_license_expiration_dates.sql)。

### 库存不足的情况

付款验证事实会先写入订单，再调用履约 RPC。如果没有可用密钥，RPC 不会把订单错误地标成已交付：订单保持 `pending`，但有 `provider_payment_id` 和 `payment_confirmed_at`，并记录 `fulfillment_error=INVENTORY_EXHAUSTED`。代码会记录严重错误，支付回调端在尽量持久化告警后应答成功，以免平台不断重复同一回调。

这意味着“`pending`”不一定永远代表没有付款：还要同时看 `payment_confirmed_at`。库存补足后的重试需要运维处理；当前生产订单后台没有证据显示有专门的“重试履约”操作按钮。

## 六、成功后顾客具体能看到或收到什么

### 网站页面上能看到的东西

成功页从 Supabase 确认订单后，显示付款结果、方案、MYR 金额、订单号、付款时间、遮蔽邮箱的收据。许可证方案会从 `issued_licenses` 找到 active license，再读取库存中的加密密钥和 hash，在**服务端**用 `LICENSE_KEY_ENCRYPTION_KEY` 解密；密钥只在服务器确认订单和许可证状态后作为页面属性传到收据组件。

目前代码中交付边界如下：

| 购买方案 | 代码计划给顾客的交付 | 现在需要注意的实现状态 |
|---|---|---|
| `semester` / `yearly` | 成功页收据上显示许可证密钥 | 必须已有相应加密库存；密钥读取/解密失败时显示付款已确认但许可证暂时不可用，并提示联系支持 |
| `bundle` | 学期许可证密钥 + 扩展下载 | 许可证可以按上面逻辑查找；扩展下载按钮指向一个写死的静态 URL，详见下方断点 |
| `extension` | 扩展 ZIP 下载 | 成功页同样指向静态路径；该路径下当前工作区没有 ZIP 文件 |

收据票券可以在浏览器生成 PNG 下载；它是视觉凭证，不是邮件发送。

### 邮件、短信、通知究竟会不会发

在被审阅的代码中，没有邮件发送服务调用、SMTP/邮件 API 配置、发信队列或重试日志。Stripe Checkout Session 把邮箱交给 Stripe 的托管结账；这本身不等于本网站已发送回执邮件。ToyyibPay 的 bill creation 参数显式设置 `send_email=false`，HitPay 设置 `send_email=false`、`send_sms=false`。工单回复也只写入本地工单记录，不会邮件通知。

因此，基于当前代码能够确认的是**顾客回到网站页面查看交付**。不能确认当前网站会发购买确认邮件、把密钥寄到邮箱、发送 ZIP 链接邮件或发送客服回复提醒。支付平台是否有自己的回执设置，应到其商户账户中另外核实。

### 扩展下载目前存在的断点

收款成功页 [`components/PaymentReturn.tsx`](../components/PaymentReturn.tsx) 的扩展链接固定指向 `/downloads/auto-check-extension.zip`。本工作区的 `public/downloads` 目录不存在，该 ZIP 也没有找到。

另一个下载 API `GET /api/site/download/[token]` 会检查本地演示订单的 64 位 token、已付款状态、7 天有效期和已发布 ZIP 资源，再返回文件。但该 API 开头强制调用 `localOnly()`，生产模式会拒绝；它查的是 SQLite 演示订单 token，不是 Stripe/ToyyibPay 的 Supabase 订单。因此，**这个本地受控下载 API 不是当前真实付款订单的生产下载入口**。

站点后台支持上传并配置 ZIP 发布资源；本地订单会在创建时记下发布版本。但真实支付的 Supabase 订单没有保存这样的发布资产 ID，成功页也没有使用后台配置的发布版本。需要把成功页指向真正授权校验的下载接口，并把订单与具体发布版本关联后，才构成一致的真实下载链路。

## 七、本地模拟购买：它具体怎么运行

这条流程仍在代码里，但不是首页购买按钮当前调用的支付流程。其 API 入口是 `POST /api/checkout`：

1. `localOnly(request, true)` 检查当前不是生产环境、`LOCAL_DEMO=true`、Host 是 `localhost` / `127.0.0.1` / `::1`，并要求变更请求的 Origin 与站点源一致。
2. 读取 JSON 并调用 `createOrder()`。方案必须为四种前台方案之一；不可选 `degree` 特殊周期；网站设置需允许购买。
3. 从 SQLite 创建订单，生成 UUID、32 随机字节私密 token 和 reference `VF-...`；订单初始状态 `pending`。
4. 返回 `/checkout/[token]`。
5. 这个本地结账页让顾客填邮箱并点“模拟付款成功”或“模拟取消付款”。支付并未请求支付平台。成功操作检查邮箱、订单是否仍 pending、订单创建是否在 24 小时内；成功后把 SQLite 订单改为 `paid`。
6. 扩展订单写入“这是本地预览，没有真实 ZIP”的说明；通知类订单生成 `DEMO-...` 密钥。交付预览 7 天到期。
7. 浏览器跳转到 `/order/[token]`。订单 token 是私密访问凭据，持有链接的人可以查看订单状态和本地交付预览。

本地 API 相关代码：[`app/api/checkout/route.ts`](../app/api/checkout/route.ts)、[`app/api/orders/[token]/route.ts`](../app/api/orders/%5Btoken%5D/route.ts)、[`app/checkout/[token]/page.tsx`](../app/checkout/%5Btoken%5D/page.tsx)、[`lib/store.ts`](../lib/store.ts)、[`lib/security.ts`](../lib/security.ts)。

本工作区首页 `BuyButton` 当前调用的是 Stripe/ToyyibPay API，没有调用 `POST /api/checkout`。所以本地模拟 API 仍可由本地测试或直接请求触发，但不能将 README 中描述的模拟 UI 视作当前首页实际可走通的默认点击链路。

## 八、客服工单完整流程

当前实现同样是 SQLite 本地客服，不是线上 Supabase 客服：

1. 顾客打开 `/support`，填写邮箱、可选订单 reference、主题和问题详情。
2. 前端向 `POST /api/support` 提交 JSON。
3. API 只允许本机本地演示模式，且有简单的每分钟请求上限。
4. 邮箱去空格并小写，长度最多 254，格式检查；主题 2–120 字符；正文 5–4000 字符。
5. 如果填写订单号，系统会查 SQLite reference，并要求该订单邮箱与提交邮箱完全匹配；不匹配就拒绝。购买前咨询可不提供订单号。
6. 创建 open 工单、32 随机字节私密 token，以及第一条 customer 消息；返回 `/support/[token]` 私密链接。
7. 顾客需保存该链接；页面使用 token 读取工单，也可继续追加消息。closed 工单不能继续回复。
8. 管理员在本地订单/客服后台看工单、写回复、关闭或重新打开。回复仅显示在私密工单页面，不发邮件。

生产模式的 `POST /api/support`、`GET/POST /api/support/[token]` 都会因为 `localOnly()` 返回拒绝。真实付款成功页提供了 `/support?reference=...` 链接，但在生产端，现有客服 API 不能完成提交。因此需另行实现生产级工单存储、访问控制和回复通知，或改为真实可用的外部客服入口。

相关文件：[`components/SupportForm.tsx`](../components/SupportForm.tsx)、[`app/api/support/route.ts`](../app/api/support/route.ts)、[`app/api/support/[token]/route.ts`](../app/api/support/%5Btoken%5D/route.ts)、[`lib/store.ts`](../lib/store.ts)。

## 九、退款：现有代码、人工流程与缺口

### 代码中实际存在的退款动作

本地管理员操作可以对状态为 `paid` 的 SQLite 订单执行模拟退款：

1. 管理员登录本地后台。
2. 选择订单，点“Record simulated refund”。
3. 订单状态改成 `refunded`，清除本地交付内容和过期时间。
4. 后台明确写明“没有资金移动”。

这个操作没有请求 Stripe、ToyyibPay 或 HitPay，没有退款 API，没有真实资金退还，也没有撤销 Supabase 中的真实许可证。它在生产端被 `isLocalAdminPreview()` 拦截。

### 真实付款订单要退款，按现在代码应如何理解

就当前实现而言，必须由运营人员**先在对应支付平台的商户后台人工发起退款**；然后还需要在网站订单账本中把订单标为退款并按政策撤销已发许可证/停止下载。后半段目前没有完整的生产订单退款操作：

- Supabase `orders.status` 数据结构允许 `refunded`，但这只代表字段值合法，不代表网站有退款流程。
- 生产管理后台订单/客服面板明确提示 live payments and email delivery have not been connected；在生产主机上不列出本地订单工单。
- 没有发现调用各支付平台退款 API 的生产代码。
- 生产管理员可以撤销 `issued_licenses.status`（active → revoked），但这是单独的许可证撤销动作；它不退款、不改变订单状态，也不恢复已分配库存。
- Webhook 会拒绝不正常的付款状态或已退款金额，但不是主动退款机制。

建议将来正式运营时按此顺序人工处理，直到有真正的管理操作：

1. 用支付平台交易记录核对订单 ID/reference、顾客邮箱、金额和币种；不要只凭顾客截图或回跳 URL。
2. 在对应支付平台后台实际退款，记录支付平台退款 ID、金额、时间和操作者。
3. 在网站订单记录中标记 `refunded`，记录退款状态与原因；若系统暂时没有安全的后台动作，不要把本地模拟退款按钮当作替代。
4. 若该订单已经发出许可证，撤销对应 `issued_licenses`；下载入口应在每次下载时查订单/许可证状态，退款后拒绝下载。
5. 给顾客一个客服回复，说明退款已提交/完成及预计到账时间；当前工单回复不发邮件，必须使用真实客服渠道通知。
6. 留存完整审计记录，防止重复退款；退款动作和许可证撤销应设计为可重试且不会重复扣/退或重发货。

这是一套**运营建议流程**，不是当前代码已经自动实现的功能。相关模拟操作见 [`lib/site-operations.ts`](../lib/site-operations.ts)、[`lib/store.ts`](../lib/store.ts)，生产许可证撤销见 [`app/admin/site-actions.ts`](../app/admin/site-actions.ts)。

## 十、管理后台、库存和谁可以做什么

### 管理员身份验证

生产管理后台使用 `ADMIN_DASHBOARD_PASSWORD` 和 32 字节十六进制 `ADMIN_SESSION_SECRET`。登录通过 Server Action/Route Handler 验证密码，成功后设置签名 cookie；生产 cookie 是 `__Host-` 前缀、HTTP-only、Secure、SameSite=Strict，有效 8 小时。受保护的服务端操作都调用 `requireAdminSession()`。

本地订单演示后台使用单独的 `LOCAL_ADMIN_PASSWORD` 和本地 session 流程，也被本地 host/`LOCAL_DEMO` 条件限制。两种 admin 配置不应混为同一组线上凭据。

### 生产后台目前主要能做什么

- 编辑、保存和发布网站文案、套餐、价格、促销、客服链接等配置。
- 上传教程图片和扩展 ZIP 资源。
- 查看许可证库存状态、issued license、买家邮箱和激活元数据。
- 批量生成并录入许可证；数据库只保存哈希与加密密钥，不直接保存明文原码。
- 撤销仍 active 的已发许可证。

### 生产后台目前不能据代码确认的事项

- 生产订单搜索/退款/纠正邮箱/重新发送邮件：目前订单与客服操作面板绑定本地 SQLite preview，不是生产 Supabase 订单操作台。
- 邮件发送与重发。
- 生产订单售后退款记录及回调同步。
- 库存不足后的后台自动重试发货按钮。

管理后台本地/生产边界见 [`app/admin/page.tsx`](../app/admin/page.tsx)、[`lib/site-operations.ts`](../lib/site-operations.ts) 和 [`docs/admin-key-dashboard-setup.md`](admin-key-dashboard-setup.md)。

## 十一、重要 API 一览与验证清单

| API | 作用 | 主要校验/限制 | 当前边界 |
|---|---|---|---|
| `POST /api/checkout/stripe` | 创建 Stripe Checkout Session | same-origin、JSON ≤16 KB、方案 allowlist、邮箱、配置价格、商品可买、Stripe secret+webhook secret | Supabase 真实订单代码；当前工作区 webhook secret 缺失 |
| `POST /api/checkout/stripe/webhook` | 接收 Stripe 付款事件 | 原始 body 签名、paid、Session/订单/金额/货币/Payment ID | 只有服务端签名回调才会付款确认 |
| `POST /api/checkout/toyyibpay` | 创建 ToyyibPay 账单 | same-origin、JSON、方案/邮箱、配置价格、商户 secret/category、APP_URL | 当前工作区商户 secret/category 缺失 |
| `POST /api/webhook/toyyibpay` | 接收 ToyyibPay 成功回调 | callback hash、status=1、BillCode/reference、精确金额、MYR、交易冲突 | 仅有效成功回调触发履约 |
| `POST /api/hitpay/checkout` | 创建 HitPay 沙盒请求 | 仅 sandbox、启用标志与 API key、方案/邮箱/价格；internal_check 需管理员 | 不是首页可选渠道 |
| `POST /api/hitpay/webhook` | 接收 HitPay 事件 | HMAC-SHA256 原始 body、事件状态/支付、金额、币种、订单匹配 | 需要 HitPay webhook salt |
| `GET /success` | 根据 ID 查付款和展示结果 | 服务器读 Supabase 支付字段；URL 参数只定位订单 | 不因 URL 成功字样直接认定付款 |
| `POST /api/checkout` | 建本地模拟订单 | localOnly、same-origin、方案/开售设置、SQLite | 不调用支付平台；生产禁用；首页按钮当前不调用它 |
| `GET /api/orders/[token]` | 读取本地演示订单 | 随机 token；localOnly；no-store | 不是生产 Supabase 订单查询 API |
| `POST /api/orders/[token]` | 本地模拟完成/取消 | localOnly、same-origin、邮箱/订单状态、成功订单 24 小时限制 | 顾客可模拟成功；无真实付款 |
| `POST /api/support` | 建立本地客服工单 | localOnly、邮箱、reference 与邮箱匹配、字段长度、简单速率限制 | 生产禁用；没有邮件发送 |
| `GET/POST /api/support/[token]` | 查看/追加工单消息 | localOnly、私密 token、closed ticket 状态、same-origin | 生产禁用 |
| `GET /api/site/download/[token]` | 发本地演示 ZIP | localOnly、64 位 token、订单 paid、未超 7 天、已发布 release | 查询 SQLite；不是生产支付订单下载通道 |

支付平台回调之外，前端自行验证支付 URL 主机是为了防止被恶意或错误 URL 引导离站；它不是付款验证。付款验证必须在服务器侧 webhook 完成。

## 十二、静态审阅发现的关键断点

以下是读代码发现的实际风险，需要单独说明，不代表已经通过运行测试确认：

1. **当前本地首页结账配置不完整。** `.env.local` 中 Stripe Webhook Secret 缺失，Stripe 代码会直接返回未配置；ToyyibPay Secret Key 和 Category Code 项也缺失，不能创建账单。
2. **本地模拟结账并未接入首页按钮。** `/api/checkout` 和 `/checkout/[token]` 仍存在，但首页 `BuyButton` 请求 Stripe/ToyyibPay API。因此本地模拟页面不是当前首页的自动 fallback。
3. **成功页扩展链接指向不存在的仓库静态文件。** `/downloads/auto-check-extension.zip` 在当前 `public` 目录中找不到；成功购买扩展/组合包后，这条静态链接无法从仓库内容得到文件。
4. **安全 ZIP 下载 API 是本地专用。** `/api/site/download/[token]` 查询 SQLite 且生产拒绝；不能为 Supabase 真实支付订单下载授权。
5. **成功页没有使用后台发布的 ZIP 版本。** 管理员可以上传/配置 release，但真实 Supabase 订单不记 release asset ID，成功页却写死文件 URL。
6. **通知方案订单方案码可能与成功页展示组件不匹配。** 结账 API 将订单存为数据库规范码 `semester`/`yearly`，而前端显示辅助函数 `getOrderPlanDisplay()` 的方案表使用 `mobile_notification`/`mobile_notification_yearly`。静态阅读显示，成功页把数据库值传给该函数时可能无法找到对应展示项。需要把 DB 方案码和 UI 方案码显式映射，并验证通知方案成功回跳。
7. **生产客服 API 被 localOnly 限制。** 成功页给顾客的客服链接在生产环境可能打开表单，但提交工单会被 API 拒绝。
8. **生产退款不是已实现的应用流程。** 本地模拟退款没有移动资金；生产撤销许可证是另一独立动作，没有联动退款。
9. **支付平台配置不等于部署完成。** 有环境变量名或代码路由并不能证明商户账户、Webhook URL、方法启用、回调投递、密钥库存和线上 RLS 都经过实机验证。

## 十三、上线前逐项核对顺序

要把现有代码变成可给顾客真实购买的业务流程，至少需要按顺序完成并实际验证：

1. **配置网站和数据库**：生产 HTTPS `APP_URL`、Supabase URL/service-role、网站发布配置、RLS/数据库迁移状态。
2. **配置支付平台**：选定正式渠道与商户；设置服务端密钥；注册正确 Webhook URL 和签名密钥；启用需要的付款方式；验证回调能送达。
3. **测试价格一致性**：从网站选方案，以商户后台账单、Supabase `amount_minor` 和 webhook 金额三方核对 MYR 金额。
4. **录入许可证库存**：按 `semester`/`yearly` 方案录入有效密钥；确认加密密钥稳定、ciphertext 可解密；确认组合包映射学期密钥。
5. **接好扩展下载**：上传有效 ZIP，建立真实订单到发布版本关系；成功页使用检查订单状态和退款/有效期的受保护下载 API；做未付款、过期、退款和换版本场景验证。
6. **接好邮件和客服**：选择邮件服务，增加重试与送达日志；在生产启用客服数据存储和授权；回复/补发时通知顾客。
7. **补齐退款与异常恢复**：实现商户退款和订单状态的安全联动；撤销许可证；支持库存耗尽后的人工重试履约；保留审计记录与操作人。
8. **小额完整验收**：从真实顾客首页开始，用沙盒/小额交易走创建订单 → 平台付款 → 签名回调 → 数据库履约 → 成功页显示 → 下载/密钥 → 客服 → 退款/撤销全链路。仅浏览器看到成功页面不算验收通过。

## 十四、用一句话概括全流程

顾客浏览已发布方案 → 在首页弹窗填邮箱选 Stripe/ToyyibPay → 服务端按配置重算金额并写待付款订单 → 顾客在支付平台付款 → 平台把签名回调发送给网站 → 网站验签并核对订单、交易、金额和币种 → Supabase 原子地标记订单并分配许可证 → 顾客回到成功页查看服务器确认结果和交付 → 遇到问题时需要客服处理；而目前生产客服、邮件、扩展下载及真实退款尚未形成完整闭环。
