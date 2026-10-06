# Self-Hosted ntfy Migration & Architecture Guide (加固版自建指南)

本文档针对 Auto-Check 手机通知服务（基于 ntfy）在用户规模扩大、公有 `ntfy.sh` 限额达到瓶颈或需要更高数据自主权时的自建与加固部署预案。

---

## 1. 架构概览

```
[浏览器扩展] 
     │ (签名令牌 + 最小化打卡提醒)
     ▼
[Auto-Check Website / API]
     │ (双重鉴权: verify token + entitlements.status == 'active')
     ▼
[Postgres notifications 队列 (queued)]
     │
[notification-worker]
     │ (Bearer Token / Private Header)
     ▼
[自建 ntfy 实例 (Docker / Linux)]
     ├── Caddy / Nginx (HTTPS, HSTS, Rate Limit)
     ├── ntfy server (server.yml, ACL 强管控)
     └── iOS 远程推送中继 (Upstream to https://ntfy.sh for iOS APNs)
```

---

## 2. 部署步骤 (Docker Compose)

### 2.1 `docker-compose.yml`
```yaml
version: '3.8'

services:
  ntfy:
    image: binwiederhier/ntfy:latest
    container_name: ntfy
    restart: unless-stopped
    command:
      - serve
    environment:
      - TZ=Asia/Kuala_Lumpur
    volumes:
      - /var/cache/ntfy:/var/cache/ntfy
      - /etc/ntfy:/etc/ntfy
      - /var/lib/ntfy:/var/lib/ntfy
    ports:
      - "127.0.0.1:8080:80"

  caddy:
    image: caddy:2-alpine
    container_name: ntfy-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - /var/lib/caddy/data:/data
      - /var/lib/caddy/config:/config
    depends_on:
      - ntfy
```

### 2.2 配置文件 `/etc/ntfy/server.yml`
```yaml
# 基础配置
base-url: "https://notify.auto-check.example.com"
cache-file: "/var/cache/ntfy/cache.db"
cache-duration: "12h"
attachment-cache-dir: "/var/cache/ntfy/attachments"
attachment-total-size-limit: "0" # 禁止附件上传，最小化存储攻击面

# 认证与 ACL
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all" # 默认零权限，必须显式授权

# 限流与安全
behind-proxy: true
visitor-subscription-limit: 30
visitor-request-limit-burst: 60
visitor-request-limit-sustained: "120/m"

# iOS APNs 转发 (解决 iOS 后台推送必须 APNs 的问题)
# iOS 客户端必须经由官方 ntfy.sh 转发才能收到 Apple 推送
upstream-base-url: "https://ntfy.sh"
```

---

## 3. ACL 与权限控制策略

1. **服务端发布账号 (`publisher`)**：
   ```bash
   # 创建发布专用账号并生成 Bearer 令牌
   docker exec -it ntfy ntfy user add --role=admin autocheck_publisher
   docker exec -it ntfy ntfy token add autocheck_publisher
   ```
2. **只读订阅权限配置**：
   - 允许匿名或凭证订阅指定 topic：
   ```bash
   # 为所有生成的 topic 开放读取权限（用户手机端订阅）
   docker exec -it ntfy ntfy access '*' 'topic_*' read-only
   ```
   - 只有 `autocheck_publisher` 拥有写入 (`write-only` / `read-write`) 权限。即使攻击者猜测到 topic 名称，也**绝对无法向该 topic 注入虚假通知**。

---

## 4. 环境变量切换

自建 ntfy 部署完成后，在 Auto-Check Website 生产环境更新环境变量即可零代码切换：

```env
# 切换至自建服务器
NTFY_SERVER_URL="https://notify.auto-check.example.com"
NTFY_AUTH_TOKEN="tk_live_secure_publisher_token_xxxxxxxx"
```

---

## 5. 备份与高可用方案

1. **SQLite 数据库备份**：
   - 定时备份 `/var/lib/ntfy/user.db`（用户与权限）及 `/var/cache/ntfy/cache.db`。
   - 每日由 cron 任务同步至离线冷备存储。
2. **故障熔断与降级**：
   - 若自建实例故障，`notification-worker` 将捕获 HTTP 5xx 并在指数退避后标记 `failed`。
   - 可无缝在后台将 `NTFY_SERVER_URL` 切回公共 `https://ntfy.sh`，不中断核心业务。
