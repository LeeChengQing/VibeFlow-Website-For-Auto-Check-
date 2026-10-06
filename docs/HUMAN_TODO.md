# 仅限项目所有者完成的人类待办事项清单 (HUMAN_TODO.md)

> **法律与工程边界声明**：  
> 本清单所列事项属于需要云端账户特权、真实资金流转、离线硬件安全或法务合规审核的操作，AI 编码代理绝无权限亦不得代办。工程团队已完成全部 206 项离线隔离代码实现与自动化测试。请项目所有者按以下优先级逐项推进。

---

## 优先级矩阵总览

| 优先级 | 事项代码 | 事项名称 | 预计耗时 | 阻塞的发布环节 |
|:---:|:---:|---|:---:|---|
| **P0** | H01 | 安装 Docker Desktop 与 Supabase CLI | 30 分钟 | 真实本地多会话并发竞争压力测试 |
| **P0** | H02 | 域名 DNS 记录配置 (SPF / DKIM / DMARC) | 20 分钟 | 高校学生邮箱 (`.edu`) 履约邮件送达 |
| **P0** | H03 | 创建/升级 Supabase Pro 生产项目并开启自动备份 | 15 分钟 | 正式上线（免费版因无活动会休眠） |
| **P0** | H04 | 生成生产密码学秘钥并安全冷备份 | 20 分钟 | 生产环境密钥激活与令牌签发 |
| **P0** | H05 | 为全部平台账户开启 2FA 双因素认证 | 30 分钟 | 商业资产与控制台防被盗 |
| **P0** | H06 | Stripe 生产账户启用与受限业务条款确认 | 30 分钟 | 国际信用卡与 FPX 真实收款 |
| **P0** | H07 | ToyyibPay 商户身份审核与银行结算绑定 | 1-2 个工作日 | 马来西亚本地网银直连通道 |
| **P0** | H08 | 真实小额资金端到端全流程验证 (购买→激活→退款) | 20 分钟 | 最终商业批准上线 (Live Go-No-Go) |
| **P0** | H09 | 法律合规与服务政策草案专业审阅 | 1-2 天 | 规避高校行为准则与消费者保护风险 |
| **P1** | H10 | 手机端订阅管理员私密告警 Topic | 10 分钟 | 及时接收缺货、故障与退款告警 |
| **P1** | H11 | 配置外部健康检查与探活报警 (UptimeRobot) | 15 分钟 | 网站宕机即时通知 |
| **P1** | H12 | 368云寄售 (卡网) 上架与费率确认 | 40 分钟 | 匿名国内买家卡密代销渠道 |
| **P2** | H13 | 生产应急停用与熔断演练 | 30 分钟 | 面对目标签到系统改版时的快速反应 |

---

## 逐项详细操作 SOP

### H01: 安装 Docker Desktop 与 Supabase CLI (P0)
- **为什么重要**：PGlite 提供了极佳的内存级单连接测试，但真正的 Postgres 行级排他锁（`FOR UPDATE SKIP LOCKED`）高并发压力测试与 Supabase 本地模拟环境依赖 Docker。
- **具体步骤**：
  1. 下载并安装 [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/)，开启 WSL2 后端并启动。
  2. 使用 PowerShell 安装 Supabase CLI：
     ```powershell
     scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
     scoop install supabase
     # 或使用 npm
     npm install -g supabase
     ```
  3. 在项目根目录运行 `supabase start`，验证本地容器化数据库正常启动。
- **验收标准**：命令行运行 `supabase status` 输出正常运行的服务容器列表。

---

### H02: 域名 DNS 记录配置与高校邮箱送达实测 (P0)
- **为什么重要**：高校邮箱（如英国 Southampton 的 `@soton.ac.uk` 或国内高校邮箱）对反垃圾邮件策略极其严格，未配置 SPF/DKIM/DMARC 的邮件 100% 会被直接拒收或静默丢弃，导致买家付完款收不到卡密。
- **具体步骤**：
  1. 登录域名服务商控制台（如 Cloudflare, Namecheap），进入 DNS 解析配置。
  2. 添加由 Resend 控制台提供的 SPF TXT 记录：
     `v=spf1 include:amazonses.com ~all`
  3. 添加 3 条由 Resend 提供的 DKIM CNAME 记录。
  4. 添加 DMARC 保护记录：
     `主机名: _dmarc, 类型: TXT, 记录值: v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc@你的域名`
  5. 在 Resend 控制台发起“Verify Domain”。
  6. 向真实的学校邮箱发送一封测试履约邮件，检查收件箱与邮件头（Authentication-Results: spf=pass dkim=pass dmarc=pass）。
- **验收标准**：测试邮件直接送达收件箱，未被归入垃圾箱或退信。

---

### H03: 创建/升级 Supabase Pro 生产项目并开启自动备份 (P0)
- **为什么重要**：Supabase Free 版项目在 7 天无 API 调用后会被强制休眠，导致在线服务中断；且免费版无每日自动全量物理备份与 PITR（时间点恢复）。
- **具体步骤**：
  1. 登录 Supabase 仪表盘，将绑定的生产 Project 升级为 Pro 计划（\$25/月）。
  2. 进入 `Project Settings` → `Database` → `Backups`，确认开启每日自动备份。
  3. 执行一次手动导出备份，将 `.sql` 备份归档至冷存储。
