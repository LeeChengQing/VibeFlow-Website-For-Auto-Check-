# 机密管理与密钥轮换指南 (SECRETS.md)

本文档规定系统的机密生命周期、防泄漏准则、轮换流程与应急吊销处置 SOP。

---

## 1. 核心安全准则 (零泄漏原则)

1. **绝对禁止提交到 Git**：所有含有凭据的文件（`.env.local`、`.env.production`、`*.pem`、`*.key`）均已由 `.gitignore` 忽略，并在 CI 门禁（Stage J `tests/audit-gate-stage-j.test.ts`）中强制扫描。
2. **严禁在日志中输出明文**：所有错误处理、诊断输出、订单详情日志均实施字段脱敏，禁止记录用户的未哈希密钥、JWS 完整私钥、CVV 或邮箱原文。
3. **安全注入方式**：生产凭据仅通过 Vercel Environment Variables 与 Supabase Vault / Edge Secrets 注入，不得通过微信、Telegram、截图或聊天窗口明文传输。

---

## 2. 核心密码学密钥生成指南

在正式上线前，系统所有者需在离线本地终端执行下列安全生成命令：

### A. HMAC-SHA256 根秘钥 (`KEY_HMAC_SECRET`)
用于单向对明文卡密计算索引哈希。
```bash
# 生成 32 字节高熵十六进制随机串
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### B. Ed25519 签名密钥对 (`ED25519_PRIVATE_KEY_PEM` & 公钥)
用于签发与验证扩展激活令牌。
```bash
# 生成 Ed25519 私钥 (PKCS8 PEM)
openssl genpkey -algorithm Ed25519 -out ed25519_private.pem

# 提取公钥 (SPKI PEM)
openssl pkey -in ed25519_private.pem -pubout -out ed25519_public.pem
```

### C. 卡密对称加密密钥 (`LICENSE_KEY_ENCRYPTION_KEY`)
用于 AES-256-GCM 密文存储，以便给买家补发邮件。
```bash
# 生成 32 字节 Base64 编码密钥
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 3. 密钥轮换 SOP

### 3.1 Ed25519 签名私钥轮换 (零停机平滑轮换)
若怀疑私钥泄露，或按季度常规轮换：
1. 本地生成新的密钥对，分配新的 Key ID（例如 `kid-2026-v2`）。
2. 在 `ED25519_KEYRING_JSON` 环境变量中保留旧公钥，并追加新公钥：
   ```json
   {
     "kid-2026-v1": "-----BEGIN PUBLIC KEY-----\n...",
     "kid-2026-v2": "-----BEGIN PUBLIC KEY-----\n..."
   }
   ```
3. 更新 `ED25519_CURRENT_KID=kid-2026-v2` 与 `ED25519_PRIVATE_KEY_PEM`。
4. 部署生效。已激活用户的现有令牌将在 24 小时静默续期时自动获取由新密钥签署的令牌；未过期的旧令牌仍可通过 Keyring 校验通过，业务完全平滑无感。
5. 7 天后从 Keyring 中彻底移除 `kid-2026-v1`。

### 3.2 Webhook 密钥轮换
1. 在 Stripe 控制台创建新的 Webhook 密钥，同时保留旧秘钥。
2. 更新 Vercel 环境变量 `STRIPE_WEBHOOK_SECRET` 并重新部署。
3. 在 Stripe 控制台确认新 Webhook 投递成功后，删除旧密钥。
