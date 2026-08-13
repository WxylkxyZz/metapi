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

## License

[MIT](LICENSE) © 2026 WxylkxyZz