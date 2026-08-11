<div align="center">

<img src="docs/logos/logo-full.png" alt="Metapi" width="240">

# Metapi（私有 fork）

**个人自用 · AI 中转站元聚合网关**

把多个 AI 中转站（New API / One API / Sub2API 等）聚合为**一个入口、一个 Key**，
自动发现模型、智能路由、余额跟踪、自动签到。

<p align="center">
  <a href="README.md"><strong>中文</strong></a> ·
  <a href="README_EN.md">English</a>
</p>

</div>

---

## ⚠️ 说明

这是 **Metapi 的私有二次开发 fork**，仅用于**个人自用**，不对外分发。

- 本项目在原 Metapi 基础上持续自行维护，不依赖上游更新。
- 已移除更新中心（版本轮询 / 部署 / 回退 / 部署日志）子系统，不依赖上游镜像或版本源。
- 更新与维护由本人负责，在本地改完后自行打包镜像推送。

---

## 为什么用 Metapi

现在 AI 生态有大量基于 New API / One API 系列的聚合中转站。用 Metapi，
可以把它们统一成一个入口，下游所有工具（Cursor、Claude Code、Codex 等）
只需配置一个 `/v1/*` 地址 + 一个 Key。

| 痛点 | Metapi 的解决 |
| --- | --- |
| 🔑 每个站点一个 Key，工具配一堆 | **统一代理入口**，模型自动聚合到 `/v1/*` |
| 💸 不知道哪个站用某模型最便宜 | **智能路由**，按成本 / 余额 / 使用率选最优通道 |
| 🔄 站点挂了手动切换很麻烦 | **自动故障转移**，失败自动冷却并切换 |
| 📊 余额分散不知道还剩多少 | **集中看板**，一目了然 |
| ✅ 每天去各站签到领额度 | **自动签到** 定时执行 |
| 🤷 不知道哪个站有什么模型 | **自动模型发现**，新增模型零配置出现 |

---

## 快速开始（Docker）

```bash
git clone https://github.com/WxylkxyZz/metapi.git && cd metapi/docker

# 设置 AUTH_TOKEN（管理后台登录令牌）与 PROXY_TOKEN（下游 /v1/* 令牌）
cp .env.example .env
# 编辑 .env 填入你的 AUTH_TOKEN 与 PROXY_TOKEN

docker compose build   # 本地构建镜像（不拉取上游镜像）
docker compose up -d
```

启动后访问 `http://localhost:4000`，用 `AUTH_TOKEN` 登录即可。

> [!IMPORTANT]
> 请务必修改 `AUTH_TOKEN` 和 `PROXY_TOKEN`，不要使用默认值。数据存储在 `./data` 目录。

---

## 本地开发

```bash
npm install
npm run db:migrate     # 初始化数据库
npm run dev            # 前后端热更新（后端 :4000 + 前端 :5173）
```

```bash
npm test               # 运行全部测试
npm run typecheck      # 类型检查（web / server / desktop）
npm run repo:drift-check  # 架构 / 债务红线检查
npm run build          # 构建前端 + 后端
```

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Fastify（Node.js） |
| 前端 | React 18 + Vite |
| 语言 | TypeScript |
| 样式 | Tailwind CSS v4 |
| 数据库 | SQLite / MySQL / PostgreSQL + Drizzle ORM |
| 数据可视化 | VChart |
| 定时任务 | node-cron |
| 容器化 | Docker + Docker Compose |
| 测试 | Vitest |

---

## 数据与隐私

完全自托管，所有数据（账号、令牌、路由、日志）均存储在本地数据库中，
不会向任何第三方发送数据。代理请求仅在你的服务器与上游站点之间直连传输。

---

## License

[MIT](LICENSE)