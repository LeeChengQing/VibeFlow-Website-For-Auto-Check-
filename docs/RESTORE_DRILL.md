# 备份与容灾恢复演练手册 (RESTORE_DRILL.md)

本文档提供当生产 Postgres 数据库发生意外数据损坏、被勒索攻击或误操作删表时的灾难恢复 SOP。

---

## 1. 容灾恢复目标 (RPO / RTO)

- **RPO (恢复点目标)**：≤ 24 小时（Supabase Pro 每日全量备份；若启用 WAL 则可实现秒级恢复）。
- **RTO (恢复时间目标)**：≤ 60 分钟（从拉取备份到恢复只读检验完成）。

---

## 2. 演练环境准备

演练严禁在生产主库执行，必须在隔离的全新项目或本地 Docker 实例中进行：
```bash
# 启动本地隔离 Postgres 实例
docker run --name pg-restore-drill -e POSTGRES_PASSWORD=drillpass -p 54399:5432 -d postgres:16
```

---

## 3. 容灾恢复演练步骤

### 步骤 1: 导出生产备份文件
1. 登录 Supabase 控制台 → Project Settings → Database → Backups。
2. 下载最近一次生成的 `.sql.gz` 或 `.dump` 文件。
3. 对下载文件计算 SHA-256 哈希值，记录审计流水。

### 步骤 2: 恢复至演练实例
```bash
# 解压并导入演练数据库
gunzip -c backup-2026-xx-xx.sql.gz | psql -h localhost -p 54399 -U postgres -d postgres
```

### 步骤 3: 恢复完整性核对清单 (Checklist)
1. **订单与金额核对**：
   ```sql
   select count(*) as total_orders, sum(amount_minor) as total_gross 
   from public.orders where status = 'paid';
   ```
   对比生产控制台指标，确认金额完全吻合。
2. **密钥库存核对**：
   ```sql
   select plan_type, status, count(*) 
   from public.key_inventory 
   group by plan_type, status;
   ```
   确认 available 与 assigned 数量与生产一致。
3. **激活记录与设备核对**：
   ```sql
   select count(*) from public.activations;
   ```
4. **功能验证**：
   在演练库上以 `service_role` 身份执行一次测试激活与状态查询 RPC，验证存储过程与行锁能正常工作。

### 步骤 4: 演练完成与环境清理
```bash
# 停止并销毁演练容器，删除临时备份文件
docker rm -f pg-restore-drill
rm -f backup-2026-xx-xx.sql.gz
```
在操作日志中记录本次演练的执行人、时间戳与数据核对差异（正常应为 0 差异）。
