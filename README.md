<div align="center">

# Canopy

**AI API 中转站的元聚合层 · One canopy, every upstream**

把分散的 New API / One API / OneHub / DoneHub / Veloera / AnyRouter / Sub2API 等聚合面板，以及 OpenAI / Claude / Gemini 等直连或 OAuth 上游，统一收敛为一个 **OpenAI / Claude 兼容的入口**——一个 Key、一个 Base URL，自动发现模型、智能路由、成本优先、故障转移、自动签到。

</div>

---

## 为什么用 Canopy

- **一个入口**：下游客户端（Cursor、Claude Code、Codex 等）只需配置一个 `/v1/*` Base URL 和一个 Key。
- **自动模型发现**：上游新增模型自动出现，规则路由（精确 / 通配 / 正则）自动生成通道。
- **智能路由**：按成本、余额、利用率、站点健康度综合打分，失败自动冷却与转移，决策全程可审计。
- **跨格式互转**：Claude 格式下游调 OpenAI 上游（反之亦然），SSE 流式、思考过程标签、工具调用完整透传。
- **完全自托管**：默认 SQLite 零外部依赖；支持 MySQL / PostgreSQL 运行时切换；单容器部署。
- **自动签到与余额跟踪**：定时签到、余额刷新、Webhook / Bark / Telegram 多渠道告警。

## 快速开始

### Docker（推荐）

```bash
# 构建本地镜像（默认使用 docker-compose.override.yml 的本地构建）
docker compose -f docker/docker-compose.yml -f docker/docker-compose.override.yml up -d --build

# 首次启动前需要设置令牌：
#   AUTH_TOKEN   —— 管理后台登录令牌（/api/*）
#   PROXY_TOKEN  —— 下游访问令牌（/v1/*）
```

若宿主机在代理之后，在 `docker/.env` 中设置 `HTTP_PROXY` / `HTTPS_PROXY`
（只作为构建参数传入，不会烧入镜像）。

### 源码运行

```bash
npm install
npm run db:migrate
npm run dev           # 后端 :4000 + 前端 :5173
```

> 需要 Node.js 25+。

## 使用要点

1. **站点管理** — 添加 New API / One API / OneHub 等中转站账号（Token 或 Cookie）。
2. **令牌管理** — 为各账号生成/同步上游令牌；启用/禁用令牌会在库内重建路由（不请求上游）。
3. **模型路由** — 模型列表自动生成；支持精确 / `*` 通配 / `re:` 正则规则，可手动覆盖通道。
4. **下游接入** — 把 `/v1` 地址与代理 Key 填进 Cursor / Claude Code / Codex 即可。

## 文档

- 使用与运维说明见仓库 `docs/`（暂未发布在线站点）。
- 开发与架构说明见 [`CLAUDE.md`](CLAUDE.md)。

## 技术栈

Fastify · React 18 / Vite · TypeScript · Drizzle ORM（SQLite / MySQL / PostgreSQL）· Electron（桌面版）

## License

[MIT](LICENSE) © 2026 WxylkxyZz