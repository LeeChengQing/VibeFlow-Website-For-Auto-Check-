# 环境变量参考手册 (ENV.md)

本文档定义 Auto-Check Website 与 Supabase 后端所有环境变量的名称、用途、安全级别与默认值。

---

## 1. 核心应用与服务配置

| 变量名 | 类型 | 必需 | 作用 | 默认值 / 示例 |
|---|---|:---:|---|---|
| `NODE_ENV` | `string` | 是 | 运行环境模式 (`production` / `development` / `test`) | `production` |
| `APP_URL` | `string` | 是 | 网站规范公开基础 URL (必须为 HTTPS，禁止结尾斜杠) | `https://autocheck.pro` |
| `NEXT_PUBLIC_APP_URL` | `string` | 否 | 前端公开访问地址 | 同 `APP_URL` |
| `LOCAL_DEMO` | `string` | 否 | 仅在非生产环境下启用本地模拟演示功能 | 未设置 / `false` |

---

## 2. 数据库与 Supabase 服务 (仅服务端私密)

| 变量名 | 类型 | 必需 | 作用 | 安全级别 |
|---|---|:---:|---|:---:|
| `SUPABASE_URL` | `string` | 是 | Supabase 项目 API 网关 URL (格式 `https://<id>.supabase.co`) | 绝密 (不得暴露给浏览器) |
| `SUPABASE_SERVICE_ROLE_KEY` | `string` | 是 | Supabase service_role JWT 凭证，用于绕过 RLS 执行核心业务逻辑 | 绝密 (禁止暴露或提交代码库) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `string` | 否 | 公开只读匿名 Key (仅用于读取 plans / app_config 等只读表) | 公开只读 (受严格 RLS 限制) |

---

## 3. 密钥生成、令牌签名与加密 (仅服务端私密)

| 变量名 | 类型 | 必需 | 作用 | 安全级别 |
|---|---|:---:|---|:---:|
| `KEY_HMAC_SECRET` | `string` | 是 | 激活密钥 HMAC-SHA256 计算根秘钥 (≥32 字节高熵随机串) | 绝密 (丢失导致全量 key 失效) |
| `ED25519_PRIVATE_KEY_PEM` | `string` | 是 | JWS 激活令牌签署的 Ed25519 PKCS8 私钥 PEM | 绝密 (丢失导致无法签发新令牌) |
| `ED25519_CURRENT_KID` | `string` | 是 | 当前活动的签名密钥标识符 | 示例: `kid-2026-v1` |
| `ED25519_PUBLIC_KEY_PEM` | `string` | 否 | 当前活动密钥的公钥 PEM (用于服务端令牌核验) | 公开/服务端内部 |
| `ED25519_KEYRING_JSON` | `string` | 否 | 包含历史与当前公钥的 JSON 映射字典 `{"kid": "pem"}`，用于密钥平滑轮换 | 服务端内部 |
| `LICENSE_KEY_ENCRYPTION_KEY` | `string` | 是 | 用于对称加密卡密以支持邮件投递与找回的 AES-256-GCM 密钥 (Base64 编码，32 字节) | 绝密 |

---

## 4. 支付网关集成

| 变量名 | 类型 | 必需 | 作用 | 安全级别 |
|---|---|:---:|---|:---:|
| `STRIPE_SECRET_KEY` | `string` | 是 | Stripe 生产服务端秘钥 (`sk_live_...`) | 绝密 |
| `STRIPE_WEBHOOK_SECRET` | `string` | 是 | Stripe Webhook 签名验签秘钥 (`whsec_...`) | 绝密 |
| `DISABLE_STRIPE` | `string` | 否 | 紧急熔断开关：设为 `true` 即可立即下线 Stripe 支付通道 | 内部配置 |
| `TOYYIBPAY_SECRET_KEY` | `string` | 否 | ToyyibPay 合作方秘钥 (`userSecretKey`) | 绝密 |
| `TOYYIBPAY_CATEGORY_CODE` | `string` | 否 | ToyyibPay 收款分类码 (`categoryCode`) | 内部配置 |
| `DISABLE_TOYYIBPAY` | `string` | 否 | 紧急熔断开关：设为 `true` 即可立即下线 ToyyibPay 支付通道 | 内部配置 |

---

## 5. 邮件与通知推送

| 变量名 | 类型 | 必需 | 作用 | 安全级别 |
|---|---|:---:|---|:---:|
| `RESEND_API_KEY` | `string` | 是 | Resend 邮件分发 API 凭据 (`re_...`) | 绝密 |
| `EMAIL_FROM` | `string` | 否 | 系统履约与通知发信地址 | 默认: `Auto-Check <support@autocheck.pro>` |
| `NTFY_BASE_URL` | `string` | 否 | ntfy 服务根地址 (可切换为自建实例) | 默认: `https://ntfy.sh` |
| `NTFY_AUTH_TOKEN` | `string` | 否 | 自建或付费 ntfy 服务的 Bearer 认证令牌 | 内部私密 |
| `NTFY_ADMIN_TOPIC` | `string` | 是 | 管理员私密告警主题 (由管理员手机 App 独立订阅) | 内部私密 (高熵随机) |
