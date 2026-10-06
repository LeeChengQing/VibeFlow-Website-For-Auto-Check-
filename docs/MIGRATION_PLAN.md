# 双来源合并与回滚计划

本文件只规划。没有导出、连接、修改、重置或部署生产环境。实际生产切换由业主执行；开发迁移/回滚证据后续填写。

## 禁止直接拼接迁移

W的20261004032804迁移会drop `public.activation_keys`；E的兑换/恢复依赖同名表。E另有未接入的license-security平行schema。两者不能合成一个迁移目录直接push。保留W orders/key_inventory/issued_licenses/site_configuration；增量迁移E设备/手机权益/outbox/恢复数据，关联库存与原订单，排除平行license_keys/payments/plans。

## 人类准备的脱敏来源证据

分别在两个旧项目控制台取得表/列/类型/constraints/indexes、函数定义、RLS/policies/grants、迁移历史、函数版本、scheduler状态以及状态/方案/渠道/区域的聚合数量。输出不得含密钥、密文、token、邮箱或学校资料；带明文的完整备份只存在人类受控加密存储，绝不交聊天或Git。

本地200行CSV只证明文件存在，不证明线上库存/出售状态。E运行手册提及remote-only迁移/ledger漂移；核实前不db push、不修复远程迁移历史。

## 开发演练顺序

1. 建全新localhost/独立dev数据库，明确allowlist；屏蔽所有生产项目域名和live支付密钥。
2. 在开发构建中应用W当前迁移并验证权限/回滚；新迁移新增库存kind/channel/region/batch/hash_version、订单terms/access/release、activation/entitlement/outbox/audit能力。
3. 给E旧表准备独立source schema/staging，全部导入字段为text；不把source表名与目标commerce表混在一起。
4. CSV工具先dry-run：检查headers、空值、方案/状态、hash唯一、跨来源重复和密文格式；报告仅计数/错误行号，不打印hash/原码/密文。
5. 按文件内容plan映射：W semester→notify_semester、yearly→notify_yearly；W bundle按旧发放语义保留历史后，为新销售建立新bundle库存；E sem_subscription→legacy通知semester。monthly目录中真实plan=semester不能擅改30天。
6. 保存旧hash/canonicalization与来源；v1合法旧格式继续验证，v2才用HMAC。人类持有原码/加密secret时可独立重哈希；AES-GCM AAD需要重加密，不能只更新hash。
7. 迁移已有订单/支付ID/授权device UUID/证明token关系，不重复发货、不重置redeemed/revoked、不回收库存；匿名卡网license允许无订单/邮箱但必须关联原库存与activation。
8. 历史valid_until/activated_at/redeemed_at/expiry provenance保持原值；只有新销售使用首次兑换130/365天与core永久+support12月规则。
9. 核对来源/目标行数、状态分布、重复hash、关联孤儿、已退款仍有效、已付款未履约、密文不可解密数量；任何未知映射中止提交，不默认available。
10. 运行逐表anon/authenticated CRUD/TRUNCATE权限、真实多连接同订单/库存/两席/recovery/lease竞争、退款/topic/通知以及全链路验收。

## 计划核对查询（开发目标）

只输出聚合：库存按channel/region/kind/status/hash_version分组；orders按provider/status/confirmation/fulfillment_error分组；licenses和activations按状态/是否孤儿分组；队列按状态/TTL分组。敏感逐行数据不进入测试日志、报告或CI artifact。

## 回滚与切换

开发迁移附事务化down说明；不可逆数据迁移先保存原关联staging，回滚不删除已分配license或审计。测试用一次性fixture库重建演练，不在旧项目执行reset。

生产切换前冻结新销售/新兑换的短窗口，做人类加密备份和最终增量核对，准备新config/kid/版本ZIP、监控与逐渠道冒烟；切换网站/扩展API到唯一目标后保留旧库只读至少30天。失败则先停销售/worker，按已核对账本回滚入口；不得恢复泄露/已退款key的有效状态。没有完成dev回滚及人类批准，禁止切换。

## 当前验证状态

迁移代码/工具尚未新增；没有dev SQL执行结果，没有生产catalog/备份。不得声称“两个项目已合并”或旧库存可直接导入。
