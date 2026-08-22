# Canopy 整体架构报告(中文)

> 本文档基于 `CLAUDE.md`、`package.json` 与 `src/` 目录实际代码的一手阅读(共 896 个源文件、435 个测试文件)整理,适用于新成员快速理解代码库、以及作为后续架构演进与债务治理的参考基线。
>
> 覆盖范围:项目技术栈与核心依赖 · 目录结构与模块划分 · 核心数据流 · 数据库模型与迁移策略 · 认证与安全模型 · 定时任务与后台调度 · 前端架构 · 设计亮点与潜在架构风险。

---

## 目录

1. [项目定位与总览](#一项目定位与总览)
2. [技术栈与核心依赖](#二技术栈与核心依赖)
3. [目录结构与模块划分](#三目录结构与模块划分)
4. [核心数据流](#四核心数据流)
5. [数据库模型与迁移策略](#五数据库模型与迁移策略)
6. [认证与安全模型](#六认证与安全模型)
7. [定时任务与后台调度](#七定时任务与后台调度)
8. [前端架构](#八前端架构)
9. [设计亮点与潜在架构风险](#九设计亮点与潜在架构风险)
10. [附录:关键术语](#附录关键术语)

---

## 一、项目定位与总览

Canopy 是 AI API 聚合站之上的**"元聚合"层**——它坐落在聚合面板(New API、One API、OneHub、DoneHub、Veloera、AnyRouter、Sub2API)与直连/官方 OAuth 上游(OpenAI、Claude、Gemini、Codex、Gemini CLI、Antigravity、cliproxyapi)之上,对外暴露**单一 OpenAI 兼容 + Claude 兼容端点**。

下游客户端(Cursor、Claude Code、Codex 等)只需配置一个 `/v1/*` base URL 与一个 API key;Canopy 负责:

- **模型发现**:从各上游聚合面板自动发现可用模型;
- **智能路由**:按成本 / 余额 / 利用率 / 运行时健康加权选择渠道,失败自动故障转移;
- **协议转换**:在 OpenAI / Claude / Gemini 三套线格式之间双向互转(含 SSE 流式);
- **账号运营**:余额追踪、自动签到(Check-in)、OAuth 会话管理;
- **可观测与治理**:全链路代理日志、调试追踪、用量聚合、托管下游 key 的细粒度访问策略。

**项目形态**:全栈 TypeScript(Fastify 后端 + React 18/Vite 前端),单仓库、单进程部署,打包为单一 Docker 容器。当前版本 `1.0.6`(MIT License)。

---

## 二、技术栈与核心依赖

### 2.1 运行时与语言

| 项 | 选型 | 说明 |
| --- | --- | --- |
| 运行时 | **Node ≥ 25**(`package.json` engines、`.nvmrc`) | 构建与运行目标均为 25+,README 中低版本描述已过时 |
| 语言 | **TypeScript 6**(strict),ESM(`"type": "module"`) | 三套 tsconfig:server(编译)、web(仅类型检查)、web.test |
| 包管理 | npm | 含 `overrides`(minimist 加固) |

### 2.2 后端

| 类别 | 依赖 | 说明 |
| --- | --- | --- |
| HTTP 框架 | **Fastify 5.11** + `@fastify/cors` + `@fastify/static` | 单进程服务,插件式组装 |
| 数据库 | **Drizzle ORM 0.45**(`drizzle-orm`)+ `better-sqlite3` / `mysql2` / `pg` | 一份 schema 三方言(经 drizzle `*-proxy` 驱动) |
| 迁移工具 | `drizzle-kit` 0.31 | 仅 SQLite 迁移;MySQL/PG 靠运行时 bootstrap |
| HTTP 客户端 | **undici 6.28**(fetch)、`ws` 8.21(WebSocket) | 上游调用与 Codex WebSocket 流 |
| 网络代理 | `socks` | 系统代理(SOCKS)支持 |
| 调度 | `node-cron` 4.2 + 原生 `setInterval` | cron 任务与循环调度器并存 |
| 校验/安全 | `zod` 4、`rate-limiter-flexible` | 负载契约校验、请求限流 |
| 工具 | `dotenv`、`minimist`、`minimatch`/`brace-expansion`(glob)、`marked`(Markdown 渲染) | — |

### 2.3 前端

| 类别 | 依赖 | 说明 |
| --- | --- | --- |
| UI 框架 | **React 18.3** + `react-dom` | — |
| 路由 | `react-router-dom` 7.15 | 全页面懒加载 |
| 构建 | **Vite 6** + `@vitejs/plugin-react` | `root: src/web`,输出 `dist/web` |
| 样式 | **Tailwind CSS v4**(`@tailwindcss/vite`) | 无 config 文件,`@import "tailwindcss"` + CSS 变量设计令牌 |
| 图表 | `@visactor/react-vchart` 2.x | 独立 vendor chunk |
| 拖拽 | `@dnd-kit/core` / `sortable` / `utilities` | 路由 / 通道排序 |

### 2.4 测试与工程化

| 项 | 说明 |
| --- | --- |
| 测试框架 | vitest 2.1 + jsdom + `react-test-renderer` |
| 测试规模 | 435 个测试文件,与源码同目录存放(`*.test.ts` / `*.test.tsx`) |
| 关键脚本 | `dev`(前后端并行)、`test`(完整 vitest,CI 入口)、`typecheck`、`build`(web + server)、`schema:generate`(db generate + schema contract)、`repo:drift-check`(架构债务 lint)、`smoke:db:sqlite/mysql/postgres`(真实库端到端) |
| CI | `.github/workflows/ci.yml` 共 7+ jobs:test-core、build-web、build-server、typecheck、repo-drift、schema-sqlite/mysql/postgres(真实 MySQL 8.4 / Postgres 16)、audit;另有 CodeQL、Docker 双架构(amd64/arm64)发布、PR labeler |

---

## 三、目录结构与模块划分

### 3.1 顶层布局

```
Canopy/
├── src/
│   ├── server/          # 后端(Fastify)
│   ├── shared/          # 前后端共享逻辑(手写 .js + .d.ts)
│   └── web/             # 前端(React 18 SPA)
├── drizzle/             # SQLite 迁移文件(28 个)
├── scripts/dev/         # 开发/工程脚本(schema contract、drift check、db smoke 等)
├── docs/                # 文档(本文件、DEPLOYMENT.md)
├── docker/              # Dockerfile、docker-compose.yml
├── data/                # 运行时数据目录(SQLite hub.db 等)
└── .github/workflows/   # CI
```

### 3.2 后端模块划分(`src/server/`)

| 目录 | 职责 |
| --- | --- |
| `index.ts` | 入口编排:DB 引导 → 运行时设置水合 → 兼容列补丁 → 路由注册 → 静态服务 → 调度器启动 → `onClose` 统一停止 |
| `config.ts` | 环境变量配置中心(~100 项:鉴权令牌、cron、路由权重、代理、调试开关、默认凭证判定) |
| `publicRoutes.ts` | `/api` 平面豁免清单(当前仅 `/api/oauth/callback/*`) |
| `routes/api/` | 管理平面:17 个业务域(sites、accounts、tokens、settings、oauth、stats、tasks、search 等) |
| `routes/proxy/` | 代理平面:11 个端点(chats、responses、models、files、gemini、videos 等)+ `router.ts` 统一注册 |
| `middleware/` | `auth.ts`(双平面鉴权)、`clientIp.ts`(IP 归一化/CIDR)、`requestRateLimit.ts`(限流) |
| `proxy-core/` | ★ 代理执行核心(见 3.3) |
| `services/` | ★ 业务服务层,172 个文件(见 3.4) |
| `transformers/` | 线格式转换:canonical 规范信封 ↔ openai / anthropic / gemini(见 3.5) |
| `db/` | Drizzle schema(25 表)、三方言 proxy 驱动、迁移、契约生成、兼容列补丁 |
| `contracts/` | 7 个 API 负载契约(zod schema) |
| `shared/` | 仅服务端内部共享(`codexClientFamily`、`modelBrand`、`logCleanupRetentionDays` 等) |

### 3.3 代理核心(`proxy-core/`)

| 子目录 | 职责 |
| --- | --- |
| `surfaces/` | ★ 端点编排层:chatSurface(1512 行)、openAiResponsesSurface、filesSurface、geminiSurface、modelsSurface 等。**协议逻辑必须在此层,禁止内联进 `routes/proxy/*`**(由 `architecture-boundaries.test.ts` 强制) |
| `orchestration/endpointFlow.ts` | 驱动一次上游尝试:首字节超时观测、恢复(tryRecover)、跨协议降级、中止策略、重试链 |
| `conductor/` | `DefaultProxyConductor`、重试策略、流终止、用量钩子 |
| `executors/` | 按上游运行时区分:claudeExecutor / codexExecutor / geminiCliExecutor / antigravityExecutor |
| `providers/` | 各上游 provider profile 与 registry |
| `cliProfiles/` | 下游 CLI 客户端画像:claudeCodeProfile / codexProfile / geminiCliProfile(header 仿真、会话语义) |
| `capabilities/` | conversationFile、responsesCompact 等能力判定 |
| 其他 | `channelSelection`、`downstreamClientContext`(客户端识别)、`firstByteTimeout`、`serviceTierPolicy`、`webSearchSimulation` |

### 3.4 业务服务层(`services/`,172 文件)

- **路由引擎**:`tokenRouter.ts`(3850 行,单例,选渠道/熔断/冷却/可审计决策)、`routeRefreshWorkflow`、`routeCooldownService`、`routeDecisionRefreshService` + `routeDecisionSnapshotStore`、`routeRoutingStrategy`;
- **平台适配器**:`platforms/` 14 个适配器(见 3.6);
- **OAuth 运行时**:`oauth/`(本地回环回调服务器、4 家 provider 运行时、配额、刷新调度器、sessionStore);
- **账号运营**:checkin 调度/服务、balance 刷新、账号健康、今日奖励、凭证加密;
- **代理支持**:proxyChannelCoordinator(粘性会话/并发租约)、proxyChannelRetry、proxyFailureJudge、proxyUsageParser、proxyLogStore、proxyFileStore、proxyVideoTaskStore、proxyBilling、proxyDebugTrace*;
- **统计与快照**:usageAggregationService(投影)、adminSnapshotWarm/Store、dashboardSnapshot、siteStatsSnapshot;
- **通知**:notifyService(Webhook / Bark / Telegram)、alertRules、notificationThrottle;
- **下游密钥**:downstreamApiKeyService、downstreamApiKeyTrendService;
- **站点与模型**:siteDetector、siteProxy、modelService(发现/禁用/重匹配)、modelPricingService、modelAvailabilityProbeService、channelRecoveryProbeService;
- **运维**:backupService(WebDAV)、factoryResetService、databaseMigrationService、logCleanupService、proxyFile/LogRetentionService、siteApiKeyMigrationService(旧数据迁移)、storedTimestampRepairService(历史欠账修复)。

### 3.5 转换器(`transformers/`)

```
transformers/
├── canonical/       # ★ 规范信封:envelope.ts / types.ts / tools.ts / reasoning.ts
│                    #   continuationBridge(Claude 连续会话)、attachments、openAiRequestBridge
├── openai/          # chat/ + responses/ 两个协议族
├── anthropic/       # messages/
├── gemini/          # generate-content/
└── shared/          # 格式无关辅助:chatEndpointStrategy、endpointCompatibility、
                     #   inputFile、normalized、protocolLifecycle、protocolModel、
                     #   reasoningTransport、thinkTagParser、toolNameShortener
```

**设计要点**:所有下游格式先归一为 canonical 信封,再分派到四个转换器族——这是"OpenAI 下游调 Claude 上游"可行的根本。每个转换器族含 inbound / outbound / requestBridge / responseBridge / stream / streamBridge / usage 等子模块。

### 3.6 平台适配器(`services/platforms/`)

统一实现 `PlatformAdapter` 接口(`base.ts`):模型枚举、余额、令牌管理,以及(支持的)登录 / 签到 / 用户信息。

注册顺序(`index.ts`)— **顺序即自动检测优先级,特定 fork 在前、通用适配器在后**:

```
OpenAI → Codex → Claude → Gemini → Gemini CLI → Antigravity → CliProxyApi
→ AnyRouter → DoneHub → OneHub → Veloera → NewApi → Sub2Api → OneApi
```

检测策略(`detectPlatform`):**URL 提示 → 站点标题提示(仅 titleFirst 平台)→ 逐适配器 `detect()` 探测 → 标题提示兜底**。平台别名归一化在 `src/shared/platformIdentity`(`normalizePlatformAlias`,如 `wong-gongyi → new-api`)。

### 3.7 共享层(`src/shared/`)— 一个关键约定

> **⚠️ 跨端共享代码必须以 `.js` + 手写 `.d.ts` 编写,不能是 `.ts`。**

原因:项目有两条独立构建链——server 走 `tsc(NodeNext)`,`src/shared` 不在其 include 范围;web 走 Vite bundler 直接消费源码。采用 `.js`(ESM 源码)+ `.d.ts`(手写类型)后,两条链路都能零构建直接消费,且 TS 解析自动找到同目录 `.d.ts`。

| 文件 | 用途 |
| --- | --- |
| `platformIdentity.js/.d.ts` | 平台别名归一化 + URL 提示检测 |
| `sitePrimaryUrl.js/.d.ts` | 站点主 URL 规范化(剥离 API 后缀、保留语义路径) |
| `siteInitializationPresets.js/.d.ts` | 内置 13 套站点点位预设 |
| `tokenRoutePatterns.js/.d.ts` | 模型 pattern 匹配:精确 / glob / `re:` 正则(含 ReDoS 防护与 LRU) |
| `tokenRouteContract.js/.d.ts` | 路由决策类型契约 |
| `proxyLogMeta.js/.d.ts` | 代理日志元数据解析(客户端 / 会话 / 用量标签提取) |
| `conversationFileTypes.js/.d.ts` | 对话文件 MIME 分类与 accept 列表 |
| `apiKeyBatch.ts` | 批量粘贴 accessToken 解析(桥接 server 内部工具) |

---

## 四、核心数据流

### 4.1 端到端请求链路(以 `POST /v1/chat/completions` 为例)

```
① 下游客户端(Cursor / Claude Code / Codex)
   │  Authorization: Bearer <托管 key | 全局 PROXY_TOKEN>
② routes/proxy/router.ts:proxyAuthMiddleware(onRequest 钩子,覆盖全部 /v1/* 路由)
   │  → authorizeDownstreamToken:先查托管 downstream_api_keys,再比对全局 token
   │  → 将 DownstreamRoutingPolicy(模型/路由/站点黑白名单)附加到请求上下文
③ routes/proxy/chat.ts —— 薄层,仅注册路径,不含协议逻辑
④ proxy-core/surfaces/chatSurface.ts:handleChatSurfaceRequest(request, reply, 'openai')
   │  a. detectDownstreamClientContext —— 识别下游客户端家族 + sessionId
   │  b. openAiChatTransformer.transformRequest(body) → canonical 规范信封
   │  c. ensureModelAllowedForDownstreamKey —— 下行策略校验(模型是否被 key 允许)
   │  d. 输入文件解析(resolveOpenAiBodyInputFiles,会话内 file 引用 → 真实内容)
   │  e. 派生 sticky session key / codex session cache key / 调试追踪 trace
   │  f. while (retryCount <= maxRetries):
   │       - sticky 通道偏好(会话级粘性,默认开启)
   │       - tokenRouter.selectChannel(模型, 下行策略) → RouteDecisionExplanation
   │       - 按 runtime executor(claude/codex/gemini-cli/antigravity/默认)构建上游请求
   │       - executeEndpointFlow(候选端点列表):
   │           首字节超时观测 → 成功即返回
   │           失败 → tryRecover(协议恢复) → shouldDowngrade(跨协议降级:
   │                   OpenAI chat → Claude messages → Gemini) → 中止策略
   │                   → 记录失败 + 触发冷却
   │  g. 成功路径:transformFinalResponse(上游 JSON → canonical → 下游格式)
   │       流式:proxyStream(SSE 会话:上游 chunk → 转写为下游 SSE 事件流)
   │  h. 记账:成功/失败计数、延迟、token 用量、估算成本
   │       → proxy_logs + 熔断器状态 + sticky 绑定更新
⑤ 上游:undici fetch → 聚合站 /v1/* 或 OAuth 直连 → 响应(SSE / JSON)流回下游
```

### 4.2 路由选择算法(`tokenRouter.ts`)

1. **候选过滤**:匹配模型 pattern(精确 / glob / 正则,`matchesModelPattern`)→ 应用下行策略(supportedModels / allowedRouteIds / excludedSiteIds / excludedCredentialRefs)→ 排除站点熔断(运行时电路断路器)与最近失败冷却中的通道;
2. **评分**:`valueScore = costWeight×(1/unitCost) + balanceWeight×balance + usageWeight×(1/recentUsage)`,归一化后与通道手动权重合成贡献分,并做**同站点通道数量惩罚**(避免一个站点的多条通道垄断);
3. **加权随机选取**:按贡献占比(软概率)随机,同时并入运行时健康倍数(成功率/延迟/置信度)与历史健康倍数;
4. **可审计性**:`RouteDecisionExplanation` 记录每个候选的权重、成本来源(观察/配置/目录/默认)、健康详情、负载、概率与理由文本,持久化为 `decisionSnapshot`,前端 TokenRoutes 页可逐条解释;
5. **模式**:`weighted`(加权随机)、`stable_first`(稳定优先,近期成功率优先)、`round_robin` 等,按 `routingStrategy` 选择。

### 4.3 会话一致性(sticky session)

- `proxyChannelCoordinator` 维护 `stickySessionBindings`(TTL 30min,可配):同一会话(按下游客户端 sessionId + 模型 + 路径 + key 派生)在 TTL 内固定同一通道,保证 Claude Code 多轮对话上下文连续;
- 每通道并发租约:`concurrencyLimit`(默认 2)+ 等待队列 + 租约 keepalive,避免单一账号被并发打爆。

### 4.4 关键设计内涵

- **canonical 中间态**:下游格式归一 → 路由 → 上游格式,四路转换器族配合 `endpointCompatibility` 的端点策略(协议候选降级链),是"OpenAI 客户端调 Claude 上游、Claude 客户端调 OpenAI 上游"互通的根基;
- **端到端可观测**:每个请求可落入 `proxy_debug_traces` / `proxy_debug_attempts`(默认关闭,按需开启),记录决策摘要、候选端点、每次尝试的头部/体/状态与降级决策;
- **计费三层**:上游/自测用量解析 → 估算成本写入 `proxy_logs.billing_details` → 投影器增量写入日 / 小时 / 模型聚合表。

---

## 五、数据库模型与迁移策略

### 5.1 表结构总览(25 张表,`db/schema.ts` 557 行)

| 域 | 表 | 关键字段 / 说明 |
| --- | --- | --- |
| 站点 | `sites` | platform + url 唯一约束;代理 URL、自定义头、状态、pin、排序、探测配置 |
| 站点 | `site_api_endpoints` | 每站点多端点:启停、排序、冷却、上次选择/失败 |
| 站点 | `site_disabled_models` | 站点级禁用模型 |
| 账号 | `accounts` | 余额/已用/配额/单位成本/价值分;OAuth 身份(provider/key/project);`extra_config` JSON |
| 账号 | `account_tokens` | 会话令牌:分组、默认标记、来源(manual/sync/legacy)、value 状态 |
| 账号 | `checkin_logs` | 签到结果与奖励 |
| 账号 | `model_availability` / `token_model_availability` | 模型可用性探测结果(手动标记、延迟) |
| 路由 | `token_routes` | 模型 pattern、路由模式、模型映射 JSON、决策快照、路由策略 |
| 路由 | `route_group_sources` | 组路由 ↔ 源路由 |
| 路由 | `oauth_route_units` / `oauth_route_unit_members` | OAuth 轮转单元与成员(成功率/延迟/成本/冷却统计) |
| 路由 | `route_channels` | ★ 通道:权重、优先级、成功/失败/延迟/成本计数、连续失败、冷却等级 —— 路由引擎的运行状态载体 |
| 痕迹 | `proxy_logs` | 请求/响应模型、状态、HTTP 码、流标志、首字节/总延迟、token、估算成本、billing JSON、客户端画像(家族/App/置信度) |
| 痕迹 | `proxy_debug_traces` + `proxy_debug_attempts` | 全链路调试追踪(决策摘要、候选端点、每次尝试详情) |
| 痕迹 | `proxy_video_tasks` / `proxy_files` | 视频任务轮询、文件存储(base64 + sha256,软删除) |
| 用量 | `site_day_usage` / `site_hour_usage` / `model_day_usage` | 聚合表,均带非负 CHECK 约束 |
| 用量 | `analytics_projection_checkpoints` | 投影水位线 + 租约(owner/token/过期)+ 重算请求 |
| 配置 | `settings` | KV 表(值存 JSON 字符串) |
| 配置 | `downstream_api_keys` | 托管下游 key:策略字段(JSON)、配额、用量、过期 |
| 配置 | `admin_snapshots` | 快照缓存(namespace + key,过期/陈旧标记) |
| 通知 | `site_announcements` / `events` | 公告(去重 by site+sourceKey)、程序事件流(已读标记、关联对象) |

### 5.2 迁移与方言策略

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│  SQLite(一等公民)            │     │  MySQL / PostgreSQL           │
│  · drizzle-kit 迁移(drizzle/) │     │  · 无官方迁移链                │
│  · db:migrate + 恢复循环      │     │  · runtimeSchemaBootstrap 建库 │
│  · migrate.ts 处理重复列/冲突  │     │  · 启动时兼容列补丁             │
└─────────────────────────────┘     │    (ensure*CompatibilityColumns)│
        │                            └──────────────────────────────┘
        ▼                                        ▲
┌─────────────────────────────────────────────────────────────┐
│  Schema 契约层(schemaContract.ts + schemaArtifactGenerator) │
│  · 从 SQLite 迁移生成「方言无关契约」(db/generated/schemaContract.json)│
│  · 生成 MySQL/PG 的 bootstrap.sql / upgrade.sql 产物          │
│  · 测试:parity(三方言一致)/ upgrade(旧库升级)/ runtime(bootstrap) │
│  · 修改 schema.ts 后必须运行 npm run schema:generate           │
└─────────────────────────────────────────────────────────────┘
```

关键机制:

1. **运行时换库**:`switchRuntimeDatabase` 支持在设置页运行时切换方言/URL;配置持久化到 settings,启动时重放,失败自动回滚到原库(`index.ts` 的 `extractSavedRuntimeDatabaseConfig` 逻辑);
2. **兼容列补丁**:`ensure*CompatibilityColumns` / `ensure*Column` 系列在启动时对旧库增量 `ALTER TABLE`,而非只依赖迁移文件——这是老实例平滑升级的核心;
3. **契约生成**:`schema:generate` = `db:generate`(drizzle-kit)+ `schema:contract`(生成契约与方言 SQL);CI 对真实 MySQL 8.4 / Postgres 16 运行 parity / upgrade / runtime 三组测试;
4. **方言细节补丁**:`postgresJsonTextParsers.ts`(PG JSON 文本解析)、`schemaMetadata` / `legacySchemaCompat` / `sharedIndexSchemaCompatibility` 等处理各代历史遗留。

---

## 六、认证与安全模型

### 6.1 双平面鉴权(`middleware/auth.ts`)

| 平面 | 路由 | 中间件 | 凭据 | 附加约束 |
| --- | --- | --- | --- | --- |
| 管理面 | `/api/*` | `authMiddleware` | Bearer `AUTH_TOKEN`(默认 `123456`) | `ADMIN_IP_ALLOWLIST`(精确 IP / CIDR);`isPublicApiRoute` 豁免(仅 `/api/oauth/callback/*`) |
| 代理面 | `/v1/*` | `proxyAuthMiddleware` | Bearer / `x-api-key` / `x-goog-api-key` / `?key=` | 命中托管 key → 应用 `DownstreamRoutingPolicy`;否则比对全局 `PROXY_TOKEN`(默认 `sk-change-me`) |

### 6.2 托管下游 key 与访问策略

`downstream_api_keys` 表 + `DownstreamRoutingPolicy` 类型(`downstreamPolicyTypes.ts`):

```typescript
interface DownstreamRoutingPolicy {
  supportedModels: string[];        // glob 模式,如 "claude-*"
  allowedRouteIds: number[];        // 允许的路由
  excludedSiteIds: number[];        // 排除的站点
  excludedCredentialRefs: Array<    // 精确到 站点/账号/令牌 级的排斥
    { kind: 'account_token'; siteId; accountId; tokenId }
    | { kind: 'default_api_key'; siteId; accountId }
  >;
  denyAllWhenEmpty?: boolean;       // 策略为空时是否一律拒绝
}
```

- 每次 `/v1/*` 请求经 `consumeManagedKeyRequest` 计数(已用请求数、已用成本,可设 `maxCost` / `maxRequests` / `expiresAt`);
- 模型允许性最终在 surface 层以 `isModelAllowedByPolicyOrAllowedRoutes` 校验——将"一个 key 全站可见"收敛为"按 key 最小授权"。

### 6.3 其他安全措施

- **IP 可信边界**:`trustProxy` 仅在显式配置 `TRUSTED_PROXY` 列表后开启,否则不信任 `X-Forwarded-*`,杜绝伪造来源 IP(`clientIp.ts` 含归一化与 CIDR 匹配);
- **凭证加密**:`ACCOUNT_CREDENTIAL_SECRET` 加密上游账号密码;未显式设置时首启动生成并持久化强密钥,回退默认值时启动警告;
- **请求防护**:`requestBodyLimit` 20MB、rate-limiter-flexible 限流中间件、CORS 默认开启;
- **默认凭证告警**:启动时检测 `AUTH_TOKEN=123456`、`PROXY_TOKEN=sk-change-me`、凭证密钥回退三种情况并输出醒目警告(`index.ts`);
- **进程韧性**:拦截 `unhandledRejection` / `uncaughtException` 避免单次瞬时 DB 错误(如 `SQLITE_BUSY`)杀死整个服务(代码内有明确注释说明取舍);
- **供应链**:CI 运行 `npm audit`(生产依赖,PR 保持 informational)+ CodeQL。

---

## 七、定时任务与后台调度

统一在 `index.ts` 启动、`onClose` 钩子停止(所有 `stop*` 成对出现)。

### 7.1 cron 任务(`node-cron`)

| 任务 | 默认节奏 | 职责 |
| --- | --- | --- |
| 自动签到 | `CHECKIN_CRON` 默认 `0 8 * * *`(可切换 interval 模式) | 各站点账号每日签到,含防重试/频率控制 |
| 余额刷新 | `BALANCE_REFRESH_CRON` 默认 `0 * * * *` | 刷新账号余额 |
| 每日汇总 | 每日 | 日报摘要(生成通知) |
| 日志清理 | `LOG_CLEANUP_CRON` 默认 `0 6 * * *` | 清理过期日志 |
| WebDAV 备份 | 可配 `autoSyncCron` | 备份/还原到 WebDAV |

### 7.2 循环调度器(`setInterval`)

| 调度器 | 间隔 | 职责 |
| --- | --- | --- |
| 站点公告轮询 | 15 min | 拉取上游公告,去重入库并生成通知 |
| 模型可用性探测 | 默认 30 min(可配) | 对模型/令牌做探测,更新 `model_availability` |
| 渠道恢复探测 | 30 s | 扫描冷却/熔断中的通道,尝试恢复 |
| sub2api 托管刷新 | 60 s(单飞 singleflight 防并发) | 刷新 sub2api 托管配置 |
| 用量投影 | 5 s | 按水位线增量聚合 proxy_logs → 日/小时/模型表(带租约) |
| admin 快照预热 | 20 s | 预热仪表盘快照缓存 |
| OAuth 令牌刷新 | 60 s | 刷新 OAuth access token |
| 代理日志保留清理 | 30 min | 按保留天数清理 proxy_logs |
| 代理文件保留清理 | 60 min | 清理过期 proxy_files |

### 7.3 启动即执行与按需任务

- 启动序列:`ensureRuntimeDatabaseReady` → 设置水合 → 兼容列补丁 → 凭证密钥确保 → `migrateSiteApiKeysToAccounts`(旧数据迁移)→ `ensureDefaultSitesSeeded` → OAuth 身份回填 → `routeRefreshWorkflow.rebuildRoutesOnly()`(重建路由表);
- 按需任务:`routeRefreshWorkflow` 支持后台任务式模型刷新与路由重建(前端触发);长耗时操作(迁移/探测/重建)走"任务 + 事件轮询"模式。

---

## 八、前端架构

### 8.1 总体形态

- **SPA 单包**:React 18 + React Router 7;**16 个页面全部 `React.lazy` + Suspense**;
- **构建**:Vite(`root: src/web`,输出 `dist/web`);dev 模式经 vite proxy 指向后端(默认 `:4000`);
- **生产整合**:Fastify `@fastify/static` 伺服 `dist/web`,SPA fallback 排除 `/api/` 与 `/v1/`;assets 目录 immutable 强缓存、index.html no-cache。

### 8.2 路由表(`App.tsx`)

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | Dashboard | 仪表盘:余额/用量/站点分布/趋势/模型分析(VChart),30s 轮询 |
| `/sites` | Sites | 站点 CRUD、平台自动识别、模型探测(SSE 流)、重建路由 |
| `/site-announcements` | SiteAnnouncements | 公告同步/已读 |
| `/accounts` | Accounts | 账号管理:令牌、校验、批量操作、OAuth 导入、批量解析粘贴 token |
| `/oauth` | OAuthManagement | OAuth 授权/配额/轮转单元 |
| `/tokens` | Tokens | 账户令牌管理(分组/默认标记) |
| `/checkin` | CheckinLog | 签到记录与调度配置 |
| `/routes` | TokenRoutes | 模型路由:pattern、群组、拖拽排序、决策概率解释 |
| `/logs` | ProxyLogs | 使用日志:分页/筛选/详情/调试追踪,可开 2s 自动刷新 |
| `/settings` | Settings | 系统设置:令牌、运行时配置、数据库切换/迁移、备份(WebDAV)、工厂重置 |
| `/downstream-keys` | DownstreamKeys | 托管下游 key:策略、配额、趋势图 |
| `/events` | ProgramLogs | 程序事件日志 |
| `/settings/import-export` | ImportExport | 导入/导出备份 |
| `/settings/notify` | NotificationSettings | Webhook / Bark / Telegram 通知 |
| `/models` | Models | 模型广场:市场目录、价格、刷新任务 |
| `/playground` | ModelTester | 模型操练场:流式测试、job 模式、debug 面板 |
| `/about` | About | 关于与文档 |

### 8.3 数据获取与状态管理

- **无状态管理库**:全项目无 React Query / SWR / Zustand / Redux / Jotai。全局状态仅 React Context(`I18nProvider`、`ToastProvider`)+ localStorage(`authSession` 12h TTL、`appLocalState` 主题/资料);
- **数据获取模式**:顶层 `api.ts` 单例 + 页面内 `useState/useEffect/useCallback` + 局部轮询(Dashboard 30s、Events 15s、ProxyLogs 2s 可开关);
- **`api.ts`(1455 行)**:唯一 API 客户端——统一 Bearer 注入、30s 默认超时(长任务 120–150s)、错误信息提取(401/403 自动回登录页)、手写 SSE 解析器(`streamSse`)、40 个导出按业务域分组;
- **后台任务驱动**:刷新路由(带 `wait` 长请求)、切库/迁移(测试 → 迁移 → 更新配置 → reload)、站点探测(SSE 流)、模型测试(job + 状态轮询)、OAuth(授权 URL + 回调端口 + session 轮询)。

### 8.4 UI 与工程

- **样式**:Tailwind v4(无配置文件,`@import "tailwindcss"` + CSS 变量设计令牌 + `data-theme="dark"` 暗色);
- **图表**:VChart(`manualChunks` 独立分包,`vchartCompatibility.ts` 运行时适配);
- **共享组件**:`components/` 聚焦移动端适配(`useIsMobile`、MobileDrawer、MobileFilterSheet、Responsive* 系列)与通用模态(Toast、CenteredModal、ModernSelect、SearchModal);
- **i18n**:自研方案——中文短语硬映射表 + MutationObserver 全站文本替换(zh↔en),`i18n.tsx` + `i18n.supplement.ts`;
- **测试**:约 160 个前端测试文件(含大量 mobile-layout、交互、architecture 约束测试),jsdom 环境。

---

## 九、设计亮点与潜在架构风险

### 9.1 设计亮点

1. **双平面 + 元聚合的清晰边界**:管理面(`/api`)与代理面(`/v1`)物理隔离;代理核心与 HTTP 薄层分离,且由**源码级架构测试**(`architecture-boundaries.test.ts` 直接读源文件断言 import 关系)与 `repo:drift-check`(import 白名单、违规模板)双重强制——这是长期可维护性的根本;
2. **canonical 信封 + 四路转换器**:一套中间态打穿 OpenAI / Claude / Gemini 双向互调,含 SSE 流式转写、工具名缩短、think-tag 解析、reasoning 传输,跨协议复杂度被有序收纳;
3. **可审计路由引擎**:`RouteDecisionExplanation` 记录每个候选通道的权重/成本来源/余额/利用率/运行健康/历史健康/概率明细并持久化快照——"为什么选它"完全可解释,前端可视化呈现;
4. **一 schema 三方言的工程解法**:方言无关契约 + 生成 bootstrap/upgrade SQL + CI 真实库 parity 测试 + 启动兼容列补丁,比"三套 schema 各管各"严谨得多;
5. **韧性工程**:熔断器、失败冷却、首字节超时、跨协议降级链、sticky session、通道并发租约、进程崩溃防护、单飞并发控制,层层防御;
6. **测试即架构**(约 445 文件):架构边界、schema parity、运行时换库、方言行为、交互细节全有测试背书;CI 七 job 把关;
7. **运维闭环**:OAuth 本地回环回调、WebDAV 备份、admin 快照预热、全链路 debug trace、启动默认凭证警告——聚合站运维痛点覆盖较全。

### 9.2 潜在架构风险与债务

| # | 风险/债务 | 说明 | 建议方向 |
| --- | --- | --- | --- |
| 1 | **巨型文件集中复杂度** | `tokenRouter.ts` 3850 行、`chatSurface.ts` 1512 行、`api.ts` 1455 行、`Accounts.tsx` 3495 行、`ProxyLogs.tsx` 3600 行 | 边界虽清晰,但单文件内控制流(重试循环 × 降级链 × 粘性会话交织)难以穷尽测试;可按职责拆分(如选择算法 / 冷却状态机独立成服务) |
| 2 | **settings KV + JSON 字符串存储** | `settings` 为 `(key, value JSON)`;`extra_config` / `billing_details` / `payload` 等大量 TEXT JSON 列 | 无列级约束,运行时水合(zod)是唯一防线;查询与迁移受限。可对高频字段升级为正规列或引入 JSON Schema 校验 |
| 3 | **三方言长期漂移风险** | SQLite 是唯一正式迁移链;MySQL/PG 依赖生成 SQL + 兼容列补丁;PG 需 `postgresJsonTextParsers` 等方言补丁 | 每次 schema 变更必须同步跑通契约/parity/upgrade 三套测试;建议将契约校验纳入 `schema:generate` 的 CI 强制门禁 |
| 4 | **"不崩溃"策略的双刃剑** | 进程级吞掉 unhandled rejection 保证可用性 | 可能掩盖内存泄漏与状态不一致(如路由表半更新);建议补充指标化异常率告警,而非仅 console.error |
| 5 | **轮询式前端** | 2s 自动刷新 ProxyLogs + 多页面独立轮询 | 高流量下 `/api` 压力与 N+1 请求风险;无 SWR 级缓存去重;可评估引入轻量数据缓存层 |
| 6 | **定时器与 DB 竞争** | 多个 setInterval 调度器并发写 SQLite(`SQLITE_BUSY` 仅靠崩溃防护兜底) | 未见写队列/锁机制;可评估 Drizzle 批量写 + 重试退避,或对高频投影器做背压 |
| 7 | **默认凭证与硬编码上游值** | 默认 `AUTH_TOKEN=123456`;`GEMINI_CLI_CLIENT_SECRET` 等公共默认值硬编码于 `config.ts` | 默认凭证有启动警告,但硬编码上游 client secret 若上游轮换即失效;建议全部走环境变量并文档化 |
| 8 | **TEXT 时间戳存储** | 全库 `datetime('now')` UTC 字符串(非 timezone 类型) | 跨时区排序、索引效率、方言格式一致性需 `storedTimestampRepairService` 与投影水位线持续补丁兜底;属早期设计欠账 |

---

## 附录:关键术语

| 术语 | 含义 |
| --- | --- |
| 站点(Site) | 一个上游聚合面板/直连提供方(如某 New API 实例),由 `platform` 区分类型 |
| 账号(Account) | 站点下的一个登录账号,持有余额与令牌 |
| 令牌(Token) | 账号下的会话/API 令牌,可分组、设默认 |
| 路由(Route) | 模型 pattern → 可选渠道集合的映射(精确 / glob / 正则 / 群组) |
| 通道(Channel) | 路由下的一条实际可选路径(账号 × 令牌),携带权重与健康统计 |
| 下游(Downstream) | 使用 Canopy 统一端点的客户端(Cursor / Claude Code / Codex) |
| 托管 key | 管理员在 Canopy 创建的下游访问密钥,带访问策略与配额 |
| canonical 信封 | 格式无关的请求中间态,是跨协议转换的中枢 |
| 决策快照 | 路由选择结果(含每个候选的权重与概率)的持久化记录 |
| 熔断 / 冷却 | 通道失败后的临时禁用机制(站点级熔断 + 通道级冷却) |
| sticky session | 会话级粘性:同一下游会话 TTL 内固定同一通道 |

---

*文档版本:1.0(2026-08-22)*
*对应代码版本:Canopy 1.0.6*
*后续维护:修改 `src/server/db/schema.ts` 后请同步更新本文第五章;路由权重算法变更请同步 4.2 节。*