- **验收标准**：备份状态显示为 Active，最新备份时间戳不超过 24 小时。

---

### H04: 生成生产密码学秘钥并安全冷备份 (P0)
- **为什么重要**：卡密哈希根秘钥、Ed25519 签名私钥与 AES-GCM 加密秘钥是系统的命脉。私钥丢失将导致全网已售卡密无法验签；私钥泄漏将导致任意攻击者可伪造无限数量的永久使用权。
- **具体步骤**：
  1. 参照 `docs/SECRETS.md` 本地离线执行脚本生成密钥串。
  2. 将私钥填入 Vercel 生产环境变量与 Supabase Edge Secrets。
  3. 制作一份物理介质备份（打印在纸质卡片上或保存在断网加密 U 盘中，放入保险箱）。
  4. **严禁**将上述私钥留在任何个人笔记本便签、未加密网盘、聊天软件中。
- **验收标准**：生产环境变量完成配置，且本地存在经密码学验证的离线物理备份。

---

### H05: 为全部平台账户开启 2FA (P0)
- **具体步骤**：
  逐一进入以下账户的安全设置中心开启基于 Authenticator App (TOTP) 的两步验证，并妥善保存 Recovery Codes：
  1. Supabase
  2. Vercel
  3. GitHub
  4. Stripe
  5. ToyyibPay
  6. 域名注册商
  7. 邮件提供商 (Resend / 企业邮箱)
- **验收标准**：登录每个平台均必须输入动态验证码。

---

### H06: Stripe 生产账户启用与受限业务确认 (P0)
- **具体步骤**：
  1. 登录 Stripe 控制台，提交企业/个人纳税人识别号与银行卡账户，完成 Live 模式激活。
  2. 仔细阅读 Stripe 服务条款中关于受限业务（Restricted Businesses）的定义。本工具定义为“日程提醒与自动签到辅助插件”，明确不是代理作弊或刷量工具。
  3. 在 Developers → Webhooks 中配置生产端点：`https://<PROD_DOMAIN>/api/checkout/stripe/webhook`，监听 `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`。
- **验收标准**：Stripe 仪表盘状态显示为“Ready to accept payments”，Webhook 端点测试 Ping 返回 200。

---

### H07: ToyyibPay 商户身份审核与银行结算绑定 (P0)
- **具体步骤**：
  1. 登录 ToyyibPay 平台提交马来西亚银行账户资料，完成实名与企业/个人认证。
  2. 获取生产 `userSecretKey` 与 `categoryCode`。
  3. 在测试环境中通过环境变量配置并在非高峰期实测 FPX 跳转流程。
- **验收标准**：生成的测试账单能够正常跳转至马来西亚各银行网银登录界面。

---

### H08: 真实小额资金端到端全流程验证 (P0 - 最终放行关卡)
- **具体步骤**：
  由人类使用个人银行卡，以真实资金RM 30.00购买一次 Complete Bundle：
  1. 在官网前台勾选服务条款，点击支付并完成真实扣款。
  2. 验证支付成功页自动跳转，并在 3 分钟内顺利显示卡密与下载链接。
  3. 检查个人邮箱收到带有订单访问令牌与卡密的邮件。
  4. 下载 ZIP 解压至 Chrome 开发者模式，输入卡密成功激活，手机扫码绑定 ntfy 收到欢迎推送。
  5. 在 Stripe 后台发起全额退款。
  6. 验证扩展端在 5 分钟内感知撤销，退款废钥闭环生效，再次尝试激活被坚决拒绝。
- **验收标准**：全链路资金与状态闭环 100% 顺畅。

---

### H09: 法律合规与服务政策草案专业审阅 (P0)
- **具体步骤**：
  1. 查看 `docs/LEGAL_DRAFTS/` 下的《服务条款》、《隐私政策》与《退款政策》。
  2. 将文本交由熟悉跨国互联网商业法或教育行业法律的专业法务审阅。
  3. 确认知识产权免责声明、不可抗力条款及学生自主打卡责任划分。
- **验收标准**：法律政策草案定稿并发布至官网 `/terms`、`/privacy` 与 `/refund` 页面。

---

### H10 & H11: 监控告警配置 (P1)
- **ntfy 订阅**：手机下载官方 ntfy App，订阅环境变量 `NTFY_ADMIN_TOPIC` 所配置的高熵私有频道。
- **探活配置**：在 UptimeRobot 上添加 HTTP 监控，目标为 `https://<PROD_DOMAIN>/api/health`，检测周期设为 60 秒。

---

### H12: 368云寄售 (卡网) 上架与费率确认 (P1)
- **具体步骤**：
  1. 运行密钥批量生成脚本：`npx tsx scripts/keys/generate.ts --plan bundle --count 50 --batch 202610-kawang-01`
  2. 导出符合卡网格式的明文卡密列表：`npx tsx scripts/keys/export-kawang.ts`
  3. 在卡网后台创建商品，粘贴卡密，设置商品介绍（注明退款条件与售后工单网址 `https://<PROD_DOMAIN>/support`）。
- **验收标准**：卡网库存与数据库 staging 批次记录一一对应。
