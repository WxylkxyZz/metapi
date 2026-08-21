# Canopy 部署与配置指南

> 本文档覆盖 **环境变量（全部清单与默认值）** 与 **服务器（VPS / 云主机）部署** 两种操作。
> 所有默认值均来自 `src/server/config.ts`（运行时唯一权威来源），可直接对照。

---

## 一、三个必改令牌（重中之重）

| 环境变量 | 用途 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AUTH_TOKEN` | 管理后台 `/api/*` 访问令牌 | `123456` | **务必改为强随机值**。任何站点管理、令牌、路由、设置接口都靠它鉴权。 |
| `PROXY_TOKEN` | 下游客户端 `/v1/*` 访问令牌 | `sk-change-me` | 下游（Cursor / Claude Code / Codex）填的是它。也务必改掉。 |
| `ACCOUNT_CREDENTIAL_SECRET` | 加密上游账号凭据的主密钥 | 回退到 `AUTH_TOKEN` | **建议显式设置**一段强随机长串。未显式设置时，首次启动会生成并持久化一个强密钥（加密更安全）；显式设置后则使用你提供的值。 |

> 遗留默认值 `change-me-admin-token` / `change-me-proxy-sk-token` 与现在的默认值同样被判定为"默认凭据"，服务会在日志中给出安全警告，覆盖即可。

---

## 二、完整环境变量清单

### 1. 服务监听

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 监听地址。容器内保留默认即可；本机源码运行更安全可用 `127.0.0.1`。 |
| `PORT` | `4000` | HTTP 端口。docker-compose 里通过 `PORT` 同时控制容器内端口。 |
| `DATA_DIR` | `./data` | 数据目录（SQLite 数据库、日志、代理文件等）。**容器内默认为 `/app/data`**，务必挂载持久卷。 |
| `ADMIN_IP_ALLOWLIST` | 空 | 逗号分隔的管理后台 IP 白名单，例如 `203.0.113.5,198.51.100.0/24`。留空表示不限制。 |
| `TRUSTED_PROXY` | 空 | 逗号分隔的受信反向代理 IP 列表。**只有设置后才会信任 `X-Forwarded-*` 头**，避免伪造来源 IP。部署在 Caddy / Nginx 后面时应填写。 |

### 2. 数据库

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_TYPE` | `sqlite` | `sqlite` / `mysql` / `postgres`。可用 `POSTGRES` 或 `POSTGRESQL` 等价于 `postgres`。 |
| `DB_URL` | 空 | MySQL / Postgres 连接串，如 `mysql://user:pass@host:3306/canopy`、`postgres://user:pass@host:5432/canopy`。SQLite 时留空。 |
| `DB_SSL` | `false` | 连接数据库是否启用 SSL，设为 `true` / `1` / `yes`。 |

SQLite 数据文件就在 `DATA_DIR` 里；MySQL / Postgres 为运行时切换到外部数据库（可在设置里切换，含失败回滚）。

### 3. 定时任务

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CHECKIN_CRON` | `0 8 * * *` | 自动签到 cron 表达式（每天 08:00）。 |
| `CHECKIN_SCHEDULE_MODE` | `cron` | `cron` 用上面的表达式；`interval` 改为按小时间隔签到。 |
| `CHECKIN_INTERVAL_HOURS` | `6` | 间隔模式下的签到间隔（小时），范围 1–24。 |
| `BALANCE_REFRESH_CRON` | `0 * * * *` | 余额刷新频率（每小时）。 |
| `LOG_CLEANUP_CRON` | `0 6 * * *` | 日志清理触发 cron。 |
| `LOG_CLEANUP_USAGE_LOGS_ENABLED` | `false` | 是否清理用量日志（对应"configured"开关，默认关闭）。 |
| `LOG_CLEANUP_PROGRAM_LOGS_ENABLED` | `false` | 是否清理程序运行日志。 |
| `LOG_CLEANUP_RETENTION_DAYS` | `30` | 保留天数下限。 |

### 4. 通知告警

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WEBHOOK_ENABLED` | `true` | 启用 Webhook 告警通道。 |
| `WEBHOOK_URL` | 空 | Webhook 回调地址。 |
| `BARK_ENABLED` | `true` | 启用 Bark（iOS）推送通道。 |
| `BARK_URL` | 空 | Bark 推送地址。 |
| `TELEGRAM_ENABLED` | `false` | 启用 Telegram 告警。 |
| `TELEGRAM_BOT_TOKEN` | 空 | Telegram bot token。 |
| `TELEGRAM_CHAT_ID` | 空 | Telegram 接收 chat id。 |
| `TELEGRAM_USE_SYSTEM_PROXY` | `false` | Telegram 请求是否走 `SYSTEM_PROXY_URL`。 |
| `TELEGRAM_MESSAGE_THREAD_ID` | 空 | Telegram 话题 thread id（可选）。 |
| `NOTIFY_COOLDOWN_SEC` | `300` | 同类告警去重时间窗（秒）。 |

### 5. 网络与代理

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SYSTEM_PROXY_URL` | 空 | 出站系统代理（如 `http://127.0.0.1:7890`），用于访问上游面板与部分 OAuth/CLI 通道。 |

### 6. 上游 OAuth / CLI 客户端凭据

> 以下默认值内置了公开占位客户端，一般无需改动；仅在你自己接入对应直连/OAuth 上游时覆盖。

| 环境变量 | 默认值 |
| --- | --- |
| `CODE*_CLIENT_ID`（Codex 系列） | 内置默认 |
| `CLAUDE_CLIENT_ID` | `9d1c250a-e61b-44d9-88ed-5944d1962f5e` |
| `CLAUDE_CLIENT_SECRET` | 空 |
| `GEMINI_CLI_CLIENT_ID` | `681255809395-...appspot...` |
| `GEMINI_CLI_CLIENT_SECRET` | 内置默认 |

### 7. 模型探活与路由（请注意安全红线）

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MODEL_AVAILABILITY_PROBE_ENABLED` | **`false`** | **主动批量测活总开关，默认关闭。** ⚠️ 除非你在设置界面向模型发真实推理请求（手动触发探活），否则任何自动化都不会对上游发起模型探测。请勿在环境变量里擅自打开。 |
| `MODEL_AVAILABILITY_PROBE_INTERVAL_MS` | `30 * 60 * 1000` | 探测间隔（30 分钟）。 |
| `MODEL_AVAILABILITY_PROBE_TIMEOUT_MS` | `15_000` | 单次探测超时（15 秒）。 |
| `MODEL_AVAILABILITY_PROBE_CONCURRENCY` | `1` | 并发数，范围 1–16。 |

> **重要**：路由重建一律基于**数据库已有的可用性数据**（令牌/模型可用性表 + 通道），不会在 process 中主动向上游发探测请求。启用/禁用令牌、清除缓存、站点禁用/启用模型都会触发"纯库内重建路由"，但**绝不测活**。

#### 路由权重

| 环境变量 | 默认值 |
| --- | --- |
| `ROUTING_FALLBACK_UNIT_COST` | `1` |
| `BASE_WEIGHT_FACTOR` | `0.5` |
| `VALUE_SCORE_FACTOR` | `0.5` |
| `COST_WEIGHT` | `0.4` |
| `BALANCE_WEIGHT` | `0.3` |
| `USAGE_WEIGHT` | `0.3` |

#### 代理行为与故障转移

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PROXY_FIRST_BYTE_TIMEOUT_SEC` | `0` | 首字节超时（秒），0 表示不限制。 |
| `PROXY_STREAM_IDLE_TIMEOUT_SEC` | `0` | 流式响应空闲超时（秒），0 表示不限制。 |
| `PROXY_MAX_CHANNEL_ATTEMPTS` | `3` | 单次请求最多尝试的通道数（故障转移上限）。 |
| `PROXY_STICKY_SESSION_ENABLED` | `true` | 会话粘性（同一会话尽量复用同一通道）。 |
| `PROXY_STICKY_SESSION_TTL_MS` | `30 * 60 * 1000` | 粘性会话 TTL（30 分钟）。 |
| `PROXY_SESSION_CHANNEL_CONCURRENCY_LIMIT` | `2` | 每会话同通道并发上限，0 表示不限制。 |
| `PROXY_SESSION_CHANNEL_QUEUE_WAIT_MS` | `1_500` | 通道全忙时排队等待（毫秒）。 |
| `PROXY_SESSION_CHANNEL_LEASE_TTL_MS` | `90_000` | 通道租约 TTL。 |
| `PROXY_SESSION_CHANNEL_LEASE_KEEPALIVE_MS` | `15_000` | 租约保活间隔。 |
| `TOKEN_ROUTER_FAILURE_COOLDOWN_MAX_SEC` | `30 天上限` | 失败通道冷却上限（秒），1 到 30 天。 |
| `TOKEN_ROUTER_CACHE_TTL_MS` | `1_500` | 路由决策缓存 TTL。 |
| `PROXY_ERROR_KEYWORDS` | 空 | 逗号分隔的关键词，命中即视为该通道失败（用于故障转移判断）。 |
| `PROXY_EMPTY_CONTENT_FAIL` | `false` | 空内容响应是否判为失败。 |

#### 协议行为

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DISABLE_CROSS_PROTOCOL_FALLBACK` | `false` | 禁止跨协议（OpenAI↔Claude 等）格式互转回退。 |
| `RESPONSES_COMPACT_FALLBACK_TO_RESPONSES_ENABLED` | `false` | `/v1/responses` 紧凑模式的自由度策略。 |
| `CODEX_UPSTREAM_WEBSOCKET_ENABLED` | `false` | Codex 上游 WebSocket 通道开关。 |
| `CODEX_RESPONSES_WEBSOCKET_BETA` | `responses_websockets=2026-02-06` | Codex responses websocket beta 头。 |
| `CODEX_HEADER_DEFAULTS_USER_AGENT` / `CODEX_HEADER_DEFAULTS_BETA_FEATURES` | 空 | Codex 通道默认请求头覆盖。 |

#### 请求规则

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENAI_SERVICE_TIER_RULES` / `OPENAI_SERVICE_TIER_RULES_JSON` | 空 | OpenAI 服务等级规则，JSON 字符串。 |
| `PAYLOAD_RULES` / `PAYLOAD_RULES_JSON` | 空 | 请求/响应负载改写规则，JSON 字符串（数组逐项归一化：camelCase + snake_case 兼容，详见 `payloadRulesService`）。 |

#### Proxy 调试

> 以下变量用于定位代理链路问题，生产环境一般全关。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PROXY_DEBUG_TRACE_ENABLED` | `false` | 开启调试追踪。 |
| `PROXY_DEBUG_CAPTURE_HEADERS` | `true` | 记录请求/响应头。 |
| `PROXY_DEBUG_CAPTURE_BODIES` | `false` | 记录请求/响应体。 |
| `PROXY_DEBUG_CAPTURE_STREAM_CHUNKS` | `false` | 记录流式数据块。 |
| `PROXY_DEBUG_TARGET_SESSION_ID` | 空 | 只记录指定会话。 |
| `PROXY_DEBUG_TARGET_CLIENT_KIND` | 空 | 只记录指定客户端类型。 |
| `PROXY_DEBUG_TARGET_MODEL` | 空 | 只记录指定模型。 |
| `PROXY_DEBUG_RETENTION_HOURS` | `24` | 调试记录保留小时数。 |
| `PROXY_DEBUG_MAX_BODY_BYTES` | `262_144` | 单个 body 记录上限（字节）。 |

#### 数据保留

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PROXY_LOG_RETENTION_DAYS` | `30` | 代理日志保留天数，0 表示不清理。 |
| `PROXY_LOG_RETENTION_PRUNE_INTERVAL_MINUTES` | `30` | 代理日志清理扫描间隔（分钟）。 |
| `PROXY_FILE_RETENTION_DAYS` | `30` | 代理文件（含文件代理产物）保留天数，0 表示不清理。 |
| `PROXY_FILE_RETENTION_PRUNE_INTERVAL_MINUTES` | `60` | 代理文件清理扫描间隔（分钟）。 |

---

## 四、Docker 镜像发布

### GitHub Actions 发布条件

Docker 镜像发布不再创建 GitHub Release，也不生成桌面安装包。仓库只发布 Docker 镜像：

- 推送 `main`：只有仓库变量 `DOCKER_PUBLISH_ENABLED=true` 时才发布 `latest` 和提交 SHA 镜像。
- 推送 `v*` tag：由 Docker Publish 工作流构建并发布 Docker Hub 与 GHCR 的 `amd64`/`arm64` 多架构镜像，同时更新对应 tag 和 `latest`。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DOCKERHUB_USERNAME` | Docker Hub 用户名 |
| Secret | `DOCKERHUB_TOKEN` | Docker Hub Read & Write 访问令牌 |
| Variable | `DOCKER_PUBLISH_ENABLED` | 设为 `true` 才启用 main push 发布 |

创建正式镜像 tag：

```bash
git tag v1.0.2
git push origin v1.0.2
```

拉取镜像：

```bash
docker pull <dockerhub_username>/canopy:v1.0.2
docker pull <dockerhub_username>/canopy:latest
docker pull ghcr.io/WxylkxyZz/Canopy:v1.0.2
docker pull ghcr.io/WxylkxyZz/Canopy:latest
```

### 更新 / 升级实例

新版本发布后，拉取新 tag（或 `latest`）并重建容器即可。**数据全部在数据卷（`./data:/app/data`）中，升级不丢数据**；Schema 变更通过启动时自动应用迁移（Drizzle + 兼容补列），无需手动执行 SQL。

> ⚠️ 升级前建议先备份数据卷，尤其是跨大版本时：
>
> ```bash
> docker compose stop
> tar -czf canopy-data-backup-$(date +%Y%m%d).tar.gz data/
> ```

使用 compose：

```bash
docker compose -f docker/docker-compose.yml pull canopy   # 拉取新镜像
docker compose -f docker/docker-compose.yml up -d canopy  # 重建并重启
docker compose logs -f canopy                             # 查看启动日志，确认迁移正常
```

> 若你的 compose 用了 `docker-compose.override.yml`（本地构建），`pull` 会被覆盖行为取代，改用 `--build`：
>
> ```bash
> docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build
> ```

直接用 docker run：

```bash
docker rm -f canopy   # 停止并删除旧容器（数据卷不删）
docker run -d --name canopy \
  -p 127.0.0.1:4000:4000 \
  -e AUTH_TOKEN=... -e PROXY_TOKEN=... -e ACCOUNT_CREDENTIAL_SECRET=... -e TZ=Asia/Shanghai \
  -v /opt/canopy/data:/app/data \
  --restart unless-stopped \
  your-registry/canopy:v1.0.2   # 换成新版本 tag
```

**回滚**：启动失败或遇到问题时，改用上一个版本 tag 重新启动即可（数据卷不变）：

```bash
docker compose -f docker/docker-compose.yml up -d canopy   # 用旧 tag 覆写镜像版本
```

## 五、Docker 部署（推荐）

### 使用 compose（已提供现成文件）

```bash
cd /opt
git clone https://github.com/WxylkxyZz/Canopy.git canopy
cd canopy
cp docker/.env.example docker/.env   # 如果仓库提供样例；否则手动创建 docker/.env
```

在 `docker/.env` 中写入：

```ini
# 必填
AUTH_TOKEN=请改成强随机值
PROXY_TOKEN=请改成强随机值
# 推荐
ACCOUNT_CREDENTIAL_SECRET=再填一强随机长串
# 可选
TZ=Asia/Shanghai
PORT=4000
```

启动：

```bash
# 本地构建并启动（含 docker-compose.override.yml 的本地构建）
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build
```

- 默认只监听 `127.0.0.1:4000`，外部通过反向代理暴露。
- 数据卷 `./data:/app/data` 挂载到宿主机 `docker/data/`。
- 宿主机在代理之后时，在 `docker/.env` 设置 `HTTP_PROXY` / `HTTPS_PROXY`（仅作构建参数，不烧入镜像）。

### 直接用 docker run

```bash
docker run -d --name canopy \
  -p 127.0.0.1:4000:4000 \
  -e AUTH_TOKEN=强随机值 \
  -e PROXY_TOKEN=强随机值 \
  -e ACCOUNT_CREDENTIAL_SECRET=强随机长串 \
  -e TZ=Asia/Shanghai \
  -v /opt/canopy/data:/app/data \
  --restart unless-stopped \
  your-registry/canopy:latest
```

> 数据目录务必挂载持久卷，否则升级/重建容器会丢数据。

### 本地（源码）运行

```bash
npm install
npm run db:migrate
npm run dev              # 后端 :4000 + 前端 :5173
```

需要 **Node.js 25+**。生产部署建议用 `npm run build` 后 `npm start`。

---

## 六、VPS 部署逐步指南

### 1. 环境准备（Debian / Ubuntu）

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
```

### 2. 拉取代码并配置

```bash
cd /opt
sudo git clone https://github.com/WxylkxyZz/Canopy.git canopy
cd canopy
sudo mkdir -p docker/data
# 编辑 docker/.env，填入上面三个必填令牌
```

### 3. 启动

```bash
sudo docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build
```

### 4. 反向代理 + HTTPS（Caddy，最简单）

Caddy 自动申请证书：

```caddyfile
api.example.com {
    reverse_proxy 127.0.0.1:4000
}
```

Nginx 反代示例（开启后请设 `TRUSTED_PROXY=127.0.0.1`）：

```nginx
server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "";
    }
}
```

> 反代 http 1.1 + `Connection ""` 是为了 SSE 流式兼容。

### 5. 防火墙

仅放行 80/443（如果反代在别的机器，则只放行该机器 IP 到 4000）。**不要**把 `4000` 直接暴露公网，除非你已启用 TLS 与访问控制。

### 6. 开机自启与升级

`docker-compose.yml` 已设 `restart: unless-stopped`。升级：

```bash
cd /opt/canopy
sudo git pull
sudo docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build
```

### 7. 备份

- **SQLite**：备份 `docker/data/`（或整个 `DATA_DIR`）。可配 cron，例如每天打包：
  ```bash
  tar czf /backups/canopy-data-$(date +%F).tar.gz -C /opt/canopy docker/data
  ```
- **MySQL / Postgres**：用平台自带工具做逻辑备份，同时保证 `DATA_DIR` 里仍需要的文件有备份。

---

## 七、安全检查清单（上线前）

- [ ] `AUTH_TOKEN`、`PROXY_TOKEN` 已改强随机值。
- [ ] `ACCOUNT_CREDENTIAL_SECRET` 已显式设置（或已确认首次启动日志中的警告可接受）。
- [ ] 数据库有备份策略。
- [ ] `TRUSTED_PROXY` 只在有反向代理时填写，避免伪造 IP。
- [ ] 管理端口未直接暴露公网。
- [ ] `MODEL_AVAILABILITY_PROBE_ENABLED` 保持 `false`，除非你在设置界面手动开启测活并确认上游允许。