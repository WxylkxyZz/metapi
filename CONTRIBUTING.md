# Contributing / 贡献指南

感谢您对 **Canopy** 的关注！

Canopy 是 AI API 聚合平台（New API、One API、OneHub 等）的元聚合层，提供统一代理、智能路由和集中管理。

> 本仓库目前主要由作者（WxylkxyZz）个人维护，用于私人自托管部署。欢迎以 issue 或 PR 的方式提交缺陷修复与改进建议，但请注意功能演进以作者个人使用需求为准。

## 开始之前

- 在提交 PR 前，先查看现有 [Issues](https://github.com/WxylkxyZz/canopy/issues) 是否已有重复讨论。
- 对重大改动，先开 issue 说明动机与方案，避免无效劳动。

## 本地开发

```bash
npm install
npm run db:migrate
npm run dev          # 后端 :4000 + 前端 :5173
```

## 提交规范

- 提交信息使用中文，简述改动与理由。
- 每次提交保持小粒度、可独立回滚。
- 提交前运行 `npm test` 与 `npm run typecheck`。

### 架构红线

- `/api/*`（管理面）与 `/v1/*`（代理面）两个认证平面不要混淆。
- 协议处理逻辑放在 `proxy-core/surfaces/`，不要在 `routes/proxy/*.ts` 内联。
- `src/shared/` 以 `.js` + `.d.ts` 编写，不要改回 `.ts`。
- 改 `schema.ts` 后必须运行 `npm run schema:generate`。
- 提交前运行 `npm run repo:drift-check`，必须保持绿色。

## 发布 / 发版

发布流程 = 抬版本号 → 打轻量 tag → push tag 触发 Docker 镜像自动构建发布（`docker-publish` workflow，Docker Hub + GHCR 双推，amd64/arm64 双架构），再创建 GitHub Release 页。

```bash
# 1. 确认在 main 且工作区干净
git checkout main && git status --short

# 2. 抬版本号：改 package.json 的 version 字段
#    git commit -m "chore: bump version to X.Y.Z"   （沿用既有惯例）

# 3. 打轻量 tag 并推送（v 前缀，与历史 v1.0.5 等一致）
git tag vX.Y.Z
git push origin vX.Y.Z   # 触发 docker-publish；同 workflow 也会更新 latest

# 4. 创建 GitHub Release 页（展示层，让主页 / Releases 页可见说明）
gh release create vX.Y.Z --target main --title "vX.Y.Z — <一句话主题>" --notes-file <notes 文件>
```

注意事项：

- tag 用**轻量 tag**（`git tag vX.Y.Z`，不带 `-a`），与历史一致。tags 页只有 tag 名，**Release 页才是说明展示层**——两者独立，漏建 Release 页不影响镜像发布，但建议都做。
- push tag 会同时触发 CI、CodeQL、Docker Publish 三个 workflow；Docker Publish 的 Verify job 会重跑 `npm test`，失败可在 Actions 页用 `gh run rerun` 重跑（部分用例有已知的 pre-existing timing flaky）。

Release notes 模板（参考 v1.0.6）：

```markdown
# vX.Y.Z — <主题>

## 变更
- <功能 / 修复 A>
- <功能 / 修复 B>

## 📦 镜像
- Docker Hub: wxylkxyzz/canopy:vX.Y.Z（同时更新 latest）
- GHCR: ghcr.io/wxylkxyzz/canopy:vX.Y.Z
- 架构: linux/amd64 + linux/arm64
- 部署：启动时自动应用新增迁移

## ✅ 验证
- 全量测试 / typecheck / drift-check 结果
- GitHub Actions：CI、CodeQL、Docker Publish 状态
```

## License

[MIT](LICENSE) © 2026 WxylkxyZz