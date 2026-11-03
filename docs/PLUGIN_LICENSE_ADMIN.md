# 插件密钥管理

目标项目：Vercel `vibe-flow-website-for-auto-check`，页面 `/admin` → **Key Inventory**。该入口现在管理与扩展 Device API 相同的插件授权表，替代旧版库存界面。支付和订单逻辑保持原样。

## 使用

1. 使用现有管理员密码登录。
2. 选择试用、学期或永久授权；填写到期时间（马来西亚 UTC+8）、设备数量（1–100）与备注。
3. 点击“生成插件密钥”，当场复制并保存。关闭弹窗后不能恢复原始密钥。
4. 在授权记录中按方案、状态筛选并翻页；展开“设备与操作记录”查看绑定设备和最近20条审计记录。
5. “解绑设备”只释放名额并记录原因，不删除设备凭证、不改课表或手机权益，也不向旧设备明确返回授权已停用。持有密钥的人仍可在有名额时重新激活。
6. “停用密钥”是单独的明确停用操作，使用现有 revoke RPC；影响整张许可证，设备在下一次联网授权检查后获知。

时效从填写的到期时间计算，不是首次激活后开始计时。永久方案不设置到期时间。新增密钥采用20字节随机数、32字符Base32、八组格式的 `AC-LIC-…`；只向管理员返回一次原文，数据库和审计只保存哈希、备注与授权元数据。

## 安全与部署

- 所有读取与修改均先验证现有8小时管理员会话，权限凭证只在服务端使用。
- 只读取 `PLUGIN_AUTH_SUPABASE_URL` / `PLUGIN_AUTH_SUPABASE_SERVICE_ROLE_KEY`，URL固定为 `https://qckpwckfukyurkobrsig.supabase.co`。不回退到订单/商务数据库。
- 两个独立变量已配置在该Vercel项目的production环境中；旧CHINA和商务连接不变。预览环境不会自动继承production变量。
- 仅应用 `supabase/migrations/20261103142304_plugin_license_admin_device_release.sql`，不要执行全仓库 `db push`。
- 增量只扩充事件类型并增加service-role-only解绑RPC；原激活、校验与停用RPC均不修改。
- 基线生产源码为 `939daf0468749765c2cd525f63bc9e0a3ea119c4`；工作分支 `codex/plugin-license-admin-20261103`。保留原有HitPay退役设置。
- 用户确认调试旧密钥无需兼容。当前实现不在打开页面时自动删除任何密钥；清空测试密钥可另行执行，不能连带删除设备、课表或手机权益。
- 回退网站到原生产部署即可恢复旧界面。新RPC和事件类型可保留，不删除审计记录；不需要回滚原有授权RPC。

## 验证证据

- 25/25定向测试通过：签发格式和哈希、鉴权顺序、输入校验、数据库目标隔离、分页与数据脱敏、解绑事务和权限、原管理员认证与条款/退役回归。
- 3/3真实Chrome浏览器测试通过：签发一次性显示与明文不持久化、分页、390px布局、解绑/停用确认、错误脱敏与退出登录后不可访问。
- Next.js生产构建与类型检查通过。测试使用本地REST替身和独立PGlite，无生产发卡、支付或学校提交。
- 独立只读审查未发现P1/P2阻断项。
- Impeccable静态检查未报告规则命中；不代表完整计算对比度审计。
- 本地webpack构建暴露旧代码的浏览器/服务端边界问题：购买按钮从带Node加密导入的文件读取条款版本号。现将不变常量拆到 `lib/consent-version.ts`，原服务端文件重导出，条款值和支付行为不变。
- 截图：[桌面](screens/plugin-admin-desktop.png)、[手机](screens/plugin-admin-mobile.png)。截图使用虚构测试数据。

命令：

`node node_modules/tsx/dist/cli.mjs --test tests/plugin-license-admin.test.ts tests/plugin-license-release.test.ts tests/admin-auth.test.ts tests/checkout-consent-and-security.test.ts tests/consent-and-tokens.test.ts tests/hitpay-migration.test.ts`

`node node_modules/@playwright/test/cli.js test --config playwright.plugin-admin.config.ts`

`node node_modules/next/dist/bin/next build --webpack`

## 生产状态

尚未写入最终发布记录前，仅代表本地实现与验证完成；不是线上已部署证明。
