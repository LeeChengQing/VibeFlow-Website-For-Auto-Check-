# 执行决策记录

权威：CODEX_SPEC附录A与正文第21节；2026-10-06开始。下表是执行决策，未标验证即不代表已实现。

| ID | 决策 | 原因/限制 |
|---|---|---|
| D01 | 保留orders/key_inventory/issued_licenses和已发布站点价格；不建license_keys/payments/plans平行表 | 附录A.2，减少迁移和验签/履约回归 |
| D02 | 保留订单锁/SKIP LOCKED/唯一关联/先capture再履约；webhook_events仅审计 | 已有正确防重边界，新增邮件/退款不替换它 |
| D03 | extension→core；bundle→单把bundle(core+130天phone)；通知兑换要求同device有效core | A.3默认，notify单独不授core |
| D04 | core不到期；support_until默认购买后12个月，不自动停用 | 支持期与使用权分开；人类可改未来SKU，不追溯缩短旧权 |
| D05 | 新通知有效期从首次兑换起算：semester130天/yearly365天；续订从max(当前到期,now)累计 | 避免现有履约即计时和续订缩短；历史期限按来源原样迁移 |
| D06 | 新版core门禁已通过后，公开版本ZIP；记录asset/version/hash；旧未锁ZIP不作为正式发布 | 下载不作授权边界；不可在G完成前声称可安全公开发行 |
| D07 | 保留AES-GCM encrypted_key用于邮件/找回；版本化密钥与AAD；旧hash不原地覆写 | 旧AAD绑定hash，盲重哈希会破坏解密；中国hash不能恢复原码 |
| D08 | 新key100bit Crockford Base32+checksum，v2 HMAC；保留三旧格式/大小写与v1hash验证 | 保护已生成库存；不会把monthly目录名当套餐真值 |
| D09 | 复用主E设备/队列/lease/recovery逻辑；不部署未接入的license-security平行schema | 已有可靠边界；可借用其HTTP/平台查询适配代码 |
| D10 | 新核心后端的迁移/部署入口集中在W；E保持独立客户端源码仓库与历史后端快照 | 避免两个迁移目录拼接drop activation_keys；统一一套部署事实与cross-repo提交证据 |
| D11 | 新敏感表用非暴露schema+RLS；现W表保持强制RLS/零浏览器grants，按需service-only RPC | 不为风格搬迁已正确commerce访问；逐表测试权限 |
| D12 | 先建立离线mock/loopback测试网络和环境隔离，再跑现有全量tests | 现Playwright可继承云配置；绝不测试生产 |
| D13 | A是只读审计，验收是规格/源码覆盖检查；应用全量基线在P0隔离前置完成 | 不在“只读”期间运行会生成产物或访问云端的命令；没有历史PASS冒充当前结果 |
| D14 | P0功能必要的最小迁移跟功能提交；完整B数据库阶段仍在商业P0之后 | 邮件任务/访问token/退款不能没有存储；不借依赖提前大改数据库 |
| D15 | 默认自建最小生产工单；所有页面/邮件/政策使用统一客服配置 | 避免未经提供的邮箱/WhatsApp地址；人类设置真实联系人后外部渠道可替换 |
| D16 | 默认邮件Resend适配，ntfy认证/自建可配置；CI只mock，实际送达单列dev验收 | 不编造API、无凭据不假装发出；只称provider accepted |
| D17 | Supabase Auth+邮箱白名单+AAL2作生产管理员；共享密码仅显式本地开发 | 保留cookie安全属性，MFA未配不得生产降级 |
| D18 | notification_outbox复用/扩展，保留uncertain隔离，不自动重发可能已被平台接受的消息 | 外部ntfy无可依赖的端到端exactly-once；不能用重试制造重复 |
| D19 | 课表/Forms URL云同步默认关闭；通知上传只事件ID/类型/时间，通用服务器文案 | spec数据最小化；本地识别/填写/历史保留，不上传账号密码Cookie |
| D20 | 高风险写操作与业务拒绝持久审计；不把事务回滚后的审计当持久记录 | PostgreSQL raise会回滚同事务audit；包装器记录typed拒绝/独立错误事件并返回安全错误 |
| D21 | 不读取/使用现有.env真实凭据，不部署不push；生产切换/真实资金由人类执行 | 用户硬约束 |
| D22 | W使用本工作区，E保持客户端源码；不复制生产凭据，统一通过测试隔离运行 | 避免环境污染与私钥泄露 |
| D23 | 本机现有200把旧密钥库存视为测试数据，不把低熵旧格式迁入生产；新库存一律使用v2格式（≥100 bit Crockford Base32+HMAC）；旧格式兼容仅限dev现有数据 | 用户约束1，彻底阻断低熵密钥进入生产 |
| D24 | 扩展core门禁必须“失败时宽松”（Fail-open for previously active）：已激活用户遇到网络或服务端验证异常时绝不中断进行中的打卡任务，仅提示；只有从未激活的用户才硬性拒绝 | 用户约束3，保障学生关键打卡可靠性 |

## 配置默认值

| 项 | 值 |
|---|---|
| max_devices | 2 |
| 解绑限额 | 30天2次 |
| Ed25519 JWS token | 7天；kid轮换；不接受其他alg |
| 静默续期 | 24小时 |
| 离线宽限 | exp后72小时，不能跨服务器已知自然权益到期；服务器明确吊销即拒绝 |
| 卡网activate_by | 上架后180天 |
| 退款草稿规则 | 7天且未激活；已激活默认不退，需专业/业主确认 |
| 目标系统故障补偿 | +7天，可配置 |
| 通知TTL/daycap/retention | 20分钟/60次每日/30天 |
| 对账 | 每日，默认UTC02:00，可配置 |
| 实时撤销config缓存 | 5分钟 |
| 管理员告警去重 | 10分钟 |
| 激活速率 | IP每分钟10次，key前缀每小时20次失败后退避；不记录原key前缀 |
| 默认语言 | 中文，保留英文 |
| 缺席心跳 | 实现为可配置能力，默认关闭 |

旧E规划48h/12h/总72h尚未实施；本任务以新spec值取代规划，不迁移不存在的令牌。新值的离线撤销最长延迟必须诚实写入文档。
